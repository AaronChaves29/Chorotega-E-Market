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
5. Health backend: HTTP 200 y `status=connected`. El cuerpo no se registra; el
   endpoint actual comprueba PostgreSQL, no disponibilidad continua de MongoDB.
6. `vercel deploy --prebuilt --prod --yes`, metadata del commit y
   `vercel inspect <url> --wait --timeout 5m` y consulta autenticada a
   `GET /v13/deployments/{hostname}` (teamId para organizaciones team_).
   No se usa JSON de inspect para metadata: omite projectId/meta y renombra alias.
   Sobre la respuesta API se exige READY, target
   production, proyecto/URL/SHA correctos y alias productivo asignado sin error.
   Después GET /login del despliegue inmutable y de la URL frontend configurada:
   HTTP 200 sin redirects, tipo HTML y marcas del formulario (login-title,
   correo, clave y Chorotega). Una página de error con 200 no basta.
   La metadata identifica el checkout; no es una firma independiente del código.

Render: cada petición tiene timeout 15 s, hasta 60 consultas separadas por 10 s.
Health: hasta 30 intentos separados por 5 s. Vercel CLI: hasta 15 minutos por
comando; job completo: 45 minutos. Fallos y timeouts producen salida no exitosa.
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

Validación local: `node --check scripts/ci/production-deploy.mjs`,
`node --test scripts/ci/production-deploy.test.mjs`, parseo YAML, comparación de
steps y umbrales con la base y `git diff --check`. Pruebas nuevas simulan fetch:
no acceden a red ni ejecutan CLI. Integración/API y navegador existentes requieren
Docker. Los resultados anteriores de 458 Jest y 8 de artefacto corresponden al
cierre previo, no a una nueva ejecución ni a validación del despliegue real.

Resultado de esta preparación: sintaxis JS y YAML correctas, ocho pruebas nuevas
aprobadas (cero fallidas/omitidas), 96 combinaciones de evento/rama/resultados
comprobadas para la condición sin `false`, bloqueo literal conservado, pasos
anteriores conservados y `git diff --check` sin errores. La consulta npm confirmó
65.4.0 y Node >=20; no se instaló ni autenticó la CLI. No se repitieron las suites
funcionales existentes porque no se modificó su implementación. Lint y build
frontend aprobaron localmente con Node 24.18.0; su ejecución en el runner remoto
sigue pendiente, al igual que la CLI autenticada y ambos despliegues.

Fuentes oficiales consultadas:

- https://render.com/docs/deploy-hooks
- https://api-docs.render.com/reference/retrieve-deploy
- https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel
- https://vercel.com/docs/monorepos
- https://vercel.com/docs/project-configuration/git-configuration
- https://vercel.com/docs/cli/inspect
- https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url
