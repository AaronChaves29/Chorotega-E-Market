# Configuración del backend por ambiente

Este documento conserva el alcance y los resultados históricos del primer bloque del Laboratorio 6. El despliegue y MVC se implementaron posteriormente: consultar [despliegue actual](despliegue-render.md), [módulo MVC](admin-mvc.md) y [evidencia de entrega](entrega-final.md). Las exclusiones y suites omitidas que se describen abajo corresponden a aquel bloque, no al estado final.

El bloque configura arranque, validación, TLS, CORS y cierre de NestJS. Conserva los contratos REST, permisos, JWT, reglas de negocio y las opciones de no sincronizar ni ejecutar migraciones automáticamente. No implementa despliegue ni interfaz administrativa.

## Ambientes y prioridad

`NODE_ENV` se selecciona en el entorno del proceso antes de iniciar la aplicación. Los modos admitidos son `development`, `test` y `production`; la ausencia de selección usa desarrollo. No se admite cambiar de modo desde un archivo que ya se cargó como desarrollo.

| Ambiente    | Archivos locales                   | Política                                                                                                         |
| ----------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| development | `.env.development`, después `.env` | El proceso tiene prioridad; el archivo específico gana al genérico. PostgreSQL local puede usar TLS desactivado. |
| test        | Ninguno                            | Variables o configuración sintética exclusiva de pruebas; se admite puerto efímero.                              |
| production  | Ninguno                            | Solo variables del proceso/plataforma, TLS validado y orígenes HTTPS explícitos.                                 |

ConfigModule valida antes de iniciar las conexiones del backend. Los errores identifican la variable y el requisito, sin incluir URLs, credenciales, certificados ni secretos. No se modifica el archivo privado existente. `.gitignore` protege las variantes `.env.*` y permite la plantilla `.env.example` del backend.

## Variables

| Nombre             | Uso y obligatoriedad                                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | Ambiente; seleccionar explícitamente en producción.                                                                                                                                            |
| `PORT`             | Puerto numérico; si falta se usa el predeterminado del backend. Debe estar entre 1 y 65535, salvo cero en test.                                                                                |
| `DATABASE_URL`     | Obligatoria para backend y CLI. URI PostgreSQL del servidor.                                                                                                                                   |
| `DATABASE_SSL`     | TLS habilitado por defecto. Desarrollo/test pueden desactivarlo para PostgreSQL local; producción lo exige habilitado.                                                                         |
| `DATABASE_CA_CERT` | Opcional. Certificado CA PEM; admite líneas reales o saltos de línea escapados. Requiere TLS habilitado.                                                                                       |
| `MONGODB_URI`      | Obligatoria para el backend. Producción exige TLS con validación; SRV lo habilita por defecto y no puede desactivarse mediante opciones inseguras.                                             |
| `MONGODB_DATABASE` | Obligatoria para el backend.                                                                                                                                                                   |
| `JWT_SECRET`       | Obligatoria. Producción exige al menos 32 caracteres; debe generarse aleatoriamente y ser distinta de desarrollo. La validación no demuestra aleatoriedad ni compara secretos entre ambientes. |
| `CORS_ORIGIN`      | Orígenes exactos separados por comas. Obligatoria en producción; desarrollo/test pueden omitirla y conservar el comportamiento sin CORS.                                                       |

Estas variables son de servidor. URLs de bases, certificados de configuración y secreto JWT no se exponen al navegador. Este bloque no agrega variables ni modificaciones al frontend.

## PostgreSQL y certificados

TLS utiliza `rejectUnauthorized: true`. Si el certificado es reconocido por las CA de confianza del runtime, no hace falta CA explícita; si requiere una CA adicional, se configura mediante `DATABASE_CA_CERT`. Una CA mal formada produce un error seguro antes de conectar. El certificado del servidor se verifica durante la conexión real; las pruebas de opciones no sustituyen esa conexión.

Producción rechaza desactivar TLS y parámetros TLS dentro de `DATABASE_URL`, incluidos los de modo SSL y compatibilidad libpq: el driver puede usarlos para sobrescribir las opciones de verificación. Mantener esos ajustes en las variables dedicadas. Los parámetros ajenos a TLS continúan admitidos. Fuera de producción se conserva la compatibilidad de URLs y la firma previa usada por Testcontainers; preferir también las variables dedicadas.

