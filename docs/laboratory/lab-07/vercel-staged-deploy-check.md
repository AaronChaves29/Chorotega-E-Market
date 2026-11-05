# Ensayo aislado de creación staged — preparación bloqueada

Preparación del 4 de noviembre de 2026 desde develop
`b3fbd457ab5ea9f0b518804f6ab0b1d4b37db081`. **No se ejecutó el ensayo autenticado,
no se creó ningún deployment y este PR no autoriza una publicación.**

La [evidencia del prebuilt](vercel-prebuilt-check.md), run
[41956036648](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41956036648),
demuestra pull/build/assert satisfactorios del código revisado de #119. No demuestra
deploy ni promote. La consulta previa de ausencia de deployment para `c338feb`
pertenece al contexto reportado: esta preparación no repitió consultas a Vercel
o Render ni puede asumir que ese estado seguirá vigente.

## Autorización: estado real y puertas cerradas

La consulta de solo lectura a GitHub `/repos/AaronChaves29/Chorotega-E-Market/environments`
devolvió **cero Environments**. No existe una aprobación de revisores comprobada.
No se crea un Environment vacío para aparentar protección.

GitHub exige que la definición de `workflow_dispatch` exista en la rama por
defecto para recibir ese evento. Se consultó la API del repositorio y su rama
por defecto es **develop**, por lo que un workflow manual independiente estará
disponible después de integrarlo allí. Antes de esa integración no se asume que
esté registrado. Referencias oficiales:
[eventos](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)
y [revisores de Environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

El workflow independiente `.github/workflows/vercel-staged-check.yml` contiene
el job `vercel_staged_check`, bloqueado por **`false &&`**. Requiere además
repositorio autorizado, evento manual sobre develop y la frase exacta
`[authorize-vercel-staged:c338feb55f61bba51da4de7ef63ab455460d87e1]` en el input
`authorization`. No se dispara por push ni PR. Crear o integrar este PR no ejecuta
el ensayo, y una ejecución manual seguirá omitida mientras permanezca `false`.
El SHA del validador está en ceros; datos de aprobación, baseline y respaldo
están vacíos y el respaldo figura como no verificado. El script falla antes de
consultar proveedores si la autorización está incompleta.
Antes del checkout se exige un SHA hexadecimal completo y distinto de ceros;
no se acepta accidentalmente una rama móvil como referencia del validador.
El guard usa salidas explícitas ante fallo, sin depender del comportamiento de
`errexit` para expresiones `[[ … ]]` en distintas versiones de Bash.

### Acción futura que podría activar la mutación

Todo lo siguiente necesita **otra autorización expresa**; no se realizó aquí:

1. Revisar e integrar el código de este ensayo en develop manteniendo `false`.
   Obtener su SHA completo y comprobar los checks. Fijarlo como
   `STAGED_VALIDATOR_SHA`; no usar una rama o input libre.
2. Preferentemente configurar, con autorización separada, un Environment con
   required reviewers, restricción a develop y prevención de autoaprobación.
   Verificar esa protección por API antes de añadirlo al job. Si se propone
   continuar sin Environment, aceptar explícitamente el control alternativo por
   PR de activación revisado: **la configuración actual no impone revisión humana
   mediante un Environment**. Una frase manual no sustituye ese control.
3. El responsable verifica un respaldo actualizado y recuperable de PostgreSQL
   fuera del runner. Registrar la evidencia sin secretos en un comentario de
   issue/PR del repositorio. No se buscan archivos de la Mac desde Actions.
   `STAGED_BACKUP_EVIDENCE` apunta a ese comentario y `STAGED_BACKUP_VERIFIED`
   pasa a true únicamente tras esa comprobación. El script valida el formato
   de la referencia y la atestación, **no la existencia/integridad del respaldo**.
4. Revisar en modo lectura el ID completo del deployment principal anterior,
   su SHA completo y estado; configurar `STAGED_PREVIOUS_DEPLOYMENT_ID` y
   `STAGED_PREVIOUS_SHA`. El prefijo reportado `9e353f3` no basta para activar.
   Registrar la aprobación en `STAGED_APPROVAL_REFERENCE`, otro comentario
   específico. Las referencias admitidas son URLs de comentarios GitHub de este
   repositorio, sin credenciales ni query strings.
5. Preparar otro PR de activación que configure lo anterior y
   `STAGED_AUTHORIZATION` con la concatenación exacta
   `stage:<SHA-fuente>:<SHA-validador>:<ID-anterior>:<referencia-del-respaldo>`.
   Solo después de aprobar la ventana, quitar `false &&` de este job. Conservar
   todos los demás guards. Integrar ese PR no dispara el ensayo. La acción que
   podría crear el deployment será una ejecución manual posterior del workflow,
   seleccionando exclusivamente develop e introduciendo la frase exacta indicada.
   Esa ejecución también necesita autorización expresa; no se realiza desde este PR.
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
Esta revisión no repitió consultas autenticadas a los proveedores.

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
Promote; el workflow sigue bloqueado mediante `false &&` y conserva el SHA objetivo.

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
controles en otro código. Resolver la protección de Secrets/Environment y revisión
es una condición previa de activación, no una garantía proporcionada por este PR.

Validación local realizada con Node 24.21.0: **93/93 pruebas aprobadas**, sin
fallidas ni omitidas (62 permanentes y 31 del ensayo). Incluye las 96 combinaciones
del job productivo, guards del workflow manual, gate de CI con respuestas
simuladas y pruebas de identidad, reconciliación, READY, duplicados y alias.
Todos los proveedores son mocks; los subprocesos ejecutan únicamente Node con
datos sintéticos. `node --check` de cuatro scripts y JavaScript embebido, ESLint,
YAML, enlaces locales y `git diff --check` aprobaron. El workflow normal de CI
permanece byte a byte idéntico a develop y los helpers permanentes solo añaden
seis exports, sin cambios de comportamiento.

Un resultado local o un PR verde no demuestra un staged real exitoso. No se
ha ejecutado workflow_dispatch ni ningún comando Vercel autenticado en esta revisión.
