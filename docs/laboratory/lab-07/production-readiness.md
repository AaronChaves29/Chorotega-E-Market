# Laboratorio 7 — Preparación de producción

Responsable: Sofía; revisión conjunta con Aarón. Fecha: 3 de noviembre de 2026.
Este documento es un procedimiento para una ejecución futura autorizada, no una
constancia de publicación. Producción permanece bloqueada mediante `false`.
No se han consultado valores de Secrets ni validado los paneles o servicios reales
durante esta preparación.

Complementa el [diseño del pipeline](pipeline-ci-cd.md), la
[observabilidad](observabilidad-base.md), las [evidencias S3](testing-evidence.md)
y la [auditoría de seguridad](../../../AUDITORIA-SEGURIDAD.md).

## Estado y alcance de la evidencia

Base de esta rama: `origin/develop` en `99af210`, merge del PR #103 de dependencias
frontend. Incluye los PR #97 (logger/health), #99 (eventos), #100 (evidencias),
#101 (transacciones), #102 (auditoría) y los bloques previos de seguridad/CI.

| Requisito | Estado y límite |
| --- | --- |
| Compilación y análisis estático | Implementados para backend/frontend; lint sin autofix. Exigir CI del SHA final. |
| Pruebas automatizadas | Jest, artefacto, orquestación, Testcontainers/API y navegador MVC en CI. No equivalen a tests de navegador de Next.js. |
| Cobertura mínima | Cuatro umbrales de 70 % en Jest para archivos seleccionados de pedidos/entregas; no todo el backend. |
| JSON, eventos y health seguro | Implementados y probados; recolección/funcionamiento productivo pendientes. |
| Seguridad y dependencias | Aarón reporta cierre y ausencia de avisos de producción frontend/backend. Avisos de desarrollo y fallos intermitentes documentados; no se ejecutó una auditoría nueva aquí. |
| Despliegue automático | Preparado, desactivado. Secrets, protección de main y proveedores requieren confirmación conjunta. |

El [run 41757034933](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41757034933)
aprobó para `99af210a88c11a30668e651c14c2ce38a64a9689`: se consultaron los jobs
y el SHA del checkout en el log backend. Build Backend y Build Frontend terminaron
con éxito, incluidas migraciones temporales, Jest/cobertura, integración,
artefacto, orquestación y navegador MVC. Deploy production quedó omitido.
Esto valida CI de la base documental, no producción ni los ajustes de proveedores.
El run anterior 41690125347 corresponde a `c17a354`; las cifras históricas de S3
se mantienen separadas por suite, sin sumarlas como pruebas únicas. Guardar el
run del SHA final y repetir CI si cambia el contenido que se integrará.

## Puertas previas: no publicar hasta completar todas

Registrar responsable, fecha y evidencia para cada confirmación; una declaración
del equipo no sustituye la comprobación del ajuste efectivo.

| Responsable | Comprobación pendiente |
| --- | --- |
| Sofía | CI de la base 99af210 confirmado; comprobar el del nuevo commit documental y del resultado combinado del PR hacia main. Revisar fallos intermitentes sin ocultarlos ni desactivar checks. |
| Aarón | Confirmar cierre de auditoría y aceptación documentada de riesgos residuales. |
| Aarón | Respaldo recuperable, procedimiento de restauración, historial de migraciones, permisos y esquema real compatibles. No ejecutar migraciones desde esta preparación. |
| Ambos | Ventana coordinada: no avanzar main durante publicación; responsables disponibles y recuperación acordada. |
| Ambos | Verificar Secrets, Variables, ruleset de main y ajustes efectivos de ambos proveedores. |
| Sofía y Aarón | Ensayo aislado autorizado: fallo backend/frontend/cobertura impide deploy sin hooks productivos, sin bajar umbrales y sin tests fallidos en main. El false actual no demuestra esta condición por sí solo. |
| Ambos | Ensayo autorizado de CLI fijada, asociación del proyecto y acceso al staging, sin promover producción. |

### GitHub

