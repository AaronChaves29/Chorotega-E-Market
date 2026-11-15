# Implementación 4: búsquedas en vivo y novedades

## Base y alcance

Rama `feature/busquedas-en-vivo-marketplace`, basada en
`5aafbe281bd90f4a41393eb6f26915c35d267802` de `upstream/develop`.
El PR #138 está integrado y el [CI de la base aprobó](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/43678037089).
Estos resultados remotos corresponden a la base; esta implementación permanece local, sin commit ni publicación.

La revisión de `apps/frontend/app` y `components` identificó un único buscador
textual de resultados existente: emprendimientos en `/mercado`. Se convierte en
búsqueda automática y se añade el buscador real de productos en `/tiendas/[id]`.
No se aplica debounce a login, registros, dirección, cantidades ni formularios normales.

## Comportamiento compartido

`useDebouncedSearch` y `scheduleSearch` confirman el texto a los 300 ms de inactividad.
El input conserva su valor y foco; la consulta utiliza el texto sin espacios externos.
Cada cambio de término reinicia la página a cero y conserva el orden seleccionado.
Limpiar el input vuelve al conjunto activo, conservando también el orden.

Mientras se escribe se ocultan resultados anteriores y se muestra carga.
El cambio cancela inmediatamente el `fetch` anterior con `AbortController`, antes
de terminar la nueva espera. Las respuestas canceladas no pueden actualizar el estado.
Se conserva el timeout de red de 12 segundos, errores seguros y reintento.
Cancelar en el navegador no garantiza detener una consulta que ya llegó a PostgreSQL;
la protección evita que su respuesta sustituya los resultados vigentes.

Ambas pantallas consultan intermediarios del mismo origen y NestJS/PostgreSQL.
No se descarga el catálogo completo ni se filtra o pagina en memoria.
Los inputs tienen etiquetas accesibles y `type="search"`; no necesitan Enter ni botón Buscar.

## Contrato compatible

### NestJS: `GET /api/v1/products`

- Nuevo filtro opcional `nombre`: string, máximo 150 caracteres; fragmento parcial
  literal sin distinguir mayúsculas/minúsculas mediante `ILIKE` parametrizado.
