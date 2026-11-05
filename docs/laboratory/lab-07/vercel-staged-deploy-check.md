# Ensayo staged de Vercel — activación manual propuesta

## Resultado del primer ensayo y recuperación de solo lectura

El [run 41986271238](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41986271238)
creó un único deployment `dpl_2RA5JfKczFobQfTwmLPqQV8RrBRB`, READY en el SHA
objetivo, y terminó con `POSTCHECK_FAILED`. El alias principal sigue en el ID
anterior. La lectura anónima actual devuelve 302 a Vercel Authentication;
el health check no enviaba autenticación y rechazaba redirecciones.

**No volver a ejecutar el ensayo de creación para resolver ese postcheck.**
La [verificación independiente del deployment existente](vercel-staged-readonly.md)
prepara únicamente GET autenticados con OIDC. Su workflow queda bloqueado y
requiere autorización humana para Trusted Sources, nuevo pin revisado con CI
aprobado y la aprobación del Environment antes de una futura lectura.

El resto del documento conserva la preparación y validación previas al primer
ensayo; sus afirmaciones de ausencia de ejecución son históricas de esa preparación.

Preparación inicial del 4 de noviembre de 2026 desde develop
`b3fbd457ab5ea9f0b518804f6ab0b1d4b37db081`. **No se ejecutó el ensayo autenticado,
no se creó ningún deployment y este PR no autoriza una publicación.**

La [evidencia del prebuilt](vercel-prebuilt-check.md), run
[41956036648](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41956036648),
demuestra pull/build/assert satisfactorios del código revisado de #119. No demuestra
deploy ni promote. La consulta previa de ausencia de deployment para `c338feb`
pertenece al contexto reportado: la preparación inicial no repitió esas consultas
ni puede asumir que ese estado seguirá vigente. Las lecturas de preactivación
posteriores se distinguen abajo.

Este PR propone habilitar únicamente la ejecución manual autorizada del ensayo.
No lo ejecuta ni autoriza un merge automático. En develop, antes de integrar
este cambio, el job sigue bloqueado mediante `false &&`.

## Autorización y ejecución manual controlada

En la preparación inicial del PR #122, la consulta de solo lectura a GitHub
`/repos/AaronChaves29/Chorotega-E-Market/environments` devolvió **cero Environments**.
Ese resultado es histórico y no describe la configuración actual.

Después de integrar #122 se configuró manualmente `vercel-staged-approval`.
Esta revisión confirmó mediante GET a la API de GitHub:

- `required_reviewers` con el revisor `SofiaSJ09`.
- `prevent_self_review: true`.
- `can_admins_bypass: false`.
- Política de ramas personalizada con una única regla: `develop`, tipo `branch`.

El PR #123 asoció el job `vercel_staged_check` a ese Environment mediante
`environment.name: vercel-staged-approval`. No crea ni modifica el Environment,
sus reglas ni Secrets. **No se ejecutó una aprobación real ni el ensayo.** Esa
asociación se integró manteniendo `false &&`; la preactivación de #124 también
conservó ese bloqueo y dejó vacíos los campos de autorización específica.

El PR #122 quedó integrado en `266c56386abb77f701d3ccfc091d43870115788d`.
Se verificaron los runs aprobados del
[PR](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41972001866)
y del [push a develop](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41974158949).
Ninguno acredita una aprobación del Environment ni un despliegue staged.

