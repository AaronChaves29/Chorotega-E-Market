# Comprobación temporal de prebuilt Vercel

## Resultado autenticado — 4 de noviembre de 2026

El [PR #120](https://github.com/AaronChaves29/Chorotega-E-Market/pull/120)
se integró en develop mediante el commit
`2f1bcb6cfb61cef5b574cb1779ff59b756dc049a`.
El [run 41956036648](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41956036648),
por push a ese commit de develop, terminó en **Success**.

| Comprobación | Resultado remoto |
| --- | --- |
| Build Backend | Success |
| Build Frontend | Success |
| Vercel prebuilt check (temporary) | Success |
| Pull, build y comprobación prebuilt sin despliegue | Success; log `Prebuilt Vercel: OK` |
| Eliminar configuración y artefactos privados | Success |
| Deploy production | Skipped, correctamente |

La API de GitHub confirmó los resultados y se comprobó el mensaje permitido del
log del job temporal. La prueba autenticada demuestra que el token configurado
permitió pull y build production, y que `assertPrebuiltOutput()` aceptó el
artefacto del código revisado. No se publican valores de Secrets ni salidas
privadas. El job no exportó los archivos `.vercel` como artefactos y su paso de
limpieza terminó correctamente.

**Esto no valida `vercel deploy` ni `vercel promote`, no demuestra una publicación
completa y no resuelve por sí solo el incidente del despliegue automático.**
El acceso para leer configuración y compilar no acredita permisos de publicación
o promoción. Cualquier ensayo de esas operaciones requiere autorización separada.

## Procedimiento histórico del job temporal

El job temporal `vercel_prebuilt_check` se ejecutaba únicamente por push a
`develop` en el repositorio autorizado, después de ambos builds satisfactorios.
Nunca desde PR, main, otra rama, fork o ejecución manual. El checkout fijaba
`01f60d677c85e18b0ba667c76cbef69dc0e1e4ce`, commit integrado y revisado del PR #119;
se comprobaba además que fuera ancestro del SHA del push a develop. Así no se tomaban
scripts ni aplicación de una rama de trabajo o un PR con acceso a Secrets.

Desde la raíz Git se ejecutaron, mediante el runner que captura la salida privada:

```sh
vercel pull --yes --environment=production --project="$VERCEL_PROJECT_ID"
vercel build --prod
```

Después se importó `assertPrebuiltOutput` del script revisado, se llamó a la
función y se imprimió `Prebuilt Vercel: OK`. Tras pull se validaron
IDs de proyecto/equipo, Root Directory y Node. No se utilizó scope global ni se
añadieron argumentos de token. CLI quedó fijada en 65.4.0 y Node en 24.

Solo el paso de comprobación recibió `VERCEL_TOKEN`, `VERCEL_ORG_ID` y
`VERCEL_PROJECT_ID` desde los Secrets existentes. No recibió Secrets de Render.
La salida privada de instalación/pull/build no se imprime ni se adjunta como
artefacto; los fallos usan el diagnóstico permitido del runner. La limpieza
`always()` elimina `.vercel` y `apps/frontend/.vercel` del runner temporal.

Pull descarga configuración y variables Production, y build ejecuta código y
dependencias con ellas: no es una prueba sin acceso a configuración productiva.
Por eso el código está fijado y los cambios deben revisarse antes de integrarlos.
El job no ejecutó deploy, promote, redeploy, rollback, hooks ni migraciones.
El job de publicación existente no se modificó ni dependía de esta comprobación.

## Retirada posterior

Con la evidencia obtenida, la rama
`chore/lab-07-remove-temporary-prebuilt-check` retira únicamente el job temporal
y sus tres pruebas específicas; la integración de esta limpieza queda sujeta a
revisión. Este documento se conserva como evidencia histórica del Laboratorio 7.
No se debe trasladar el job temporal a main.

Se mantiene intacta la corrección permanente del PR #119, incluidas
`assertPrebuiltOutput()`, contexto de proyecto/equipo, diagnóstico seguro,
reconciliación, idempotencia, SHA, duplicados y promoción únicamente en READY.
La configuración de Build Backend, Build Frontend y Deploy production, con sus
restricciones, permisos y concurrencia, permanece idéntica a la base.
No se ejecutan operaciones productivas como parte de esta limpieza.

Validación histórica de la preparación: 65/65 pruebas del mecanismo con Node 24.21.0,
incluidas las 62 anteriores, las 96 combinaciones del job productivo y 288
combinaciones del guard temporal. Sintaxis del JavaScript embebido y del archivo
de pruebas, ESLint de este último, parseo YAML y `git diff --check` aprobados.
Estos resultados locales son distintos de la ejecución autenticada remota
registrada arriba y no deben confundirse con una validación de deploy/promote.

Validación local de la retirada: **62/62 pruebas permanentes aprobadas**, sin
fallidas ni omitidas, con Node 24.21.0; incluye las 96 combinaciones de seguridad
del job productivo. Sintaxis de ambos scripts, ESLint, YAML, enlaces locales y
`git diff --check` aprobaron. Workflow y pruebas coinciden exactamente con los
del PR #119; no quedan referencias ejecutables al job temporal. Esta validación
local no volvió a ejecutar la comprobación autenticada ni operaciones productivas.