- La Specification escapa `%`, `_` y `\` antes de añadir los comodines externos.
  Comillas y texto con apariencia SQL permanecen en parámetros, nunca en el SQL.
- Se conservan los filtros de tienda, categoría, estado y disponibilidad, combinados con AND.
- `sortBy` admite además `fechaPublicacion`. `sortDirection=DESC` significa más recientes;
  ASC, más antiguos. Se desempata por `idProducto` en la misma dirección antes de paginar.
- Sin parámetros nuevos se conserva `idProducto ASC`, página 0 y tamaño 20.
- Nombres de longitud excesiva o de tipo inválido producen 400 Problem Details.
  JWT ausente/rechazado mantiene 401; errores inesperados mantienen el 500 seguro.
- No se cambia el DTO de respuesta, las escrituras, el inventario, los bloqueos ni el esquema.

Ejemplo con filtros combinados:

```http
GET /api/v1/products?nombre=Caf%C3%A9&idTienda=1&estado=ACTIVO&disponible=true&page=0&size=6&sortBy=fechaPublicacion&sortDirection=DESC
```

`ILIKE` respeta la configuración de PostgreSQL; no se introduce búsqueda sin tildes,
stemming ni búsqueda aproximada. La API conserva espacios literales; la interfaz
elimina únicamente los espacios al principio/final del término.

### Intermediarios Next.js

`/api/stores` conserva su whitelist, sesión y consulta de tiendas ACTIVA.
El nuevo comportamiento de mercado ocurre en el cliente; no cambia ese contrato.

`/api/stores/[id]/products` acepta `nombre` y `sortBy=fechaPublicacion` mediante
`storeProductParams`. Rechaza duplicados, nombres largos y columnas desconocidas;
fija `idTienda` desde la ruta y `estado=ACTIVO`, y revalida que la tienda esté activa.
El selector ofrece **Novedades** y **Más antiguos**, además de los órdenes anteriores.
El orden inicial sigue siendo nombre ASC, con seis productos por página.

`/api/products` y `CreateOrderForm` no se modifican: conservan tamaño 20, nombre ASC,
productos activos con existencias y el flujo de selección/compra existente.
Solo el servidor lee la cookie HttpOnly y envía Bearer. No se reenvían credenciales,
relaciones ni errores internos al navegador. Un 401 elimina la cookie y dirige al login;
un error transitorio no elimina una sesión válida.

## Validación local — 14 de noviembre de 2026

Entorno: Node.js 24.21.0, Chrome local y PostgreSQL 16 temporal mediante Testcontainers.
No se conectó a Supabase, Atlas ni bases existentes; no se modificaron dependencias.
Node.js 22.22.0 no estaba disponible localmente: no se afirma una ejecución con esa versión.

| Comprobación                     | Resultado                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Unitarias frontend               | 87/87. Incluyen reloj simulado (299/300 ms), cancelación y sustitución del término, validación BFF, errores de red y contratos anteriores. |
| Unitarias backend                | 630/630, 47 suites. Incluyen generación de SQL con parámetros y órdenes ASC/DESC por fecha.                                                |
| Integración seleccionada backend | 128/128, 3 suites: Products HTTP, OpenAPI y concurrencia optimista/compra/rollback.                                                        |
| Navegador completo frontend      | 70/70: 19 escenarios de mercado, 23 de detalle, 12 de cuenta/compra y 12 de landing; incluye cuatro pruebas padre.                         |
| Responsive                       | 320, 390, 768, 1280 y 1440 px; comprobación geométrica sin scroll horizontal y capturas locales.                                           |
| ESLint, TypeScript, build        | Backend y frontend aprobados; TypeScript sin emisión ni incremental y build estándar con Turbopack.                                        |
| Formato y Git                    | Prettier sobre archivos afectados y `git diff --check` sin errores.                                                                        |

Las pruebas reales verifican consultas mientras se escribe, un único término tras
escritura rápida, conservación del foco/orden, reinicio de página, limpieza, vacío,
tildes, espacios y `%`, `_`, `\`. Un bloqueo controlado en el servicio de pruebas
mantiene una consulta antigua en curso; el navegador comprueba el evento de aborto
antes del nuevo debounce y que su respuesta posterior no sobrescribe la búsqueda.

Los fixtures tienen fechas fuera del orden de ID y fechas repetidas. Se comprueban
novedades/antigüedad y límites de página contra esos datos reales. Se conservan las
regresiones de 400/401/404/500, backend indisponible, reintento, sesión vencida/revocada,
cookie HttpOnly, roles, registro, logout y creación de pedido con descuento de stock.
Las pruebas que inyectan fallos lo hacen únicamente en la aplicación temporal, sin desactivar guards.

Durante la preparación, dos pruebas nuevas devolvieron 401 porque omitían su Bearer;
se agregó el JWT de prueba y aprobaron manteniendo la expectativa 400. La primera
ejecución de unitarias estaba limitada por los permisos de puertos del sandbox;
la ejecución con puertos locales permitidos aprobó. El build dentro del sandbox
no progresó y se detuvo únicamente ese proceso; el build estándar fuera de él aprobó.
No se alteraron configuraciones para evitar esos límites del entorno.

No se ejecutó la integración independiente completa del backend ni sus E2E/Chrome MVC:
se ejecutaron las tres suites afectadas y la regresión completa del frontend.
No se atribuyen resultados de otras ejecuciones a esta rama.

## Reproducción

Desde `apps/frontend`, con dependencias de ambos paquetes, Docker y Chrome disponibles:

```bash
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm test
npm run build
npm run test:browser
```

Desde `apps/backend`:

```bash
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
npm test -- --runInBand
npm run test:integration -- --testPathPatterns='products.integration-spec|openapi.integration-spec|product-optimistic-concurrency.integration-spec'
```

Las capturas con fixtures se guardan fuera del repositorio, en
`chorotega-marketplace-evidence/mercado-{ancho}.png` y
`chorotega-store-detail-evidence/tienda-{ancho}.png`, dentro del directorio temporal
del sistema. Los contenedores, Chrome y Next.js creados por estas pruebas se cierran.

## Limitaciones conservadas

No se añaden fotografías, clasificación comercial de tiendas, carrito, favoritos,
notificaciones, redes sociales ni preselección de tienda al comprar.
La disponibilidad mostrada es una lectura; la compra transaccional vuelve a validarla.
La paginación es determinista en cada consulta, pero no es un snapshot entre solicitudes:
altas o cambios concurrentes pueden mover registros entre páginas.
La búsqueda `%fragmento%` no añade índices ni optimiza volúmenes grandes; requiere
medición antes de ampliar infraestructura. No se cambia CI/CD, producción ni observabilidad.
