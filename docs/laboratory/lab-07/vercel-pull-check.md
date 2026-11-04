# Prueba temporal aislada de Vercel pull

Preparada en `test/lab-07-vercel-pull-ci`, desde develop `9341a71`.
La corrección `fb58d07` permanece independiente en `fix/lab-07-vercel-pull`;
esta prueba no la integra ni cambia el despliegue productivo.

El job `vercel-pull-check` se ejecuta exclusivamente en **push a develop**.
No corre en PR, main ni otras ramas. Usa Node 24 y CLI 65.4.0, permisos
`contents: read` y checkout sin persistir credenciales. Los tres Secrets
VERCEL_TOKEN, VERCEL_ORG_ID y VERCEL_PROJECT_ID solo se entregan al paso de pull;
la instalación de dependencias no los recibe. No utiliza Secrets de Render.

El único comando Vercel es:
`vercel pull --yes --environment=production --project="$VERCEL_PROJECT_ID"`.
No recibe scope global ni token en argumentos. El proceso tiene límite de dos
minutos y salida capturada, nunca retransmitida. Se valida el enlace generado
en raíz `.vercel/project.json`: proyecto/equipo coincidentes, raíz apps/frontend,
Node 24.x. La configuración descargada se elimina con un paso always; no se
suben artefactos, archivos .env, ni salida de CLI. Ante cancelación forzada puede
no ejecutarse la limpieza: se depende además del runner hospedado efímero.

## Integración y ejecución real (pendientes, requieren autorización)

1. Revisar el diff del worktree y sus pruebas. La rama de corrección no se modifica.
2. Con autorización posterior, guardar/publicar esta rama y abrir PR a develop.
   En el PR el job temporal debe aparecer omitido; los checks existentes siguen
   funcionando. No integrar este diagnóstico en main.
3. Antes del merge, confirmar que los tres Secrets son accesibles desde develop.
   Si están limitados a un environment productivo, no cambiar su alcance a ciegas:
   acordar acceso autorizado con Aarón; nunca copiar valores en código o logs.
4. Integrar únicamente a develop: su push dispara el diagnóstico. El job de
   producción conserva push/main y ambos checks exitosos, por lo que no publica
   desde develop. El resto del CI mantiene sus bases temporales; no usa producción.
5. Guardar enlace del run, SHA, conclusión y resumen sanitizado. No repetir un
   run productivo para diagnosticar pull.

## Interpretación y retiro

- `result=success`: pull terminó con exit 0 y el contexto coincide. No demuestra
  permisos de deploy/promote, build exitoso ni solución del fallo histórico.
- `missing_configuration`: faltan Secrets accesibles; no se llamó la CLI.
- `disallowed_context`: el guard de contexto impidió la ejecución.
- `exit_nonzero`: revisar la clase authentication/permission/project/scope/
  arguments/network/unknown con Aarón; es clasificación orientativa, no prueba
  definitiva de causa. Nunca solicitar stderr completo ni archivos descargados.
- `timeout`, `spawn_failed`, `output_limit` o `runner_failed`: problema de ejecución;
  no se reintenta automáticamente.
- Los motivos `*_mismatch` y `project_settings_unreadable` identifican un fallo
  posterior al pull; revisar asociación/configuración sin publicar sus valores.

Tras obtener evidencia, retirar por PR a develop el job `vercel-pull-check` y
estos tres archivos de diagnóstico (script, test y este documento), conservando
el resultado sanitizado en la documentación de evidencias. Revisar el diff antes
de cualquier PR a main para excluir el diagnóstico temporal. No modificar los
jobs backend/frontend/deploy ni revertir la corrección independiente.

Riesgos: pull descarga variables production al runner, aunque no publica ni
modifica la aplicación productiva; el código que recibe Secrets debe revisarse
antes del merge. Los permisos efectivos del token siguen sin comprobarse.
No se ejecutó una prueba autenticada durante esta preparación local.

Validaciones locales: `node --test scripts/ci/vercel-pull-check.test.mjs`
(5 aprobadas, 0 fallidas), sintaxis JavaScript de script/test, parseo YAML,
12 combinaciones de evento/rama, comparación estructural de jobs existentes,
triggers y permisos contra la base, ausencia de upload de artefactos y
`git diff --check`. No se ejecutaron lint/build ni suites de aplicación porque
esta preparación no modifica código de la aplicación.
