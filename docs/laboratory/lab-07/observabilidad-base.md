# S2 — Logger JSON y health seguro

> Las validaciones siguientes corresponden a sus etapas de implementación.
> El cierre posterior a la publicación, los HTTP reportados y la evidencia aún
> pendiente de logs productivos están en [S3](testing-evidence.md#cierre-de-entrega--4-de-noviembre-de-2026).
> No se afirman nuevos eventos observados en Render por esta actualización documental.

Estado: base JSON/health implementada; S2.3 añade los tres eventos descritos abajo.
No se ejecutó ningún despliegue ni se modificaron proveedores o Secrets.

## Base y coordinación con Aarón

Rama `feat/lab-07-observability`, desde origin/develop `fef25b3` tras fetch.
La base de la primera parte incluye #96 (rate limiting). En esa primera parte,
los archivos AuthService, JWT/roles/rate-limit
guards, controladores de autenticación, filtros MVC, configuración HTTP compartida
y pruebas de seguridad se conservaron intactos. S2.3 documenta más abajo los
archivos compartidos que ahora reciben instrumentación mínima.

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

## S2.3 — Eventos de seguridad

Rama `feat/lab-07-security-events`, desde origin/develop `9518a8d` tras fetch.
Se comprobaron los PR #96, #97 y #98 integrados. No existían estos eventos en la
base; no se duplica instrumentación anterior.

Antes de editar se identificaron y explicaron los puntos compartidos de Aarón:
AuthService, filtros REST/MVC y ProductsRepository. Los cambios en esos archivos
son imports y llamadas al JsonLogger antes de decisiones que ya existían. No se
cambian SQL, bloqueo optimista, autorización, transacciones, rate limiting,
respuestas HTTP ni emisión/verificación de JWT. Guards y controladores quedan intactos.

Contrato: una línea JSON en stdout, timestamp ISO, level=warn y estos valores fijos:

| event | context | reason |
| --- | --- | --- |
| login_failed | Authentication | credentials_rejected |
| access_denied | Authorization | forbidden |
| concurrency_conflict | ProductsRepository | optimistic_version_mismatch |

No se agregan correo, identificadores personales, producto, versiones, Request,
headers, cuerpos, JWT, cookies, direcciones, SQL, stacks o mensajes de excepciones.
No hay entradas arbitrarias al contrato: JsonLogger usa su catálogo permitido.
Los puntos instrumentados utilizan `security(event)`, que fija warn y aísla fallos
síncronos de escritura. No reintenta ni imprime el error del destino, para conservar
la excepción/respuesta original y evitar duplicados. Si falla el destino, el evento
puede perderse: no es persistencia garantizada. Errores asíncronos del stream,
terminación del proceso o fallos de recolección de Render no están garantizados por
un try/catch; requieren supervisión de infraestructura y ensayo autorizado.

Puntos y exclusiones:

- AuthService.authenticateCredentials registra justo antes del 401 de credenciales
  inválidas/cuenta inactiva. Es común a REST y loginAdmin; cubre el 401 que MVC
  captura y transforma a HTML sin pasar por el filtro. No registra errores internos.
- ProblemDetailsFilter y AdminExceptionFilter registran únicamente 403. Así
  cubren RolesGuard, permisos de recursos, CORS y CSRF donde la respuesta sea 403,
  sin instrumentar cada guard/servicio. Nest selecciona el filtro MVC o el global;
  no se llama un filtro desde el otro. Ningún filtro vuelve a registrar el 401.
- Login administrativo con credenciales válidas y rol insuficiente registra
  access_denied (403), no login_failed. Los 429 previos por rate limiting y 400 de
  validación no se etiquetan como credenciales comprobadas. No cambia la protección.
- ProductsRepository registra solo cuando el UPDATE condicional por versión no
  afecta filas Y se confirma visibilidad/propiedad antes de lanzar
  ProductVersionConflictError. El servicio mantiene su traducción 409 sin otro log.
  Los 409 por correo, FK, stock o reglas de estado NO se etiquetan como concurrencia.
- Un 404 deliberadamente opaco no se convierte en evento de denegación: no permite
  distinguir inexistencia de falta de visibilidad. Un 401 de JWT tampoco se
  clasifica aquí como permisos insuficientes.

Pruebas nuevas: HTTP real con AuthService/RolesGuard/filtro y persistencia simulada;
401, 403 y 409 conservados; exactamente un evento JSON, secretos ausentes; otro
409 sin evento; producto no visible conserva 404 sin revelar conflicto. La prueba
optimista local usa el repositorio y servicio reales con respuestas del query
builder simuladas; no demuestra concurrencia PostgreSQL real.

Las pruebas MVC existentes ahora comprueban exactamente login_failed en el login
rechazado y access_denied en los tres roles no ADMIN. La integración PostgreSQL
existente de dos PATCH concurrentes conserva sus aserciones y agrega la exigencia
de un solo concurrency_conflict. Requiere Docker; no se ha ejecutado localmente.

Pendientes: correlación y métricas; validación de logs en Render y pruebas reales
con PostgreSQL temporal. No se modifica el workflow ni su bloqueo false.

Validación inicial S2.3 del 2 de noviembre de 2026: lint y build backend aprobados;
Jest con cobertura: 529 tests aprobados en 43 archivos, cero fallidos/omitidos.
El pase focalizado de eventos y MVC aprobó 43 tests en dos archivos (subconjunto,
no sumar a 529). Cobertura de negocio: statements 97,50 %, branches 84,63 %,
functions 92 % y lines 97,74 %; umbrales de 70 % intactos. El lint inicial detectó
un mock async sin await: se corrigió a jest.fn().mockResolvedValue antes de la
validación final. No se instalaron dependencias ni se ejecutaron despliegues.

La consulta docker info no pudo conectar con el motor; integración/API con
Testcontainers, especialmente product-optimistic-concurrency.integration-spec.ts,
y navegador siguen pendientes. No se atribuye a la nueva instrumentación una
prueba de conflicto PostgreSQL real aprobada. Los tests locales verifican JSON,
secretos ausentes y conteo exacto para los recorridos instrumentados; no prueban
todos los posibles puntos de denegación externos al backend.

Revisión posterior antes de commit: se detectó que un stdout.write que lanzara
excepción podía sustituir el error original. Se añadió security(event) con warn
fijo y captura síncrona sin reintentos. Pruebas nuevas fuerzan ese fallo en
REST 401/403/409 y MVC 403, conservando las respuestas y sin devolver el error del
destino. Resultado ejecutado de esta revisión: 106 tests focalizados aprobados en
seis archivos, cero fallidos/omitidos; lint y build aprobados y git diff --check
correcto. Las 529 pruebas con cobertura corresponden al pase completo anterior,
no a una nueva ejecución de toda la suite después de esta corrección.

Las pruebas con mocks no demuestran disponibilidad de Supabase/Atlas ni logs en
Render. El umbral existente de 70 % sigue aplicado a pedidos/entregas; no es la
cobertura de este módulo nuevo. No se eliminan pruebas ni se reducen umbrales.
