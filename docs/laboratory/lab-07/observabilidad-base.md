# S2 — Logger JSON y health seguro

Estado: primera parte implementada y revisada localmente; eventos de seguridad pendientes.
No se ejecutó ningún despliegue ni se modificaron proveedores o Secrets.

## Base y coordinación con Aarón

Rama `feat/lab-07-observability`, desde origin/develop `fef25b3` tras fetch.
La base incluye #96 (rate limiting). Sus archivos AuthService, JWT/roles/rate-limit
guards, controladores de autenticación, filtros MVC, configuración HTTP compartida
y pruebas de seguridad se conservan intactos.

Conflicto identificado antes de implementar: `common/http/openapi-contract.ts`
fue modificado recientemente por Aarón. No se edita. El controlador health ahora
importa un DTO exclusivo de `modules/health/dtos/`, con el mismo nombre de esquema
`DatabaseHealthResponseDto`. El esquema OpenAPI activo ya no expone database ni
timestamp. La clase histórica en el archivo compartido queda sin uso y podrá
retirarse en una limpieza coordinada, sin intervenir ahora su trabajo.
Tampoco se modifica la suite OpenAPI compartida; una prueba nueva comprueba el
esquema real generado. En HTTP foundation solo cambia la aserción del health.

## Contrato JSON

`JsonLogger` extiende ConsoleLogger con `json: true`, sin dependencias nuevas.
Adapta el punto de escritura para emitir una línea JSON por llamada en stdout,
incluidos error/fatal. No escribe stacks ni detalles en stderr. Campos mínimos:

```json
{"timestamp":"2026-10-29T12:00:00.000Z","level":"log","event":"backend_started","context":"Bootstrap","reason":"http_listening"}
```

Eventos operativos: backend_started, migrations_completed, startup_aborted y
migrations_aborted. Solo migrations_completed admite un count entero no negativo.
Los mensajes arbitrarios de Nest se sustituyen por framework_message (framework_error
para error/fatal), con razón framework_details_omitted y contexto permitido o
Application. Los errores conservan tipo y código únicamente de listas permitidas;
no se clasifican como eventos de seguridad ni como conflictos por ese código.
Esto sacrifica los
textos de rutas/módulos de Nest para evitar datos sensibles en mensajes libres.
No se serializan Request/Response/Error, headers, cuerpos, objetos ni stacks.
Los niveles configurados en ConsoleLogger siguen respetándose.

`startup_failure` se escribe también como JSON en stdout. Conserva las listas
existentes de mensajes, tipos y códigos permitidos, y agrega etapa controlada.
Nunca se serializan el error ni sus causas. Las fallas mantienen exit code 1;
el cambio de stderr a stdout no oculta el fallo del proceso.

Desarrollo utiliza el logger desde NestFactory y captura fallos de bootstrap con
el diagnóstico sanitizado. Producción conserva validación → migraciones → Nest →
HTTP y logging desactivado durante inicialización, habilitando JsonLogger después.
El script de migraciones utiliza eventos controlados. Errores externos anteriores
a la carga del programa (Node, cargador, npm o plataforma) no están cubiertos por
este contrato; no se afirma que todo log de Render sea generado por la aplicación.

## Health público

Se conserva GET /api/database/health, sin JWT ni cambio de prefijo:

- PostgreSQL disponible: consulta `SELECT 1`, HTTP 200 y solo `status: connected`.
- PostgreSQL no disponible: HTTP 503; el filtro existente devuelve Problem Details
  con detalle genérico. No modifica la política de errores global.
- No devuelve nombre de BD, timestamp, SQL, credenciales ni mensaje del driver.
- No incorpora MongoDB: el contrato sigue siendo disponibilidad PostgreSQL.

Render comprueba HTTP; `scripts/ci/production-deploy.mjs` comprueba además
status=connected. Ambos contratos se conservan. No se ejecutó un health remoto.

Timeout: esta etapa conserva la espera real del driver. No agrega Promise.race,
reintentos ni consultas paralelas después de un timeout artificial. Una conexión
o consulta bloqueada todavía depende de los límites del pool/servidor configurados.
Antes de exigir un límite de latencia garantizado, coordinar cancelación real de
consulta o statement_timeout/pool timeout con el responsable de persistencia;
no se alteran opciones globales de conexiones ni transacciones de negocio aquí.

## Pruebas y validación

Pruebas nuevas: todos los niveles producen JSON de una sola línea en stdout;
objetos/stack/causas con marcadores privados se omiten; eventos y niveles;
health unitario exitoso/fallido; HTTP real con DataSource simulado para 200/503,
ausencia de datos internos, ruta y esquema OpenAPI. Se adaptan los diagnósticos y
las pruebas de entrypoints compilados al cambio intencional de stream/formato,
conservando comprobaciones de sanitización, salida no exitosa y orden de arranque.

Resultado final de la revisión: lint y build del backend aprobados; 516 pruebas Jest en
42 archivos aprobadas y nueve pruebas del artefacto compilado aprobadas, cero
fallidas u omitidas. Las 34 relevantes del primer pase son un subconjunto de las
516, no casos adicionales. Cobertura de negocio conservada: statements 97,50 %,
branches 84,63 %, functions 92 % y lines 97,74 %; cuatro umbrales de 70 % aprobados.
ESLint inicialmente detectó tipos inseguros en las pruebas nuevas; se corrigieron
los tipos de spies/servidor antes de repetir lint y ejecutar la validación final.
La integración HTTP con PostgreSQL temporal y pruebas navegador requieren Docker;
Docker no está disponible en esta sesión. No se instalaron ni iniciaron servicios
externos; las pruebas HTTP locales usan el servidor efímero de Supertest y mocks.

Correcciones de revisión: se conserva tipo/código permitido de errores del framework
para no perder por completo la clasificación diagnóstica, sin mensajes ni stacks.
El count queda limitado al evento de migraciones. Se añade prueba del entrypoint
main con fallo de proveedor simulado: JSON válido, datos privados ausentes y exit 1,
igual que el arranque productivo. Las 17 pruebas simuladas de scripts/ci también
aprobaron, sin desplegar ni modificar ese script. Las pruebas y cobertura anteriores
de 515/8 quedan reemplazadas por los resultados finales de 516/9.

## Pendiente de S2

No implementados: login_failed, access_denied, concurrency_conflict, correlación
de solicitudes ni métricas. Coordinar puntos de registro con Aarón para cubrir
REST/MVC sin duplicar eventos ni cambiar autenticación/autorización. Un 409 no
identifica por sí solo concurrencia. No se modifica el workflow ni su false.

Las pruebas con mocks no demuestran disponibilidad de Supabase/Atlas ni logs en
Render. El umbral existente de 70 % sigue aplicado a pedidos/entregas; no es la
cobertura de este módulo nuevo. No se eliminan pruebas ni se reducen umbrales.