GitHub exige que la definición de `workflow_dispatch` exista en la rama por
defecto para recibir ese evento. Se consultó la API del repositorio y su rama
por defecto es **develop**. El workflow manual está integrado allí desde #122;
la modificación propuesta todavía requiere revisión e integración. Referencias oficiales:
[eventos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)
y [revisores de Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

El workflow independiente `.github/workflows/vercel-staged-check.yml` contiene
el job `vercel_staged_check`. Este PR retira **únicamente `false &&`** de su
condición y conserva repositorio autorizado, evento manual sobre develop y la frase exacta
`[authorize-vercel-staged:c338feb55f61bba51da4de7ef63ab455460d87e1]` en el input
`authorization`. No se dispara por push ni PR. Crear o integrar este PR no ejecuta
el ensayo. El workflow y el job se nombran `manual approval required` para indicar
que todavía requieren intervención del operador y aprobación del Environment.
El validador y el baseline técnico se conservan; se completan únicamente
`STAGED_APPROVAL_REFERENCE` y `STAGED_AUTHORIZATION` con los valores autorizados.
El script falla antes de consultar proveedores si la autorización está incompleta.
Antes del checkout se exige un SHA hexadecimal completo y distinto de ceros;
no se acepta accidentalmente una rama móvil como referencia del validador.
El guard usa salidas explícitas ante fallo, sin depender del comportamiento de
`errexit` para expresiones `[[ … ]]` en distintas versiones de Bash.

### Baseline técnico de preactivación — 5 de noviembre de 2026

Se consultaron las referencias remotas y el
[CI push/develop del validador](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41977428692):
Build Backend y Build Frontend aprobaron; Deploy production quedó omitido.
El validador es HEAD de develop al preparar este cambio y el SHA objetivo
continúa siendo HEAD de main.

| Variable                        | Valor fijado                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `STAGED_VALIDATOR_SHA`          | `0707586496678d2b089a5b861564f82b65eebc13`                                                                      |
| `DEPLOY_SHA`                    | `c338feb55f61bba51da4de7ef63ab455460d87e1`                                                                      |
| `STAGED_PREVIOUS_DEPLOYMENT_ID` | `dpl_EjxFbBNH25mYAQ5oNxx2QCZT5pPP`                                                                              |
| `STAGED_PREVIOUS_SHA`           | `9e353f372c38cb03125074f7b528de5bcc45ab21`                                                                      |
| `STAGED_BACKUP_EVIDENCE`        | [Comentario del respaldo](https://github.com/AaronChaves29/Chorotega-E-Market/pull/122#issuecomment-6651467159) |
| `STAGED_BACKUP_VERIFIED`        | `"true"`                                                                                                        |
| `STAGED_APPROVAL_REFERENCE`     | [Autorización específica](https://github.com/AaronChaves29/Chorotega-E-Market/pull/124#issuecomment-6651751698) |
| `STAGED_AUTHORIZATION`          | Concatenación exacta indicada debajo                                                                            |

```text
stage:c338feb55f61bba51da4de7ef63ab455460d87e1:0707586496678d2b089a5b861564f82b65eebc13:dpl_EjxFbBNH25mYAQ5oNxx2QCZT5pPP:https://github.com/AaronChaves29/Chorotega-E-Market/pull/122#issuecomment-6651467159
```

### Revalidación previa al PR de activación

Las lecturas del 5 de noviembre de 2026 confirmaron develop en
`472eb1bc142e28f2d0d5ae20fd5d7513773ee26b`, commit de integración de #124, y main
en el SHA objetivo indicado. El [CI posterior a #124](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41982929174)
y el CI del validador finalizaron Success: Backend y Frontend aprobados y
Deploy production omitido. El validador fijado es ancestro de develop.

Vercel confirmó nuevamente el alias principal y el deployment anterior READY,
proyecto, rama main, target Production y SHA anterior. La búsqueda autenticada
por proyecto/equipo, SHA objetivo y target Production devolvió cero deployments.
Render continuaba LIVE en el SHA objetivo. El Environment conservaba revisor
`SofiaSJ09`, prevención de autoaprobación, bypass administrativo deshabilitado y
únicamente develop como rama autorizada. No se aprobó ni se omitió esa protección.

Se leyó el [comentario de autorización del responsable](https://github.com/AaronChaves29/Chorotega-E-Market/pull/124#issuecomment-6651751698),
publicado por `AaronChaves29` en este repositorio. Autoriza preparar la activación
y una única prueba staged para el SHA objetivo, condicionada a revisar y aprobar
el PR correspondiente y obtener la aprobación del Environment. Exige conservar
el deployment principal, revalidar CI/main/Render/alias, no repetir una creación
ambigua y no ejecutar Render, migraciones, Promote, Rollback ni Redeploy.
No autoriza publicar en el dominio principal ni integrar cambios a main.
La URL fijada no contiene parámetros `utm_source` ni otros query strings.

La evidencia del respaldo sigue disponible; se conservó la atestación documentada,
sin conectar a PostgreSQL, copiar el archivo ni repetir la restauración. Estas
lecturas no equivalen a ejecutar el workflow ni acreditan el permiso real de Deploy.

Las consultas autenticadas de solo lectura confirmaron que el alias
`chorotega-e-market-frontend.vercel.app` apunta al deployment anterior exacto,
sin redirección y en el proyecto `prj_CQzkdYWJ5ZADA1glPpRz9Ak2kOpx`. El proyecto
pertenece al equipo `team_sqLO7uNfDqUIdILp5Hmdep5n`; el detalle del deployment
confirma ese proyecto, READY, target Production, rama main y el SHA anterior.
Su proyección `alias: []` no invalida la asignación comprobada por la API de alias.
Render confirmó el servicio del repositorio, rama main, con último deployment
`dep-dbltdu6c6qcc73f9c2n0` LIVE en el SHA objetivo. Se revalidaron por GET las
reglas del Environment descritas arriba. Estas lecturas no ejecutaron despliegues.

Se leyó el comentario del respaldo publicado por el responsable. Documenta un
Custom Dump generado el 4 de noviembre, lectura con `pg_restore --list`, huella
SHA-256 generada y restauración aislada en PostgreSQL 18 con `--exit-on-error`,
diez tablas y registros comprobados. Por esa evidencia y la confirmación del
responsable se registra `STAGED_BACKUP_VERIFIED="true"` como **atestación**.
Este cambio no accedió al archivo local, no cotejó su huella ni repitió la
restauración. La evidencia cubre el esquema public, no una recuperación integral
de los servicios internos de Supabase; no publica datos ni el archivo del respaldo.
El respaldo no autoriza un deployment. Antes de una futura ejecución se debe
confirmar que siga disponible y suficientemente reciente para la ventana elegida.

El baseline es una lectura puntual y puede cambiar. El preflight deberá repetir
las comprobaciones de main, Render y alias y la búsqueda de candidatos del SHA.
Siguen pendientes las comprobaciones runtime y la aprobación efectiva del
Environment. No se ejecutó preflight ni stage autenticado ni se comprobó el permiso
real de Deploy. La ejecución continúa condicionada a la revisión del PR y
la aprobación del Environment; no se realiza desde esta preparación.

### Procedimiento futuro de ejecución, fuera de este cambio

No se ejecutó ninguno de estos pasos operativos:

1. Revisar el PR Draft, sus tres archivos y el CI antes de autorizar su integración
   en develop. No hacer merge automáticamente. El validador ya está fijado al SHA
   revisado con CI aprobado. Si cambia la lógica
   de validación, revisar y aprobar otro SHA completo y su CI antes de actualizarlo;
   no usar una rama o input libre.
2. Revalidar por API que `vercel-staged-approval` conserve revisor requerido,
   prevención de autoaprobación, bypass administrativo deshabilitado y únicamente
   la rama develop autorizada. Mantener su asociación al job. Una futura ejecución
   autorizada deberá obtener la aprobación del Environment; la frase manual no
   sustituye ese control. La configuración comprobada no demuestra que esa
   aprobación ya haya ocurrido.
3. El respaldo recuperable y su evidencia ya están registrados. El responsable
   debe revalidar su disponibilidad y vigencia fuera del runner antes de ejecutar.
   No se buscan archivos de la Mac desde Actions. El script valida el formato
   de la referencia y la atestación, **no la existencia/integridad del respaldo**.
4. Revalidar en modo lectura el deployment principal anterior y su SHA completos,
   ya fijados en el baseline. Si cambian, detener el plan y revisar los valores.
   Conservar la aprobación específica ya registrada en `STAGED_APPROVAL_REFERENCE`
   y comprobar que siga vigente para esa prueba. Las referencias admitidas son
   URLs de comentarios GitHub de este repositorio, sin credenciales ni query strings.
5. Una vez integrado el PR y autorizada expresamente la ventana de ejecución,
   el operador podrá solicitar `workflow_dispatch` exclusivamente sobre develop
   con la frase exacta indicada. El Environment deberá ser aprobado por su revisora
   requerida, sin autoaprobación ni bypass. La aprobación escrita no ejecuta ni
   sustituye ese paso. Solo esa ejecución manual posterior podría crear el staged;
   integrar el PR no dispara el ensayo. No ejecutar ni aprobar desde esta revisión.
6. No avanzar main ni publicar desde otros operadores durante la ventana. Si
   main ya no es `c338feb55f61bba51da4de7ef63ab455460d87e1`, detener el plan y
   revisar otro ensayo, sin modificar automáticamente el SHA objetivo.

## Dos checkouts y procedencia del artefacto

`validator/` contiene los scripts revisados fijados por SHA; debe ser ancestro
del SHA de develop seleccionado al ejecutar manualmente. Antes de acceder a
Secrets, se exige vía API de GitHub el último run push/develop del workflow CI
para ese SHA, completo y exitoso, incluidos Build Backend y Build Frontend.
La comprobación solo recibe el token automático con permisos de lectura de
Actions; respuestas incompletas o fallos impiden entregar los Secrets posteriores.
`source/` contiene exclusivamente main
`c338feb55f61bba51da4de7ef63ab455460d87e1`, fijado literalmente en el workflow
y en el script. Node 24 y CLI 65.4.0 se ejecutan desde `source/`.

Antes y después del build se comparan HEAD de ambos checkouts y se rechazan
cambios tracked de la fuente. El proceso CLI recibe contexto Git del SHA fuente
y rama main, en vez del SHA de activación de develop. Se conserva el token por
entorno; se retiran credenciales Render y datos de autorización del entorno CLI.
No se mezclan scripts de una rama móvil con código de otro SHA.

Los comandos son pull con proyecto explícito, build production y
`assertPrebuiltOutput()`. Tras pull se exigen proyecto/equipo, root
`apps/frontend` y Node `24.x`. El artefacto debe corresponder al enlace por
proyecto en `source/.vercel/output`, con config versión 3 y target production.

Se conserva el comando de creación con `--prebuilt --prod --skip-domain --yes
--no-wait --json`, metadata `githubCommitSha=c338feb…` y `githubCommitRef=main`,
y proyecto explícito. No se usa `--force`, token en argumentos ni scope global.
Estos flags se contrastaron con el paquete oficial fijado 65.4.0 durante #119;
no se instaló ni ejecutó CLI autenticada durante esta preparación.

## Preflight, creación o recuperación y comprobación final

Un paso separado de preflight usa únicamente lecturas. La fase stage repite
las comprobaciones; un preflight anterior no autoriza ignorar cambios posteriores:

- main debe seguir en el SHA objetivo; Render debe mostrar ese SHA LIVE. Render
  recibe exclusivamente GET de estado, sin hook ni credencial de deploy hook.
- El proyecto debe pertenecer al equipo esperado y conservar raíz y Node.
- El alias principal debe señalar el ID anterior configurado, del proyecto
  correcto, READY y con su SHA anterior exacto. No se infiere identidad de un 200.
- Se busca el SHA objetivo por API con paginación acotada. Búsqueda incompleta,
  múltiples candidatos o detalle inválido detienen el ensayo. Si existe uno
  apropiado se reutiliza; eso **no prueba permiso de creación del token**.
- Si no existe, se hace pull/build/assert y se repite la búsqueda antes de emitir
  una sola creación. JSON o URL de la CLI son pistas que se verifican por API.
  Exit 1, timeout o salida ambigua solo llevan a reconciliación GET, nunca a un
  segundo deploy. Si no hay un candidato inequívoco, se detiene el ensayo.
- Se exige READY y ausencia de errores, identidad completa, SHA, main y target
  Production. Se verifica `/login` en la URL inmutable mediante HTTP 200, HTML
  y las marcas esperadas. No se modifica Deployment Protection ni se evita una
  página de autenticación para forzar éxito.
- Se repite la verificación del alias anterior, Render/main, candidato único y
  estado staged. El dominio principal no debe aparecer en el nuevo deployment.
  El runner solo imprime categorías permitidas y, ante éxito, ID/SHA verificados;
  nunca mensajes, URLs privadas, stdout/stderr originales ni tokens.

Los helpers de lectura e identidad del mecanismo permanente se exportan para
reutilizarlos; su implementación no cambia. `Deploy production`, sus dependencias,
permisos, eventos, concurrencia y configuración permanecen intactos.

### Corrección del baseline en el PR #122

La consulta autenticada reportada durante la revisión confirmó el alias anterior,
pero el detalle del deployment devolvió `alias: []` sin `aliasAssigned`. Exigir
esos dos campos en el detalle producía un falso negativo `STAGED_INVALID_BASELINE`.
La corrección de #122 no repitió consultas autenticadas a los proveedores;
las lecturas posteriores de preactivación están registradas en su apartado.

La asignación se comprueba con `GET /v4/aliases/{dominio}?teamId=…`: nombre exacto,
proyecto e ID anterior configurados, sin redirección. Si aparece el objeto
opcional `deployment`, su ID debe coincidir; si incluye URL, debe coincidir con
el detalle verificado. Respuestas incompletas o contradictorias fallan cerradas.
No se exige que el detalle incluya `aliasAssigned` ni que `alias` enumere el
dominio. Se conservan la comprobación del equipo propietario del proyecto y la
lectura independiente del deployment por ID, con proyecto, propietario cuando
está presente, SHA anterior exacto, rama main, target Production y estado READY.

Referencia: [API oficial de alias](https://vercel.com/docs/rest-api/aliases/get-an-alias)
y [contrato del SDK oficial](https://github.com/vercel/sdk/blob/main/docs/models/getaliasresponsebody.md).
La nueva regresión falla contra el script anterior y aprueba con la corrección.
También se prueban alias incorrectos, campos requeridos ausentes, identidad
incompatible y contradicciones del deployment anidado. No cambian la búsqueda
de duplicados, la recuperación exclusivamente por GET ni la prohibición de
Promote. Durante #122 el workflow permaneció bloqueado mediante `false &&`;
este PR propone retirar solo ese bloqueo y conserva el SHA objetivo.

## Evidencia, riesgos y retirada

El grupo `chorotega-production` serializa este ensayo con el job productivo de
Actions. No coordina operadores externos, no garantiza FIFO y puede sustituir
un run pendiente: acordar una ventana sin otros releases. La API puede tener
consistencia eventual; un índice que todavía no muestra un ID válido produce
fallo cerrado y revisión humana, no reintento de creación. No se promete una
garantía distribuida de exactly once frente a otros operadores.

El runner conserva límites de CLI de 2/6/3 minutos para pull/build/deploy;
lecturas de 15 segundos, presupuesto de 8 minutos por fase y espera READY
acotada. Cancelar Actions no revierte una creación aceptada. Un deployment staged
Production puede tener URL inmutable accesible y consumir recursos aunque no
reciba el dominio principal: la futura autorización debe contemplarlo.

Registrar autorización, evidencia del respaldo, SHA fuente/validador, run,
ID encontrado/creado, READY, comprobación de login y alias anterior conservado.
No exportar archivos `.vercel` ni logs privados. La limpieza `always()` elimina
los artefactos de ambos directorios `.vercel` de la fuente; no se suben como artifacts.
No se consulta el respaldo ni se ejecutan migraciones o cambios de datos.

No hay promote, rollback, redeploy ni corrección automática del alias si cambia.
Ante un fallo, pausar, inspeccionar en modo lectura y solicitar otra decisión;
no reejecutar ciegamente. Después de obtener evidencia, retirar el job y el
ensayo temporal por PR, conservando este documento y la corrección permanente.
No llevar la activación a main. Los guards y los SHA fijados protegen el flujo
propuesto; no impiden que un actor con permisos para cambiar workflows omita
controles en otro código. El Environment configurado y asociado añade la puerta
de revisión humana. Sus reglas deben revalidarse antes de activar y obtenerse
la aprobación en la ejecución autorizada; esa aprobación real sigue pendiente.

Validación local realizada con Node 24.21.0: **96/96 pruebas aprobadas**, sin
fallidas ni omitidas (62 permanentes y 34 del ensayo). Incluye las 96 combinaciones
del job productivo, guards del workflow manual, gate de CI con respuestas
simuladas y pruebas de identidad, reconciliación, READY, duplicados y alias.
Los proveedores de las pruebas son mocks; los subprocesos ejecutan Node y Bash
con datos de prueba, sin acceder a proveedores. Las regresiones comprueban la
condición manual en 72 combinaciones, valores exactos del workflow, rechazo de
autorización incompleta o incoherente antes de consultas, y creación única y
recuperación por GET con la configuración autorizada y proveedores simulados.
`node --check` de cuatro scripts y JavaScript embebido, ESLint,
YAML, enlaces locales y `git diff --check` aprobaron. El workflow normal de CI
permanece byte a byte idéntico a develop y los helpers permanentes solo añaden
seis exports, sin cambios de comportamiento.

Un resultado local o un PR verde no demuestra un staged real exitoso. No se
ha ejecutado workflow_dispatch ni CLI Vercel autenticada en esta revisión;
las únicas operaciones autenticadas con proveedores fueron consultas de lectura.
