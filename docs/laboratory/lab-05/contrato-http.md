# Base HTTP de la API

`configureHttp()` aplica la misma configuración a producción (`main.ts`) y a
las aplicaciones de integración. No carga configuración de bases de datos.

## Rutas y validación

Los recursos utilizan `/api/v1`. Las rutas existentes de productos pasan a
`GET /api/v1/products` y `POST /api/v1/products`; `/products` deja de existir.
Se conserva `GET /api/database/health` mediante una exclusión explícita del
prefijo, sin cambiar su consulta ni crear `/api/v1/api/database/health`.

El `ValidationPipe` mantiene `whitelist: true`, `forbidNonWhitelisted: true`
y `transform: true`: valida DTOs, rechaza propiedades desconocidas y transforma
el cuerpo a su clase. No reemplaza las validaciones internas de negocio.

## Problem Details

El filtro global responde con `Content-Type: application/problem+json` y:

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "La solicitud contiene datos no válidos.",
  "instance": "/api/v1/products",
  "errors": ["nombre must be a string"]
}
```

Los cinco primeros campos siempre están presentes. `errors` es una extensión
para listas de mensajes de validación. `instance` contiene la ruta, sin query.
El contrato se inspira en [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html).

| Código | Uso previsto                            |
| ------ | --------------------------------------- |
| 400    | Entrada, parámetros o JSON mal formados |
| 401    | Autenticación requerida                 |
| 403    | Operación no autorizada                 |
| 404    | Ruta o recurso inexistente              |
| 409    | Conflicto con el estado persistido      |
| 422    | Regla de negocio incumplida             |
| 500    | Error inesperado sin detalles internos  |

Las excepciones `HttpException` conservan su estado. Para respuestas 4xx se
admite únicamente su mensaje público, nunca campos arbitrarios del error.
Todo mensaje de una excepción HTTP 4xx debe ser apto para el cliente; no se deben
envolver errores SQL ni mensajes internos en estas excepciones.
Los errores inesperados y los mensajes 5xx se ocultan con una respuesta genérica,
sin SQL, trazas ni información interna. Un error HTTP 503 conserva su código,
pero su detalle también se sustituye por el mensaje seguro.

Las traducciones de excepciones de negocio se incorporarán explícitamente al
adaptador HTTP al implementar cada recurso. Este bloque no clasifica por nombres
de clases ni convierte indiscriminadamente errores de negocio en 422. Mientras
no exista traducción, una excepción ajena a `HttpException` produce 500 seguro.

## Pruebas reutilizables

`test/support/create-http-test-app.ts` recibe módulos funcionales, reutiliza
`startPostgresTestDatabase()` e inyecta su DataSource inicializado en Nest.
No importa `AppModule`, no carga `.env`, no utiliza la base local ni seeds.
Los módulos proporcionados deben respetar este aislamiento. El helper PostgreSQL
existente conserva PostgreSQL 16, puertos dinámicos, `synchronize: false` y las
migraciones reales. No se duplica esa configuración.

El helper aplica `configureHttp()` antes de `app.init()`. Ante un fallo de
inicialización cierra Nest y la base; las suites llaman `close()` en `afterAll`,
incluso si una aserción falla. La limpieza intenta detener PostgreSQL aunque
falle el cierre de Nest, y comunica errores de limpieza.

Las pruebas HTTP usan Supertest sobre los módulos reales de productos y health.
Cubren prefijo, health, validación, transformación de DTOs, JSON inválido, rutas
inexistentes, errores seguros y conservación de códigos HTTP. Para los fallos
controlados se sustituye temporalmente un método existente; no se agregan
endpoints artificiales. Los casos 401/403 prueban el filtro, no JWT ni permisos.

Se elimina la prueba heredada de `/` que esperaba `Hello World!`, junto con su
configuración exclusiva. `npm run test:e2e` selecciona ahora las pruebas HTTP
de la configuración de integración existente; `npm run test:integration`
ejecuta todas. Así CI también incluye las pruebas HTTP sin otro workflow.

## Fuera de alcance

No se añaden CRUD, endpoints de pedidos, paginación, filtros, Swagger, JWT,
roles ni autorización. Se conservan repositorios, entidades, migraciones y
procesos transaccionales. Productos todavía devuelve entidades: su DTO de salida
corresponde a un bloque posterior. Este trabajo no completa el Lab 5 ni sus
pruebas funcionales de seguridad.

## Verificación local del bloque

Comprobaciones realizadas el 5 de octubre de 2026:

| Comprobación                                 | Resultado                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Prettier sobre archivos modificados y nuevos | Formato aplicado y comprobación aprobada                                        |
| ESLint del backend                           | Sin errores ni advertencias después de retirar una aserción de tipo innecesaria |
| TypeScript `--noEmit --incremental false`    | Aprobado                                                                        |
| `npm run build`                              | Aprobado                                                                        |
| `npm test -- --runInBand`                    | 127 unitarias, 9 suites aprobadas; 14 unitarias nuevas                          |
| `npm run test:integration`                   | 28 pruebas, 8 suites aprobadas; 13,477 segundos                                 |
| `npm run test:e2e`                           | 13 pruebas HTTP, 1 suite aprobada; 2,549 segundos                               |
| `git diff --check`                           | Sin errores                                                                     |
| `docker ps` después de ambas ejecuciones     | Sin contenedores activos                                                        |

Las 28 integraciones incluyen las 15 anteriores y las 13 nuevas HTTP. La
ejecución separada de `test:e2e` repite esas mismas 13 pruebas; no son casos
adicionales. Docker estaba detenido y se inició para las comprobaciones.
En la revisión previa al commit se ejecutó `npm run test:cov -- --runInBand`:
127 pruebas y 9 suites aprobadas, en 1,499 segundos. La selección existente de
pedidos y entregas obtuvo 96,37 % statements, 90,98 % branches, 92,85 % functions
y 96,22 % lines. No se modificaron umbrales ni exclusiones; estas métricas no
representan la cobertura de la nueva capa HTTP. El resultado remoto de CI debe
consultarse después de publicar la rama.