- Comprobar existencia, alcance, caducidad y permisos de los Secrets, solo por
  nombre: `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`,
  `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Variables: `BACKEND_HEALTH_URL` apunta al health HTTPS público y
  `FRONTEND_HEALTH_URL` al `/login` HTTPS del dominio estable. Sin credenciales,
  parámetros privados ni redirecciones. Confirmar destinos sin publicarlos si son privados.
- Verificar protección efectiva de `main`: PR/revisión y checks `Build Backend`
  y `Build Frontend` obligatorios, política de actualización, bypass restringido,
  sin force-push ni borrado. No exigir deploy como check de PR: debe omitirse allí.
- Comprobar acceso de lectura a main desde el runner: checkout usa
  `persist-credentials: false` y el script ejecuta `git ls-remote`.
- No imprimir variables, usar shell tracing ni adjuntar archivos `.vercel` o `.env`.

### Render y Vercel

Configuración esperada, reportada previamente por el equipo; volver a comprobarla:

| Render | Vercel |
| --- | --- |
| Repositorio Chorotega-E-Market, rama main, raíz `apps/backend`. | Proyecto/organización correctos, Production Branch main, raíz `apps/frontend`, Next.js y Node `24.x`. |
| Build: `npm ci --include=dev && npm run build && npm prune --omit=dev`. Start: `npm run start:render`. | CLI `65.4.0`, token vigente; pull/build desde raíz Git, no desde apps/frontend. |
| Auto-Deploy Off; Pre-Deploy vacío; health `/api/database/health`. | Bloqueo efectivo de despliegues Git de main conservando Preview de las ramas deseadas. |
| Hook y API corresponden al servicio; permisos, TLS y variables de arranque revisados por Aarón. | Variables Production, incluido `API_URL`, dominio y Deployment Protection compatibles con el acceso al staging y frontend. |

La [plantilla Vercel](vercel-production-git-disabled.example.json) es inactiva.
`git.deploymentEnabled: { "main": false }` debe aplicarse en la configuración
efectiva del proyecto mediante una acción futura autorizada; revisar reglas que
también coincidan con main. No deshabilitar Preview globalmente.
Confirmar el bloqueo **antes del primer merge de publicación a main**: introducir
una plantilla en ese mismo merge no acredita que no exista una ventana de
despliegue Git independiente. Si no puede garantizarse el bloqueo previo, detener
la integración y acordar el mecanismo con Aarón. No cambiar aquí ningún panel.

### Respaldo y migraciones: decisión de Aarón

El arranque productivo ya aplica las migraciones pendientes antes de HTTP.
No añadir migraciones ni seeds desde Actions o Pre-Deploy. Confirmar el historial
real, no asumir que solo está pendiente la migración de versión de producto.
La migración nueva añade `producto.version` con valor inicial 1; necesita un
bloqueo DDL. Revisar capacidad, permisos, límites de espera y compatibilidad con
la aplicación anterior y los clientes PATCH. Aunque el cambio sea aditivo, no
garantiza ausencia de impacto. El respaldo debe permitir recuperación real.
Una migración confirmada puede persistir aunque después falle la aplicación.

## Dos fases separadas de integración y activación

Acciones futuras, únicamente tras autorización. No están ejecutadas por este documento.

1. **Sofía:** actualizar referencias y comparar main/develop otra vez. En la revisión
   previa había 5 merges exclusivos de main sin contenido funcional exclusivo;
   no asumir que seguirá siendo así. No reescribir historial ni forzar push.
2. **Ambos:** confirmar las puertas anteriores y el bloqueo Git externo. Preparar
   PR `develop → main` manteniendo `false`; revisar diff completo y CI combinado.
3. **Ambos:** aprobar e integrar conforme al ruleset. Comprobar el run de push a
   main: backend/frontend verdes y deploy omitido. Esto todavía no publica por Actions.
4. **Sofía:** preparar un cambio mínimo de activación en una rama desde develop,
   con PR hacia develop y luego PR hacia main. Retirar solo `false &&` de la
   condición y actualizar nombre/documentación del job; conservar necesidades,
   umbrales, verificaciones y restricciones de evento/rama. Revisiones y CI en ambos PR.
5. **Ambos:** última comprobación de respaldos, permisos, ausencia de despliegues
   ajenos/colas y disponibilidad de responsables antes del merge de activación a main.
6. **Sofía:** seguir el run de **push a main** generado por ese merge. Solo después
   de ambos jobs exitosos podrá ejecutarse deploy del mismo `github.sha`.

No activar deploy en PR, develop, feature branches ni añadir ejecución manual
como sustituto del push requerido. El CI anterior de develop no reemplaza el CI
del nuevo SHA de main. Una modificación posterior exige su propia validación.

## Flujo real que se debe observar tras activar

1. Preflight de nombres/URLs; instalación de CLI y build Vercel desde raíz Git.
   Se verifican IDs, `rootDirectory=apps/frontend` y `nodeVersion=24.x`.
2. Comprobación de main vigente; Render recibe un único hook con `ref=DEPLOY_SHA`.
   No basta aceptación: obtener ID, seguir API hasta `live`, exigir `commit.id`
   igual al SHA de CI y health HTTP 200 con JSON `status=connected`.
3. Comprobación de main; Vercel crea `--prebuilt --prod --skip-domain`, sin
   asignar todavía el dominio estable. Inspect/API exigen READY, proyecto,
   metadata SHA/ref correctas y ausencia del alias productivo.
4. Comprobar `/login` inmutable: HTTP 200, HTML y marcas `Chorotega`,
   `login-title`, `correo`, `clave`. Revalidar main antes de `promote`.
5. Confirmar READY, alias productivo asignado y health del dominio estable con
   el mismo contenido esperado. Metadata no es firma independiente del código servido.

El job tiene 45 minutos; Render limita su seguimiento a unos 10 minutos y usa
peticiones de 15 segundos. Un timeout es pérdida/fallo de seguimiento, no prueba
de que no se publicó. Concurrency serializa este grupo de Actions, no operadores
ni proveedores; no garantiza FIFO ni elimina la carrera después de comprobar SHA.

### Validación segura de Sofía tras la publicación autorizada

- Registrar run, SHA, IDs y estado final de ambos proveedores.
- GET sin autenticación a `/api/database/health`: 200 y únicamente
  `{"status":"connected"}`; sin SQL, base, credenciales ni mensajes internos.
  El 503 y la sanitización ante fallos se prueban en entorno aislado; no cortar
  PostgreSQL productivo. El health no comprueba MongoDB ni todos los negocios.
- En Render, elegir instancia/ventana correctas y comprobar `backend_started`
  como JSON de una línea; revisar ausencia de secretos y datos personales.
  Los tres eventos de seguridad se verifican con registros legítimos existentes:
  si no hay, marcar «no observado». No generar ataques ni intentos fallidos.
- Abrir `/login` y navegación pública del frontend; comprobar carga de recursos
  y lecturas públicas acordadas del backend sin exportar datos personales.
  No registrar usuarios, comprar, editar productos ni provocar concurrencia real.
- Las comprobaciones HTML no prueban autenticación o compra completas; cualquier
  ensayo adicional requiere entorno/datos de prueba y autorización específicos.
- Los logs son best effort y el health depende de los timeouts del driver:
  no afirmar persistencia garantizada ni disponibilidad integral.

## Recuperación acordada antes de activar

| Situación | Respuesta de Sofía y Aarón |
| --- | --- |
| Cualquier fallo | Sofía registra etapa/run/SHA; ambos pausan merges y nuevas publicaciones. Mediante acción autorizada, reponer false por PR y detener runs pendientes. No basta para detener operaciones remotas ya aceptadas: Aarón inspecciona ambos proveedores. |
| Render hook ambiguo, 202 o timeout | No repetir hook ni reejecutar todo el job. Aarón inspecciona cola, ID, estado y SHA; puede existir publicación aceptada. |
| Fallo de migración/arranque | Aarón revisa historial, transacción, esquema y diagnóstico sanitizado antes de reintentar. No ejecutar down automáticamente. |
| Render live, Vercel staging fallido o SHA obsoleto | No promover. Confirmar compatibilidad del frontend anterior y corregir hacia adelante mediante nuevo CI aprobado. |
| Promoción aceptada, postcheck fallido | Revisar deployment/alias/SHA y dominio: puede haberse publicado. No promover otra vez sin diagnóstico. |
| Reversión de aplicación necesaria | Decisión conjunta y autorizada tras comprobar compatibilidad con el esquema conservado. No revertir automáticamente migraciones confirmadas ni restaurar datos sin plan específico. |

Cancelar el runner no cancela necesariamente Render/Vercel. No hay transacción
entre proveedores ni rollback automático. Una reversión de transacción DDL fallida
durante el arranque es distinta de deshacer una migración ya confirmada.

## Evidencias y cierre conjunto

Conservar PR/aprobaciones, SHA final y run de push a main, checks y reportes por
suite, cobertura con alcance, ensayo de fallo que bloquea deploy, IDs/estados/SHA
de proveedores, health, muestras JSON sanitizadas y comprobación del frontend.
Registrar responsables/fecha de respaldo y verificaciones externas sin adjuntar
respaldos, valores de Secrets, URLs firmadas ni logs completos privados.
Guardar copia segura antes de que caduquen los artefactos (14 días en el workflow);
la evidencia histórica de S3 caduca el 16 de noviembre de 2026.

Pendientes de firma conjunta: CI del SHA final, auditoría aceptada, respaldo y
migraciones, ajustes efectivos GitHub/Render/Vercel, ensayo aislado y decisión de
activación/recuperación. La equivalencia académica del health NestJS frente a la
ruta `/actuator/health` debe confirmarse con el profesor; no consta aprobación.

Validación de esta preparación: revisión estática del workflow/script y
`git diff --check`; solo se incorpora este documento. No se repitieron suites ni
se validó producción. El bloqueo literal sigue activo.
