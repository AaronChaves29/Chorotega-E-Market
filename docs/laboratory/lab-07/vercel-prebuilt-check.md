# Comprobación temporal de prebuilt Vercel

Preparación local del 4 de noviembre de 2026. No se ejecutó la comprobación
autenticada ni se publicaron estos cambios.

El job temporal `vercel_prebuilt_check` se ejecutará únicamente por push a
`develop` en el repositorio autorizado, después de ambos builds satisfactorios.
Nunca desde PR, main, otra rama, fork o ejecución manual. El checkout fija
`01f60d677c85e18b0ba667c76cbef69dc0e1e4ce`, commit integrado y revisado del PR #119;
se comprueba además que sea ancestro del SHA del push a develop. Así no se toman
scripts ni aplicación de una rama de trabajo o un PR con acceso a Secrets.

Desde la raíz Git se ejecutan, mediante el runner que captura la salida privada:

```sh
vercel pull --yes --environment=production --project="$VERCEL_PROJECT_ID"
vercel build --prod
```

Después se importa `assertPrebuiltOutput` del script revisado, se llama a la
función y solo ante éxito se imprime `Prebuilt Vercel: OK`. Tras pull se validan
IDs de proyecto/equipo, Root Directory y Node. No se utiliza scope global ni se
añaden argumentos de token. CLI queda fijada en 65.4.0 y Node en 24.

Solo el paso de comprobación recibe `VERCEL_TOKEN`, `VERCEL_ORG_ID` y
`VERCEL_PROJECT_ID` desde los Secrets existentes. No recibe Secrets de Render.
La salida privada de instalación/pull/build no se imprime ni se adjunta como
artefacto; los fallos usan el diagnóstico permitido del runner. La limpieza
`always()` elimina `.vercel` y `apps/frontend/.vercel` del runner temporal.

Pull descarga configuración y variables Production, y build ejecuta código y
dependencias con ellas: no es una prueba sin acceso a configuración productiva.
Por eso el código está fijado y los cambios deben revisarse antes de integrarlos.
No se ejecutan deploy, promote, redeploy, rollback, hooks ni migraciones.
El job de publicación existente no se modifica ni depende de esta comprobación.

Para ejecutarlo posteriormente: revisar e integrar esta preparación en develop
con autorización, esperar el CI y registrar el SHA fijado, run, resultado de cada
paso y mensaje final. No confundir éxito del prebuilt con éxito de publicación.
Si falla, conservar únicamente el diagnóstico sanitizado; no imprimir archivos
`.vercel`, variables, salidas privadas ni habilitar debug.

Después de obtener evidencia, retirar el job temporal y sus pruebas específicas
mediante otra revisión antes de llevar cambios a main. Para probar otro commit,
debe actualizarse explícitamente el SHA fijado y su prueba, tras revisar ese código.
No cambiarlo por una referencia móvil o un input libre.

Validación local: 65/65 pruebas del mecanismo aprobadas con Node 24.21.0,
incluidas las 62 anteriores, las 96 combinaciones del job productivo y 288
combinaciones del guard temporal. Sintaxis del JavaScript embebido y del archivo
de pruebas, ESLint de este último, parseo YAML y `git diff --check` aprobados.
Se comprobó que los jobs backend/frontend/deploy, los eventos y los permisos
globales permanecen idénticos. No se ejecutó Vercel autenticado ni GitHub Actions.
