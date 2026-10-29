# S1 — CI/CD y despliegue automático preparado

Responsable: Sofía. Producción permanece bloqueada por `false` literal en el
job `deploy`. No se ha invocado ningún hook, CLI autenticada ni despliegue.

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
