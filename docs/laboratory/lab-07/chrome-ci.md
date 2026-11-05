# Chrome en CI: timeout de Browser.getVersion

Rama `fix/lab-07-chrome-ci`, base develop
`08fb599353d97691fe33dc8d4e13d1ff63f475cb` (PR #116 integrado).

## Hechos y alcance del diagnóstico

El [run 41940287789](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41940287789)
falló en `npm run test:browser`, job backend 126959037808. Frontend, migraciones
temporales, Jest/cobertura e integración habían aprobado; deploy quedó skipped.
El error fue `Chrome no respondió a Browser.getVersion.` antes de los escenarios
MVC. El timeout de cada comando era 15 segundos. No fue un rechazo funcional
de origen, sesión, CSRF, PostgreSQL o PRG.

Runner observado: Ubuntu 24.04.5, imagen 20261101.360.1. Su
[inventario versionado](https://github.com/actions/runner-images/blob/ubuntu24/20261101.360/images/ubuntu/Ubuntu2404-Readme.md)
anuncia Chrome 156.0.8078.79 y Chromium 156.0.8078.0. Esto no demuestra qué binario
ejecutó ese proceso: el helper no registraba ruta ni versión y permitía CHROME_BIN.

**Causa subyacente aún no demostrada:** Chrome no entregó una respuesta CDP dentro
del plazo. Stderr se descartaba (`ignore`), los errores de proceso eran genéricos,
los fallos de streams no se manejaban y los comandos posteriores a una desconexión
podían terminar en timeout. Por ello no puede atribuirse el incidente a sandbox,
memoria compartida, binario equivocado, recursos o transporte sin nueva evidencia.
Se corrige esa pérdida de diagnóstico; no se declara resuelto el bloqueo de Ubuntu.

## Cambios

- Preflight `node test/support/chrome-browser.cjs --check`: comprueba existencia,
  resuelve ubicación y ejecuta únicamente `--version` con timeout y salida acotada.
  Registra JSON con versión numérica y rutas conocidas del sistema; rutas
  personalizadas se redactan. Si CHROME_BIN está definido y no existe, falla.
- El launcher conserva headless y remote-debugging-pipe, perfil temporal exclusivo
  y comandos funcionales. Captura hasta 8 KiB de stderr solo para clasificación.
  Nunca publica stderr crudo, respuestas CDP, cuerpos, cookies, tokens ni errores
  arbitrarios. Los errores muestran causa, exit, señal, clase y comando controlados.
- Distingue spawn, salida prematura, cierre/error del pipe, JSON inválido,
  error DevTools y timeout. Rechaza tareas pendientes inmediatamente al desconectar,
  conserva el primer error y termina el navegador al fallar el arranque.
- CI añade preflight y pruebas sintéticas antes de la suite MVC existente.
  No elimina ni omite escenarios. Admin MVC, negocio, PostgreSQL temporal,
  verificaciones de sesión/origen/CSRF/PRG y despliegue permanecen intactos.

No se añaden flags de CI ni se aumenta el timeout sin evidencia. En particular,
no se usa `--no-sandbox`, no se desactiva AppArmor ni la seguridad web. Chromium
[advierte sobre el aislamiento perdido](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md).
Si un nuevo run demuestra sandbox, revisar primero la instalación y política del
Chrome estable; si demuestra /dev/shm, evaluar recursos o `--disable-dev-shm-usage`
solo en CI. Estas son acciones futuras condicionadas, no causas comprobadas.

## Verificación y siguiente paso

Validaciones locales ejecutadas:

| Comando / control | Resultado |
| --- | --- |
| `node --test test/support/chrome-browser.test.cjs` (backend) | 9 aprobadas, 0 fallidas/omitidas |
| `npm run lint` y `npm run build` (backend) | Aprobados |
| `npm run test:deployment` (backend) | 9 aprobadas |
| `npm run test:cov -- --runInBand` (backend) | 533 aprobadas en 43 archivos |
| `node --test scripts/ci/production-deploy.test.mjs` (raíz) | 51 aprobadas; 96 combinaciones conservadas |
| Sintaxis CJS, formato, YAML y `git diff --check` | Correctos |

Cobertura: statements 97.50 %, branches 84.63 %, functions 92 %, lines 97.74 %,
en los 32 archivos seleccionados de pedidos/entregas, no todo el backend ni el
launcher CJS. No se cambiaron umbrales ni suites existentes. Los nueve tests
sintéticos del launcher se ejecutan por separado y no se suman como tests Jest.

Las pruebas nuevas usan procesos simulados: handshake sano, timeout, salida
prematura, errores de spawn/pipe, filtrado de secretos, versión y limpieza.
No sustituyen la suite MVC real con PostgreSQL ni certifican Chrome en Ubuntu.

En este equipo se encontró Chrome Windows 156.0.8078.80 por metadatos del archivo,
no mediante una ejecución de DevTools. Docker CLI existe pero su daemon no está
disponible, confirmado incluso fuera del sandbox; no se inició Docker. No se pudo
ejecutar aquí `npm run test:browser` ni integración Testcontainers. No se marcaron
pruebas como skip ni se modificó su implementación.

Después de abrir el PR a develop, comprobar el preflight, los diagnósticos del
launcher y los nueve escenarios MVC reales. Un éxito aislado tampoco prueba una
causa histórica específica. Si falla, conservar run, SHA, ruta/versión redactadas
y categorías; no publicar perfiles, .env ni stderr crudo. No reejecutar un run
productivo para obtener esta evidencia.
