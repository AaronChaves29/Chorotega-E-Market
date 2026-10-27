# S1 — Pipeline CI/CD

Responsable: Sofía. El despliegue está deliberadamente deshabilitado.

## Verificaciones versionadas

`.github/workflows/ci.yml` ejecuta jobs independientes de backend y frontend en
pull requests hacia `develop` y `main`, y en push a ambas ramas y `feat/**` y
`feature/**`. Ambos instalan desde lockfile, ejecutan análisis estático sin
autofix y compilan. El backend conserva pruebas del artefacto, migraciones y
seeds exclusivamente en PostgreSQL efímero de CI, Jest con cobertura,
integración/API con Testcontainers y navegador MVC con PostgreSQL temporal.
Las pruebas de navegador no cubren la SPA Next.js.

Jest aplica los umbrales existentes del 70 % en statements, branches, functions
y lines; un incumplimiento devuelve código distinto de cero y falla el job.
La selección es `src/modules/{orders,deliveries}/**/*.ts`, excluyendo entidades,
repositorios, interfaces, módulos y pruebas. No equivale a cobertura de todo el
backend. Los resultados JSON de Jest y los reportes de cobertura se publican
como un artefacto de 14 días, incluso tras fallos. Si no se generaron archivos,
la publicación avisa; no reemplaza ni oculta el fallo original. Los resultados
de despliegue y navegador permanecen en el log de sus pasos.

La subida enumera resultados y archivos del reporte HTML, en lugar de publicar
cualquier archivo de `coverage/`. Los JSON contienen casos, estados, tiempos y
mensajes de fallo; HTML/LCOV incluyen información del código instrumentado.
Las pruebas usan datos sintéticos y bases temporales, sin secretos de producción.
Los mensajes de aserciones pueden incluir valores de pruebas: mantener esa
separación y no introducir credenciales reales en fixtures, errores o reportes.

Los jobs de verificación no utilizan secretos de producción. Las credenciales
PostgreSQL del workflow corresponden al servicio temporal del runner.

## Despliegue preparado, pendiente de conectar

El job `deploy` depende de ambos jobs y exige push a `refs/heads/main` y sus
resultados exitosos. Además tiene un bloqueo literal `false`: no despliega en
ninguna rama. Su paso también falla de forma explícita si alguien retira solo
ese bloqueo, evitando presentar un despliegue ficticio como exitoso.

La documentación histórica de `../lab-06/despliegue-render.md` describe Render:
raíz `apps/backend`, rama `main`, build
`npm ci --include=dev && npm run build && npm prune --omit=dev`, arranque
`npm run start` y health `/api/database/health`. El ajuste vigente de Auto-Deploy
no fue inspeccionado. El frontend está documentado en Vercel, pero no hay
configuración versionada de sus despliegues. No se infieren hooks, IDs ni nombres
de secretos existentes. No se accedió a las consolas ni se invocó producción.

## Configuración manual pendiente

1. Confirmar en Render y Vercel los proyectos, repositorio, rama `main`, raíces
   y mecanismo actual de despliegue. Comprobar si despliegan antes de finalizar CI.
2. Recomendación: centralizar la activación de producción en el job de Actions,
   usando el mecanismo oficial de cada proveedor y verificar el SHA desplegado.
   Deshabilitar o condicionar el auto-deploy de producción para que no eluda CI;
   conservar previews de PR si se desean. Acordar esto antes de conectar el job.
3. Obtener los identificadores y credenciales necesarios desde las consolas.
   Acordar sus nombres y guardarlos en GitHub Secrets, nunca en YAML, documentos
   ni logs. Los secretos de runtime de bases/JWT permanecen en los proveedores.
4. Implementar los pasos reales para ambos proveedores, comprobar finalización
   y health del despliegue. Un hook aceptado no demuestra despliegue exitoso.
   Solo entonces retirar el bloqueo literal tras revisión.
5. Proteger `main` mediante ruleset/branch protection: exigir PR, revisión y los
   checks `Build Backend` y `Build Frontend`; restringir bypass, force-push y
   borrado según la política del equipo. Revisar nombres reales de los checks
   tras la primera ejecución. Configurar lo necesario en repositorios privados
   según las capacidades disponibles de la cuenta.
6. Confirmar el CI remoto y ensayar un fallo de cobertura en una rama temporal
   autorizada, nunca reduciendo el umbral ni alterando producción.

Las protecciones, Secrets y ajustes de los proveedores no pueden certificarse
desde estos archivos. El requisito de despliegue automático sigue pendiente
hasta completar esa configuración y validar una ejecución real autorizada.

## Verificación local

Desde `apps/backend`: `npm run lint`, `npm run build`,
`npm run test:cov -- --runInBand` y `npm run test:deployment`.
Desde `apps/frontend`: `npm run lint` y `npm run build`.
En PowerShell puede ser necesario usar `npm.cmd`.

Integración/API (`npm run test:integration`) y navegador (`npm run test:browser`)
requieren Docker; el navegador requiere además Chrome/Chromium y build previo.
No ejecutar manualmente migraciones o seeds contra bases persistentes para
validar este cambio. La sintaxis YAML y las condiciones pueden revisarse
localmente; la validación definitiva del workflow requiere GitHub Actions.

### Resultado local del 27 de octubre de 2026

Backend y frontend: lint y build aprobados. Artefacto compilado: 8 pruebas
aprobadas, cero fallidas u omitidas. Jest con el comando JSON del workflow:
37 archivos y 458 casos aprobados, cero fallidos u omitidos. Cobertura:
97,50 % statements, 84,63 % branches, 92 % functions y 97,74 % lines.
Los cuatro umbrales permanecen en 70 %.

YAML parseado sin errores; se comprobaron destinos de PR, dependencias del job,
bloqueo literal y condiciones push/main/resultados. No equivale a ejecutar el
workflow en GitHub; no se dispone de actionlint en esta sesión.
Docker no pudo conectarse al motor: integración/API y navegador quedaron sin
ejecutar localmente. No se inició Docker ni se invocaron servicios de producción.

## Coordinación

No se modifica lógica de seguridad/concurrencia. Aarón debe conservar umbrales,
compatibilidad de las pruebas temporales y nombres de scripts. Coordinar cambios
simultáneos en `package.json` o el workflow y resolverlos sin perder verificaciones.
