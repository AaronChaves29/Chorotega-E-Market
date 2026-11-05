# S1 — CI/CD, incidencia productiva y recuperación

## Contexto de deploy: run 41944599501 — corrección preparada, sin desplegar

Revisión del 4 de noviembre de 2026, rama
`fix/lab-07-vercel-deploy-context`, desde develop
`560f6de162708d058fd113eb9dc528b3b3246b9d`.
El [run 41944599501](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41944599501)
corresponde a main `c338feb55f61bba51da4de7ef63ab455460d87e1`.
Build Backend, Build Frontend, pull/build de Vercel y Render aprobaron. El paso
Vercel terminó con `VERCEL_COMMAND_FAILED`, comando `vercel_deploy`, causa
`exit_nonzero`, exit 1, señal none y clase unknown; posteriormente terminó como
`VERCEL_DEPLOY_AMBIGUOUS`. No fue un despliegue automático completo exitoso.

**Causa raíz no demostrada.** El registro permitido no conserva la salida
privada original. No prueba incompatibilidad de `--json`, un error de permisos,
la ausencia de prebuilt ni un defecto en la resolución del equipo. El fallo
ambiguo tampoco demuestra que el proveedor no haya creado un deployment.

### Argumentos y evidencia de CLI 65.4.0

Se descargó e inspeccionó el [paquete oficial exacto](https://registry.npmjs.org/vercel/65.4.0),
sin instalarlo ni ejecutar la CLI. La integridad del tarball coincidió con el SRI
publicado. Sus archivos `dist/commands/deploy/index.js` y los contratos de comandos
en `dist/chunks` admiten `--project`, `--prebuilt`, `--prod`, `--skip-domain`,
`--yes`, `--no-wait`, `--json` y `--meta`. No se elimina ningún flag de salida ni
se incrementan tiempos de espera.

Deploy pasa ahora `--project VERCEL_PROJECT_ID`, como pull, y no recibe el
`--scope` global. Se conservan `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` y
`VERCEL_TOKEN` por entorno; el token no aparece en argumentos. Build y las otras
operaciones conservan sus argumentos anteriores. La selección explícita no
sustituye la autorización: la API autenticada exige que el proyecto tenga el ID
esperado y `accountId` del equipo autorizado antes de crear/promover y al final.
Una diferencia en la resolución global de scope sigue siendo una hipótesis sobre
el incidente histórico, no una causa confirmada.

### Prebuilt y monorepo

El workflow ejecuta pull/build desde la raíz Git con un enlace por proyecto
`.vercel/project.json`. En este modo, CLI 65.4.0 usa `.vercel/output` desde ese
directorio; `rootDirectory=apps/frontend` no implica por sí solo que el output
esté en `apps/frontend/.vercel/output`. Se contrastaron la resolución de build
en `dist/commands/build/index.js` y la de deploy en `dist/commands/deploy/index.js`.

Después de build, y otra vez antes del hook de Render, se exigen
`.vercel/output/config.json` con versión 3 y `builds.json` con target production,
sin errores de build. Una ausencia, JSON inválido o target distinto termina con
`VERCEL_PREBUILT_INVALID`, sin imprimir contenidos o rutas privadas.
No se exige que `builds.json` contenga una lista de builders si el campo está
ausente; si aparece, se comprueba su estructura y sus errores.

Esta comprobación corresponde al enlace por proyecto actual. Un enlace de
repositorio `.vercel/repo.json` tiene otra resolución y se rechaza expresamente:
si se adopta ese modo o cambia el directorio de ejecución, deberá ajustarse y
probarse la validación antes de publicar. No se buscan artefactos en varias rutas
para aceptar accidentalmente un build distinto. No se recuperó el artefacto
del run fallido ni se afirma que allí faltara.

### Diagnóstico, reconciliación y límites

- Se reconocen códigos estructurados en stdout/stderr, incluidos JSON por línea,
  `prebuilt_not_found`, `missing_archive`, `deploy_failed`, `upload_failed` y
  categorías de autenticación, permisos, proyecto, argumentos y red.
  Se conservan muestras acotadas de 8 KiB por canal para clasificar; solo se
  registran comando/categoría/causa/exit/señal permitidos. Nunca se imprimen las
  muestras, mensajes, stdout/stderr privados, tokens ni sugerencias de la CLI.
- JSON con ID, JSON con URL y URL simple son únicamente pistas. Las URLs se
  restringen a hosts inmutables HTTPS de Vercel, sin credenciales, parámetros,
  puertos alternativos ni rutas. Una URL solo se resuelve a ID mediante la API
  autenticada; no autoriza consultas HTTP al host ni una promoción por sí sola.
- Se conserva la búsqueda GET previa por proyecto/Production/SHA/main. Después
  de crear se contrasta nuevamente el listado, incluso si la CLI devuelve ID,
  para rechazar candidatos diferentes o múltiples. Se verifican identidad,
  proyecto, equipo, SHA, rama, entorno, READY y dominio mediante API y health.
- Un fallo ambiguo solo permite reconciliación GET acotada: nunca un segundo
  `vercel deploy`. Upload/deploy fallidos pueden haber creado estado remoto;
  no se promueve sin READY y validaciones completas. Prebuilt ausente y errores
  definitivos conocidos fallan cerrados. Se conserva la idempotencia si el SHA
  ya existe o ya fue promovido, sin repetir creación/promoción.
- Persisten consistencia eventual del listado y carreras con operadores externos.
  No existe exclusión distribuida entre proveedores ni rollback automático.
  Un resultado ambiguo sin candidato exige inspección humana antes de reejecutar.

### Validación sin despliegue

Con Node 24.21.0 se ejecutaron `node --check` de ambos scripts, ESLint para los
dos archivos MJS con reglas recomendadas y globals Node, y
`node --test scripts/ci/production-deploy.test.mjs`: **62/62 aprobadas**, sin
fallidas ni omitidas, frente a 51 casos previos. Se conservan las 96 combinaciones
de evento/rama/resultados y las mutaciones en memoria que comprueban sus controles.
También aprobaron los comandos de lint completos de backend y frontend.
Los proveedores y la CLI se simulan; el runner de procesos usa únicamente Node
sintético. La prueba de artefactos usa archivos y subprocesos en un directorio
temporal, eliminado al finalizar. También se verifica `git diff --check`.

No se ejecutan pull/build autenticados, deploy, promote, redeploy, rollback ni
migraciones. No se modifican workflow, Secrets, proveedores ni
`apps/frontend/vercel.json`. El workflow sigue activo exclusivamente para
push/main con ambos builds aprobados; desde este PR/rama debe omitir deploy.
El CI del PR y una futura ejecución productiva autorizada son evidencias
separadas: las pruebas locales no demuestran que el incidente esté resuelto en
Vercel. Para publicar esta rama y crear el PR en borrador se autorizó únicamente
el posible Preview automático por integración Git, sin autorizar operaciones
productivas ni la ejecución de comandos de despliegue.

Las secciones siguientes conservan los diagnósticos y decisiones de las etapas
anteriores; sus argumentos históricos no sustituyen esta corrección.

Actualización tras PR #110: el workflow productivo ya está activo; el primer
intento tuvo publicación parcial y se describe en «Diagnóstico y recuperación
preparada tras el primer intento». Las referencias a false/desactivación abajo
documentan la preparación histórica. Esta corrección no ejecuta publicaciones.

Responsable: Sofía. Cierre: el run 41872406367 terminó en failure. Render se
publicó automáticamente y Vercel creó un READY; la promoción manual posterior
fue reportada por el equipo. **No existe un run completo de deploy automático
en success.** #111 está solo en develop, con CI aprobado; no se ejecutó una
recuperación mediante ese script. Evidencias y límites en el
[cierre de S3](testing-evidence.md#cierre-de-entrega--4-de-noviembre-de-2026).

Las secciones siguientes conservan el procedimiento y resultados históricos de
preparación. Las referencias a false, plantilla inactiva o ausencia de despliegues
pertenecen a esas etapas; no revierten el estado actual descrito arriba.

## Diagnóstico de pull: run 41923529171 (corrección local, sin publicar)

Base de la rama `fix/lab-07-vercel-pull`: main
`e47574f21f3157e26b0cf04351659d1240421569`.
[Run productivo](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41923529171):
backend/frontend aprobaron; `vercel_pull` terminó con exit 1, clase unknown,
antes de Render y de la promoción. **No fue un despliegue exitoso.** El registro
sanitizado original no demuestra la causa exacta ni los permisos efectivos.

Se inspeccionó el paquete oficial Vercel CLI 65.4.0 sin ejecutarlo autenticado:
pull admite `--project` y el par `VERCEL_PROJECT_ID`/`VERCEL_ORG_ID` por entorno.
El `--scope` global puede resolver usuario/equipos antes de ejecutar pull.
Una restricción de token en esa resolución es una hipótesis, no una causa probada;
también pueden fallar autenticación, permisos, IDs, argumentos o red.
Referencias: [pull](https://vercel.com/docs/cli/pull) y
[opciones globales](https://vercel.com/docs/cli/global-options).

Cambio mínimo: pull recibe `--project VERCEL_PROJECT_ID`, mantiene el equipo y
token por entorno y no recibe `--scope` global. Los demás comandos conservan
su scope. Se mantiene la ejecución desde la raíz Git; no se crea ni versiona
`.vercel/project.json`. Tras pull se exigen IDs coincidentes, rootDirectory
`apps/frontend` y Node `24.x` antes de build. No se cambia workflow ni proveedores.

El runner clasifica stderr y errores JSON en stdout (máximo 8 KiB por canal)
en categorías controladas: autenticación, permisos, proyecto, scope, argumentos,
red o desconocido. Solo registra categoría, etiqueta, exit, señal y causa;
no imprime mensajes, tokens, argumentos, URLs ni respuestas originales.
La clasificación orienta el diagnóstico; no certifica permisos ni su causa.

### Evidencia autenticada de pull y retiro del diagnóstico

[Run 41936219967](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41936219967)
en develop, tras PR #115: GitHub API confirmó success para backend, frontend y
Vercel pull check (temporal), incluidos pull/validación de contexto y limpieza.
Deploy production fue skipped. El contexto proyecto/equipo por entorno y
proyecto explícito funcionó para pull con CLI 65.4.0. **No verificó Deploy ni
Promote, ni demuestra un run productivo completo exitoso.** No se atribuye una
causa definitiva al fallo histórico solo por este resultado.

Se retiran el job y los dos scripts temporales; se conserva
[la evidencia del diagnóstico](vercel-pull-check.md). La corrección definitiva
mantiene proyecto explícito en pull, sin scope global, y las validaciones de
identidad, raíz y Node. El commit original fb58d07 se conserva.

Lista histórica preparada antes de la prueba (pull ya comprobado; los permisos
de publicación y la autorización de despliegue siguen pendientes):

1. En Vercel confirmar que el token está vigente y tiene acceso al equipo,
   proyecto y configuración production correctos. Comparar internamente los IDs
   de GitHub con los del proyecto/equipo; no copiar valores a informes o chats.
2. Confirmar rootDirectory `apps/frontend`, Node 24.x y acceso autorizado a staging.
   Mantener Auto-Deploy Off en Render y el bloqueo Git main de Vercel.
3. Solo con autorización, usar un checkout aislado y CLI 65.4.0 desde raíz Git,
   con `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` por entorno:
   `vercel pull --yes --environment=production --project "$VERCEL_PROJECT_ID"`
   (sintaxis bash; en PowerShell usar `$env:VERCEL_PROJECT_ID`). No incluir token
   en argumentos ni habilitar debug. Pull descarga configuración/variables
   productivas: proteger ese directorio, no publicar sus archivos ni su contenido.
4. Revisar únicamente IDs, rootDirectory y nodeVersion del enlace generado;
   conservar solo el resultado sanitizado y el exit code. Si falla, revisar
   permisos/configuración antes de reintentar; no ejecutar deploy ni promote.
5. Acordar explícitamente cualquier prueba posterior de CI productivo: integrar
   en main puede publicar. El acceso para pull quedó comprobado en el run
   anterior; los permisos de deploy/promote y el flujo productivo completo no.

Validación local: 51 pruebas del mecanismo aprobadas (incluyen las 96
combinaciones del workflow); los proveedores se simulan y los subprocesos de
diagnóstico usan Node con datos sintéticos. No se ejecutó pull autenticado.
También aprobaron lint y build de backend/frontend, 9 pruebas del artefacto
compilado, sintaxis JavaScript/YAML y `git diff --check`. No se reejecutaron
Jest con cobertura, integración Docker ni pruebas de navegador en esta revisión.

## Corrección local de promoción automática (sin publicar)

Rama `fix/lab-07-vercel-auto-promotion`, base develop `74317e3`, posterior a #112.
No se cambian workflow, Secrets, configuración Vercel, aplicación ni bases.
El run 41872406367 sigue siendo failure; el stderr histórico no permite demostrar
si falló deploy o inspect. La promoción manual reportada no corrige ese run.

Problemas comprobados del flujo previo: inspect era un punto de fallo obligatorio;
stdout se suponía una URL única; el camino automático no comprobaba organización
ni consultaba directamente el alias; una reejecución creaba otro deployment.
La CLI fijada 65.4.0 admite JSON, no-wait, skip-domain y token por entorno según
su paquete oficial inspeccionado. No se ejecutó CLI autenticada para este cambio.

Flujo preparado para futuras publicaciones autorizadas:

1. CI mantiene push/main y ambos jobs exitosos, cobertura, concurrencia y timeout.
   Pull/build se ejecutan desde raíz Git con proyecto enlazado y Node 24.
   La CLI usa proyecto explícito en pull y scope en los demás comandos;
   VERCEL_TOKEN se entrega por entorno, nunca como argumento.
2. Consultar el proyecto autenticado: ID y accountId deben coincidir con los IDs
   configurados. Se vuelve a comprobar antes de promover y al finalizar.
3. Buscar deployments del proyecto/production/SHA mediante GET /v7/deployments,
   comprobar metadata SHA/main y paginar como máximo cinco páginas de 100.
   Dos candidatos o búsqueda incompleta fallan; no se elige uno arbitrariamente.
4. Si no existe, confirmar Render live/SHA/health y main; emitir **una sola vez**
   deploy --prebuilt --prod --skip-domain --yes --no-wait --json. Obtener el ID
   del JSON (plano o deployment.id), sin mezclar stderr. No depender de inspect.
   Si la respuesta es ambigua, solo consultas GET buscan el candidato, hasta tres
   veces; no se repite deploy. Permisos/autenticación/argumentos conocidos fallan
   de inmediato. Se conserva el diagnóstico seguro si la CLI terminó con error.
5. Consultar GET /v13/deployments/{id} hasta READY. Rechazar otra identidad,
   SHA/rama/proyecto/target, estados de fallo, errores y URL no inmutable. Cuando
   la respuesta omite ownerId, el proyecto autenticado acredita la organización;
   un ownerId explícito contradictorio siempre falla.
6. Comprobar de nuevo Render mediante su último deployment (live y commit.id
   exacto) y GET health connected. Validar /login inmutable con HTTP 200, HTML y
   las marcas del formulario; un 200 genérico o página protegida no basta.
7. Revalidar identidad, backend, proyecto y main inmediatamente antes de una
   única promoción del ID verificado. No promover Preview ni crear otro build.
   Un error conocido de permisos falla. Ante resultado ambiguo, solo se consulta
   la API: nunca se repite automáticamente la promoción.
8. Exigir READY, aliasAssigned y alias esperado; además GET /v4/aliases/{host}
   debe confirmar projectId y deploymentId exactos, sin redirect. Esperar la
   propagación acotadamente; comprobar dominio estable, backend y main al final,
   y volver a verificar deployment/alias antes de declarar éxito.
9. Si el mismo SHA ya está promovido, repetir las comprobaciones pero no mutar.
   La recuperación manual vercel-recover sigue separada, sin conexión al workflow
   y con su autorización explícita; no se ejecutó en esta preparación.

Consultas Vercel: hasta tres intentos ante red/408/429/5xx transitorios enumerados,
backoff de 1/2 segundos; 401/403, otros errores definitivos y JSON inválido fallan.
READY y propagación: hasta 60 consultas por etapa, pausa de 5 segundos y presupuesto
compartido de API de 8 minutos; cada petición tiene límite de 15 segundos. Se
comprueba el presupuesto antes de mutaciones. CLI conserva límites de 3 minutos
para deploy y 2 para promote; health conserva seis intentos acotados. El job
mantiene 45 minutos. Cancelar el runner no revierte operaciones remotas.

Límites: la búsqueda/listado tiene consistencia eventual; una respuesta ambigua
sin candidato exige inspección humana antes de reejecutar. Concurrency no bloquea
operadores externos ni elimina la carrera después de leer main. No hay transacción
entre proveedores ni rollback automático de migraciones. Los diagnósticos son
catálogos controlados, no mensajes originales; no se exponen cuerpos API o tokens.

Integración futura: revisar este diff y crear PR a develop cuando se autorice;
esperar CI completo con deploy omitido. Preparar después un PR separado a main,
sin integrarlo hasta acordar ventana, respaldo vigente, permisos de lectura de
proyecto/listado/detalle/alias y Render, permiso de promoción y acceso a staging.
Un merge a main disparará el flujo productivo: no usarlo como prueba exploratoria.

Validación real futura autorizada: registrar run y SHA; confirmar Render live,
deployment Vercel del mismo SHA y alias por API, health, logs sanitizados y dominio
actualizado. Success requiere todas las verificaciones; una promoción manual no
acredita automatización completa. Si falla, pausar publicaciones, inspeccionar
estados/SHA y no reejecutar ciegamente hooks, deploy o promote. No revertir
migraciones confirmadas automáticamente.

Validación local de esta corrección: 47 pruebas del mecanismo aprobadas (incluyen
las 29 previas y las 96 combinaciones), 533 Jest en 43 archivos y 9 pruebas del
artefacto; cero fallidas/omitidas. Cobertura de negocio conservada: 97,50 %
statements, 84,63 % branches, 92 % functions y 97,74 % lines, sobre el alcance
seleccionado de pedidos/entregas. Lint/build backend y frontend, sintaxis JS/YAML
y git diff --check correctos. El primer build frontend usó instalación antigua
16.2.12; se sincronizó con npm ci desde lockfile y se repitieron lint/build con
Next 16.4.5. Manifiestos/lockfile no cambiaron. No se ejecutaron integración Docker,
CLI productiva, recuperación, hooks ni migraciones reales. Las respuestas API y
promociones en pruebas son simuladas; no acreditan un deploy real en success.

Fuentes oficiales contrastadas:

- [List deployments](https://vercel.com/docs/rest-api/deployments/list-deployments).
- [Deployment por ID/URL](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url).
- [Alias por dominio](https://vercel.com/docs/rest-api/aliases/get-an-alias).
- [CLI deploy](https://vercel.com/docs/cli/deploy) y [promote](https://vercel.com/docs/cli/promote).

## CI conservado

Backend y frontend instalan desde lockfile, ejecutan lint sin autofix y compilan.
Se conservan pruebas de artefacto compilado, Jest con cobertura, migraciones y
seeds sobre PostgreSQL efímero del runner, integración/API con Testcontainers y
navegador MVC con PostgreSQL temporal. Se añade una prueba de orquestación sin
red ni credenciales. Frontend utiliza Node 24 para coincidir con Vercel; backend
conserva Node 22.22.0. No se modifica lógica de negocio ni seguridad/concurrencia.

Triggers: push a main/develop/feat/**/feature/** y PR a main/develop. Los cuatro
umbrales de Jest siguen en 70 % (statements, branches, functions y lines) para
pedidos/entregas; excluyen entidades, repositorios, interfaces, módulos y pruebas.
Un incumplimiento falla el job. No representa cobertura de todo el backend.
Los JSON de Jest, HTML, LCOV y resumen se publican con lista explícita de archivos,
14 días de retención y `always()`. Ausencia de reportes produce advertencia;
no oculta fallos previos. Mantener solo datos sintéticos en pruebas/aserciones.
No se publican archivos de Vercel ni variables productivas como artefactos.

## Producción preparada y desactivada

`deploy` exige ambos jobs exitosos, push y `refs/heads/main`, además del bloqueo
literal. No usar `always()` en ese job ni `continue-on-error` en verificaciones.
Checkout usa `github.sha`; la CLI recibe ese mismo SHA como metadata. La
concurrencia `chorotega-production` serializa ejecuciones sin cancelar una activa.
GitHub no garantiza orden FIFO ni conservar todos los jobs pendientes; un fallo
parcial o una cancelación requiere revisar ambos paneles antes de reintentar.

Antes del hook Render, antes de crear staging Vercel y nuevamente inmediatamente
antes de promover, `git ls-remote origin refs/heads/main` consulta el SHA remoto
vigente (timeout 10 s). Un SHA diferente produce STALE_MAIN y salida no exitosa,
sin ejecutar esa mutación. No se confía en un origin/main local desactualizado.
Si Git no puede leer main, falla cerrado. El runner necesita lectura del remoto;
en un repositorio privado debe validarse el acceso de solo lectura sin imprimir
credenciales (checkout conserva persist-credentials:false).

Secuencia implementada:

1. Validación local de presencia de configuración y URLs, sin imprimir valores.
2. Instalación oficial `vercel@65.4.0` (versión/engines consultados en npm).
3. Desde la raíz Git: `vercel pull --yes --environment=production`, comprobación
   de IDs, Root Directory `apps/frontend` y Node `24.x`, y `vercel build --prod`.
   No ejecutar desde apps/frontend: se duplicaría potencialmente la raíz remota.
   `.vercel/project.json` es generado en el runner, nunca versionado.
4. POST único al Deploy Hook Render con `ref=github.sha`. HTTP 200 debe devolver
   `deploy.id`; consultar API hasta `live` y comprobar `commit.id` contra el SHA.
   Un 202 se considera no rastreable y falla sin reintentar el hook; puede existir
   un despliegue en cola y se debe revisar el panel antes de repetir.
   Solo las consultas de estado reintentan errores de red/timeout y HTTP
   408/429/500/502/503/504: tres intentos con backoff de 1 y 2 segundos.
   401/403 y otros fallos definitivos abortan. Una respuesta ambigua del hook
   (incluida pérdida de conexión o JSON inválido) nunca causa otro POST automático.
5. Health backend: HTTP 200 y `status=connected`. El cuerpo no se registra; el
   endpoint actual comprueba PostgreSQL, no disponibilidad continua de MongoDB.
6. `vercel deploy --prebuilt --prod --skip-domain --yes`, metadata del commit y
   `vercel inspect <url> --wait --timeout 90s` y consulta autenticada a
   `GET /v13/deployments/{hostname}` (teamId para organizaciones team_).
   No se usa JSON de inspect para metadata: omite projectId/meta y renombra alias.
   Sobre la respuesta API se exige READY, target
   production y proyecto/URL/SHA correctos, sin alias productivo todavía.
   Después GET /login del despliegue inmutable. Solo al validar staging y
   volver a comprobar main se ejecuta `vercel promote <url> --yes --timeout 90s`.
   Se vuelve a consultar la API: READY, proyecto, SHA y alias productivo asignado.
   Finalmente GET a la URL frontend configurada. En ambos health se exige
   HTTP 200 sin redirects, tipo HTML y marcas del formulario (login-title,
   correo, clave y Chorotega). Una página de error con 200 no basta.
   La metadata identifica el checkout; no es una firma independiente del código.

Render: peticiones de 15 s, hasta 60 consultas separadas por 10 s, limitadas
además por una señal global de 10 minutos (una pausa puede añadir hasta 10 s).
Health: seis intentos de hasta 15 s separados por 5 s (máximo aproximado 115 s).
CLI: pull/inspect/promote hasta 2 minutos, build 6 y deploy 3. Instalación CLI:
5 minutos. El presupuesto de estas etapas cabe en los 45 minutos del job, con
margen para setup, Git y API. Fallos y timeouts producen salida no exitosa.
SIGTERM/SIGINT abortan HTTP y esperas, y terminan grupos de procesos CLI en Linux
con SIGTERM/SIGKILL. No cancelan automáticamente una operación remota ya aceptada.
Las salidas CLI/API se omiten para no divulgar secretos; consultar los paneles
para diagnóstico. No se reintenta automáticamente una operación de despliegue.

## Configuración confirmada por el equipo

Render: repo AaronChaves29/Chorotega-E-Market, main, raíz apps/backend, build
`npm ci --include=dev && npm run build && npm prune --omit=dev`, start
`npm run start:render`, Pre-Deploy vacío, Auto-Deploy Off, health
`/api/database/health`. El arranque aplica migraciones: NO añadir migraciones ni
seeds productivos a Actions. Conservar bases/JWT/TLS/CORS en Render.

Vercel: Git conectado, Production Branch main, raíz apps/frontend, Next.js,
Node 24.x, Production y Preview funcionando; CLI pendiente de autenticación.
Estos ajustes son información proporcionada por el equipo, no una exportación
ni verificación independiente de los paneles.

Actualización reportada por el equipo al 29 de octubre: seis Secrets y dos
Variables configurados; Vercel configurado para omitir producción Git y conservar
Preview; ruleset `Proteccion-main-CI-CD` creado. Su alcance y aplicación siguen
pendientes de validación independiente. No se leyeron valores ni se cambiaron paneles.

## Secrets y Variables pendientes (Aarón)

GitHub Secrets, solo nombres:

- `RENDER_DEPLOY_HOOK_URL`
- `RENDER_API_KEY` (necesario para seguir estado y SHA, no para llamar al hook)
- `RENDER_SERVICE_ID`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

GitHub Actions Variables no sensibles:

- `BACKEND_HEALTH_URL`: URL HTTPS completa del health PostgreSQL.
- `FRONTEND_HEALTH_URL`: URL HTTPS completa de /login en el dominio productivo.

No copiar URLs privadas ni credenciales al repo/chat. Los jobs de CI no reciben
estos Secrets. No crear tokens automáticamente ni conceder permisos de escritura
GitHub adicionales. Revisar alcance, caducidad y rotación de tokens.

## Bloquear el auto-deploy Git de main en Vercel, conservando Preview

Se prepara `vercel-production-git-disabled.example.json` en esta carpeta como
plantilla INACTIVA. No se añade aún a apps/frontend/vercel.json ni se cambia el
panel: aplicar ese archivo afectaría el comportamiento Git al publicarse.

El ajuste oficial `git.deploymentEnabled: { "main": false }` bloquea commits de
main; ramas no especificadas continúan habilitadas por defecto. No usar `false`
global ni una regla `"*": true` que coincida también con main y anule el bloqueo.
No controla CLI, hooks ni operaciones manuales. Mantener Production Branch main.

Antes de activarlo: revisar el proyecto vinculado, otras reglas y Root Directory.
Aplicar la plantilla en apps/frontend/vercel.json mediante un cambio autorizado
y validar en el proyecto real Preview de otra rama y ausencia de producción Git
en main. No habilitar deploy de Actions hasta confirmar ese bloqueo; existe una
ventana de despliegue Git al introducir por primera vez la configuración.

## Activación y evidencia pendiente

1. Configurar Secrets/Variables y verificar permisos contra los proyectos reales.
2. Mantener Render Auto-Deploy Off y validar el bloqueo selectivo Git de Vercel.
3. Proteger main: PR y revisión obligatorios, checks Build Backend/Build Frontend
   requeridos, revisión de bypass, force-push y borrado. No asumir protección por YAML.
4. Validar CLI 65.4.0, raíz remota, Node 24, acceso a /login de URL inmutable y
   política Deployment Protection. Si devuelve 401/403, acordar mecanismo de
   bypass limitado; no desactivar protecciones automáticamente.
5. Ensayo aislado sin secretos: matriz evento/rama/éxito-fallo. Un fallo backend
   o frontend debe omitir deploy. El false actual por sí solo NO demuestra esto.
   Simular también fallo de cobertura sin rebajar el umbral. No introducir tests
   fallidos en main ni hooks productivos en ensayos.
6. Solo tras autorización, retirar `false &&` mediante PR revisado. Un push main
   exitoso debe dejar CI verde, Render live del mismo SHA, Vercel finalizado y
   ambos health satisfactorios. Registrar run/SHA/IDs sin tokens ni cuerpos privados.

## Riesgos y comprobaciones

### Diagnóstico y recuperación preparada tras el primer intento

El run [41872406367](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41872406367)
publicó Render del SHA `9e353f372c38cb03125074f7b528de5bcc45ab21`, pero terminó
con VERCEL_COMMAND_FAILED. Vercel creó un deployment READY sin alias productivo;
el error histórico no permite identificar cuál comando falló, porque su stderr
y metadatos se descartaban. Esta corrección no demuestra la causa histórica.

El ejecutor ahora conserva etiquetas fijas vercel_deploy/vercel_inspect/
vercel_promote (también pull/build), exit code, señal normalizada y causa
controlada: exit_nonzero, timeout, cancelled, spawn_failed u output_limit.
Retiene como máximo 8 KiB de stderr solo para clasificar autenticación, permisos,
recurso inexistente, argumentos, red o desconocido. Nunca imprime stdout/stderr
fallidos, argumentos, tokens, URLs privadas ni objetos originales. La clasificación
es orientativa, no prueba independiente de la causa del proveedor.

Se prepara `node scripts/ci/production-deploy.mjs vercel-recover` como modo
separado. **No se ejecutó una recuperación real ni está autorizada por este documento.**
No se conecta desde el workflow normal ni requiere credenciales Render.

Procedimiento futuro, exclusivamente tras revisión y autorización conjunta:

1. Pausar nuevas publicaciones y revisar estado real de ambos proveedores.
   Confirmar Render live/SHA/health y compatibilidad de backend; el GET health
   de recuperación comprueba PostgreSQL, no certifica por sí mismo el SHA de Render.
2. Usar una copia revisada del script corregido, Node compatible y CLI fijada.
   Proporcionar por entorno seguro DEPLOY_SHA, VERCEL_TOKEN, VERCEL_ORG_ID,
   VERCEL_PROJECT_ID, BACKEND_HEALTH_URL y FRONTEND_HEALTH_URL. No imprimirlos.
3. Indicar RECOVERY_DEPLOYMENT como ID dpl_ o URL HTTPS inmutable *.vercel.app,
   sin credenciales, puerto, query ni ruta. La API debe confirmar ID/URL,
   organización propietaria, proyecto, SHA, main, READY, production y ausencia
   de errores/alias productivo. La ausencia de identidad requerida falla cerrado.
4. Sin autorización exacta, el modo solo consulta/valida y termina con error
   RECOVERY_NOT_AUTHORIZED; no promueve. Comprueba backend health y /login
   inmutable, vuelve a consultar identidad y vuelve a leer main.
5. Solo al autorizar la operación en ese momento, establecer
   RECOVERY_PROMOTION_AUTHORIZATION con el formato `promote:<SHA>:<deployment-ID>`.
   Es una confirmación operacional, no un sustituto de permisos o revisiones.
   Ejecutar el modo únicamente después de completar las precondiciones.
6. El modo solo puede invocar promote sobre ese deployment existente. No llama
   Render, pull, build, deploy, redeploy, rollback ni migraciones. Después exige
   READY/identidad/alias productivo y frontend correctos.

Si main avanzó respecto del SHA del deployment existente, la recuperación se
rechaza; no relajar ese control para forzar una publicación antigua. Revisar el
plan de release. Ante fallo o timeout de promote, inspeccionar alias/estado antes
de cualquier reintento: la promoción puede haber sido aceptada. No reejecutar el
job normal completo para recuperar este caso ni revertir migraciones confirmadas.

Validación local de esta preparación: pruebas sintéticas de procesos y APIs,
conservando las 17 pruebas previas y las 96 combinaciones. Los mensajes de éxito
de proveedores dentro de node:test pertenecen a simulaciones. La CLI autenticada,
Deployment Protection y la recuperación en infraestructura real siguen pendientes.
Resultado ejecutado: 29 pruebas del mecanismo aprobadas y 9 del artefacto
compilado aprobadas, cero fallidas/omitidas; lint/build backend, sintaxis JavaScript
y git diff --check correctos. No se repitió Jest completo ni integración Docker.

No hay transacción entre proveedores: Render puede quedar actualizado si Vercel
falla. No se revierte automáticamente ni se deshacen migraciones. Usar cambios
compatibles con la versión anterior y acordar recuperación manual antes de activar.
Las comprobaciones no prueban login ni compra completos. La asociación de alias
se comprueba con metadata autenticada de Vercel; no es una medición independiente
del código servido por cada caché. No confundir hook aceptado con éxito real.

Las comprobaciones de main no son un bloqueo distribuido: puede cambiar entre
`ls-remote` y el hook/promoción, o mientras Render construye. Concurrency solo
coordina este grupo en Actions; no coordina operadores, otros workflows ni
proveedores. No garantiza FIFO. Mitigación: ventanas de release coordinadas y
protección de main; para garantía estricta haría falta un protocolo de release
externo que bloquee nuevas publicaciones. No se afirma esa garantía aquí.

### Recuperación de despliegues parciales

- RENDER_AMBIGUOUS: Aarón inspecciona historial/colas/SHA antes de volver a
  ejecutar. Un timeout no demuestra que el proveedor no publicara.
- RENDER_FAILED o RENDER_QUERY_FAILED/TIMEOUT: distinguir fallo final del proveedor
  de pérdida de seguimiento. Si está live, comprobar SHA/health antes de decidir.
- Si Render está live y staging Vercel falla o main avanzó: no promover. Sofía
  registra el run, etapa y SHA; Aarón verifica compatibilidad del frontend anterior
  con el backend actual y decide corregir hacia adelante con un nuevo CI verde.
- Si promote fue aceptado pero falla la API/health posterior (POSTCHECK_FAILED):
  el dominio puede haber cambiado. Verificar alias, SHA y /login desde el panel;
  no repetir hook ni promoción ciegamente. Un error de comprobación no equivale
  a un error de publicación.
- No se ejecuta rollback ni reversión de migraciones. Una reversión de aplicación
  solo puede acordarse manualmente tras revisar compatibilidad del esquema.
- Una cancelación del runner o timeout forzoso puede impedir incluso imprimir el
  resumen seguro. Consultar ambos proveedores siempre; no hay recuperación automática.

Validación local: `node --check scripts/ci/production-deploy.mjs`,
`node --test scripts/ci/production-deploy.test.mjs`, parseo YAML, comparación de
steps y umbrales con la base y `git diff --check`. Pruebas nuevas simulan fetch:
no acceden a red ni ejecutan CLI. Integración/API y navegador existentes requieren
Docker. Los resultados anteriores de 458 Jest y 8 de artefacto corresponden al
cierre previo, no a una nueva ejecución ni a validación del despliegue real.

Resultado histórico de la preparación inicial: sintaxis JS y YAML correctas, ocho pruebas nuevas
aprobadas (cero fallidas/omitidas), 96 combinaciones de evento/rama/resultados
comprobadas para la condición sin `false`, bloqueo literal conservado, pasos
anteriores conservados y `git diff --check` sin errores. La consulta npm confirmó
65.4.0 y Node >=20; no se instaló ni autenticó la CLI. No se repitieron las suites
funcionales existentes porque no se modificó su implementación. Lint y build
frontend aprobaron localmente con Node 24.18.0; su ejecución en el runner remoto
sigue pendiente, al igual que la CLI autenticada y ambos despliegues.

Corrección de seguridad del 29 de octubre: se mantienen los ocho casos y se añaden
commit obsoleto, backoff Render, error definitivo, hook ambiguo, staging/promoción,
fallo Vercel, publicación parcial, sanitización, plazo agotado y matriz de 96
combinaciones PR/develop/main/estados. Todo usa respuestas y CLI simuladas sin red.
El flujo --skip-domain/promote está documentado oficialmente, pero su compatibilidad
con este proyecto, credenciales, Deployment Protection y CLI 65.4.0 requiere ensayo
autorizado antes de retirar false. No se probó con producción ni se desactivó protección.

Validación local de esta corrección: 17 pruebas aprobadas, cero fallidas/omitidas;
incluyen las ocho previas. Se ejecutó además el manejador real de errores en un
subproceso con modo inválido y valores sintéticos para comprobar salida sanitizada,
sin llamar a Git, CLI ni proveedores. Sintaxis JavaScript y YAML correctas,
jobs backend/frontend idénticos a la base, cobertura configurada conservada,
96 condiciones comprobadas y `git diff --check` aprobado. No se repitieron suites
de negocio. La terminación de grupos Linux y cancelación de operaciones remotas
no se ensayaron en un runner real; se documenta que ninguna cancelación local
revierte una publicación aceptada.

Fuentes oficiales consultadas:

- https://render.com/docs/deploy-hooks
- https://api-docs.render.com/reference/retrieve-deploy
- https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
- https://vercel.com/docs/monorepos
- https://vercel.com/docs/project-configuration/git-configuration
- https://vercel.com/docs/cli/inspect
- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/cli/promote
- https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url