El DataSource de CLI aplica la misma política TLS y de lectura de archivos por ambiente. La CLI solo necesita variables PostgreSQL, no las del backend completo. Se mantienen las entidades, migraciones, `synchronize: false`, `migrationsRun: false` y la tabla de historial original. No se ejecutan migraciones en este bloque.

## CORS y contrato HTTP

Cada origen incluye esquema, host y puerto cuando corresponda. No debe incluir ruta, barra final, query, credenciales ni comodines. Producción exige HTTPS. La lista es una configuración explícita; no se inventa el dominio futuro de la SPA.

Se permiten GET, HEAD, POST, PATCH, DELETE y OPTIONS; encabezados Authorization y Content-Type; se expone Location. No se habilitan credenciales de cookies entre orígenes. Un origen fuera de la lista configurada recibe 403 con Problem Details antes de ejecutar la ruta. Las solicitudes sin Origin conservan su comportamiento; CORS no sustituye autenticación ni autorización y no impide que un cliente ajeno al navegador omita ese encabezado.

Se conservan el prefijo `/api/v1`, la exclusión `/api/database/health`, ValidationPipe, el filtro Problem Details y Swagger público en `/docs` y `/docs-json`. Las pruebas HTTP antiguas pueden seguir llamando a `configureHttp(app)` sin activar CORS ni cargar configuración privada.

## Arranque y cierre

El backend escucha el puerto validado en `0.0.0.0`, compatible con el puerto asignado por PaaS. Se habilitan hooks para SIGINT y SIGTERM; el cierre invoca los mecanismos existentes de los proveedores. El helper de arranque cierra la aplicación si falla su configuración o escucha. El mensaje de arranque no imprime variables ni secretos.

Los comandos existentes `npm run start:dev`, `npm run build` y `npm run start:prod` permanecen sin cambios. Este bloque no agrega migraciones al arranque ni realiza conexiones remotas para verificar certificados.

## Verificación y límites

Las pruebas nuevas comprueban validación, opciones TLS, CA, evasiones mediante parámetros de URL y CORS. Un módulo de prueba usa Nest real, ConfigModule, Supertest y un puerto efímero: verifica arranque HTTP, bind, preflight, origen rechazado, Location, validación, Problem Details, Swagger y cierre. No importa AppModule, no inicializa bases ni representa una prueba del backend completo con PostgreSQL y MongoDB.

Resultados locales del bloque:

| Comprobación                                 | Resultado                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Prettier                                     | Archivos TypeScript y documento nuevos; sección modificada del README                                               |
| ESLint completo                              | Aprobado, sin advertencias                                                                                          |
| TypeScript sin emisión ni incremental        | Aprobado                                                                                                            |
| Build                                        | Aprobado                                                                                                            |
| Pruebas de Jest                              | 381/381, 31 suites; 303 anteriores y 78 casos nuevos                                                                |
| Cobertura existente                          | Statements 96.97%; branches 84.63%; functions 89%; lines 97.18%; umbrales y exclusiones sin cambios                 |
| Arranque compilado con producción incompleta | Rechazado con código 1 y nombre de variable faltante, sin reflejar valores                                          |
| DataSource compilado de producción           | TLS validado en las opciones, sin inicializar conexión ni ejecutar migraciones; no exige variables HTTP/MongoDB/JWT |
| Integración PostgreSQL y e2e                 | No ejecutadas: Docker no está disponible                                                                            |
| git diff --check                             | Sin errores                                                                                                         |

Los casos nuevos incluyen validación de ambientes y variables, TLS/CA y evasiones de parámetros, carga real de archivos temporales con ConfigModule, y HTTP real sin bases. No representan nuevas operaciones públicas: los controladores de prueba solo existen en los specs. Las 18 suites de integración y las 11 suites HTTP usadas por test:e2e siguen pendientes de reejecución con Docker. La verificación de opciones TLS no prueba el handshake con un servidor remoto.
La comprobación real con Supabase/Atlas, la cadena de confianza del proveedor, el dominio definitivo, despliegue, migraciones automáticas y módulo administrativo permanecen fuera del bloque.
