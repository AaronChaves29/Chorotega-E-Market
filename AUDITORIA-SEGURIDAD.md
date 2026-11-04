# Auditoría de seguridad — Laboratorio 7

Fecha: 3 de noviembre de 2026. Repositorio: `AaronChaves29/Chorotega-E-Market`.
El cierre documental del Bloque 6 se conserva como evidencia histórica. La revisión
posterior actualiza dependencias del frontend y su evidencia; no cambia lógica de
negocio ni activa despliegues.

## A. Resumen ejecutivo

Los bloques 1–5 corrigieron dependencias vulnerables del backend, autenticación de
cuentas inactivas, permisos desactualizados, falta de límites de autenticación,
sobrescrituras de productos y una consulta de propiedad que adquiría otra conexión
dentro de una transacción de entregas. Las correcciones están integradas en
`develop`, con evidencia de CI. **No está terminado todo el Laboratorio 7**:
`main` no contiene estas correcciones, el despliegue automático sigue deshabilitado
y la comprobación del sistema productivo queda pendiente.

El alcance original fue el backend NestJS y sus pruebas. La corrección posterior
del frontend, documentada en C, amplía la revisión a sus dependencias y verifica
localmente sus flujos contra NestJS y PostgreSQL temporal.

La comprobación posterior detecta cero paquetes señalados en los árboles de
producción de backend y frontend. Persisten avisos de desarrollo: 40 en backend
(39 moderados y uno bajo) y 16 moderados en frontend. Los conteos anteriores del
Bloque 6 eran exclusivamente del backend. No se declara ausencia total de
vulnerabilidades ni cobertura completa de OWASP.
La regresión local del frontend aprobó diez escenarios. La integración completa
del backend terminó 645/646 en dos ejecuciones por fallos de transporte distintos;
esta validación sigue abierta y no se presenta como aprobada (detalle en C).

### Versión y separación de evidencias

La tabla registra la base auditada antes del commit documental del Bloque 6;
las referencias a HEAD y la comparación de árboles corresponden a esa base.

| Ámbito            | Evidencia comprobada                                                                                                                | Alcance y límite                                                                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rama local        | `feat/lab-07-security-concurrency`, HEAD `2ff0eb98c9382b921561d924401787807373b5e1`                                                 | Solo `.gitignore` tenía una modificación local previa al cierre; se conserva intacta y sin staging.                                                                                                                                                               |
| Integración       | `upstream/develop` en `4503e0fb83e48fc3f9c5818fc6c99f38873c65ef`                                                                    | El [PR #101](https://github.com/AaronChaves29/Chorotega-E-Market/pull/101) integró el Bloque 5 el 3 de noviembre. `HEAD...upstream/develop`: cero commits exclusivos locales y un merge remoto; los árboles versionados coinciden. No se actualizó la rama local. |
| Publicación       | `upstream/main` en `a9f3c9df83d162dcf3d7c529a4597691306acd0c`                                                                       | Los commits de los bloques 1–5 no están en `main`. Hay 27 commits exclusivos de `develop` y cinco de `main`; no se asume un avance directo entre ambas ramas.                                                                                                     |
| CI de integración | [Ejecución #275](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41679190762), SHA `4503e0f`, completada con éxito | Build Backend y Build Frontend aprobados; Deploy production omitido. Sus logs confirman 533 casos Jest, 646 integraciones, nueve pruebas del artefacto, 17 de orquestación simulada y nueve escenarios Chrome.                                                    |
| Producción        | Sin operaciones ni consultas productivas en esta auditoría                                                                          | Un CI verde de `develop` no demuestra que Render/Vercel ejecuten estas correcciones ni que la migración de versión esté aplicada.                                                                                                                                 |

### Fuentes oficiales y rúbrica

Se leyeron los PDF locales `EIF509 Laboratorio 7 - Guía Completa.pdf`, páginas
2–3, y `EIF509 Sesión 14 - Seguridad Concurrencia y Frameworks.pdf`, láminas
6, 21–22, 25 y 28, disponibles en Downloads. Las páginas indicadas son las del
PDF; la rúbrica está en la página PDF 3, con pie de página 2.

| Criterio oficial                   | Puntos | Exigencia y estado de cierre                                                                                                                                                                                                                                       |
| ---------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pipeline CI/CD completo            |    2,5 | Compilación, pruebas, cobertura de negocio ≥70 %, despliegue automático solo desde `main` si todo pasa y secretos en GitHub Secrets. **Parcial**: verificaciones y protección de rama comprobadas; despliegue deshabilitado y sin validación real del orquestador. |
| Auditoría de seguridad documentada |    2,5 | Ocho puntos de la lámina 28 y categorías OWASP Top 10:2025 aplicables, con hallazgo, riesgo, corrección y commit. **Parcial**: documento consolidado; persisten avisos de desarrollo y comprobaciones productivas pendientes.                                      |
| Concurrencia controlada            |    2,0 | Versionado de una operación con contención, migración, 409 Problem Details y prueba que provoca conflicto. **Completo en código/pruebas de integración; parcial como entrega productiva**. Falta publicar y comprobar la migración y el contrato en producción.    |
| Observabilidad mínima              |    1,5 | JSON en stdout, eventos de login fallido/acceso denegado/conflicto sin secretos y `/actuator/health` sin detalles. **Parcial**: implementación y pruebas presentes; ruta NestJS distinta y validación productiva pendiente.                                        |
| Conjunto de pruebas                |    1,5 | ≥40 pruebas automatizadas verdes en CI, distribuidas entre unitarias, integración/API, con 401, 403 y concurrencia. **Completo en CI de `develop`**; pendiente el CI de la versión final de entrega.                                                               |

La entrega oficial es el **5 de noviembre de 2026 a las 18:00**, con sistema
desplegado y pipeline verde. La guía exige corregir en el repositorio y en el
sistema desplegado; documentar un hallazgo sin corregirlo no lo vuelve cumplido.

El [ADR-001](docs/adr/ADR-001-Seleccion-Stack-Tecnologico.md) registra autorización
del stack alternativo. Se usa `@VersionColumn`/TypeORM frente a `@Version`/Flyway y
Jest/Istanbul frente a JaCoCo. El health real es `/api/database/health`, no
`/actuator/health`. No existe evidencia en el ADR de aceptación individual de
esa ruta o de cada equivalencia de evaluación; confirmar con el profesor.

## B. Metodología

- Inspección de historial y referencias actualizadas con `git fetch upstream`,
  pertenencia de commits, PR #101, logs de CI y ruleset de `main`, sin cambiar de
  rama ni realizar merges.
- Auditoría del lockfile mediante npm, separando producción de desarrollo y
  conteos históricos de avisos publicados al consultar hoy. No se instalaron
  paquetes ni se ejecutó `audit fix`.
- Lectura de controladores, DTOs/mappers, guards, identidad vigente, sesiones,
  CSRF, consultas parametrizadas, filtros de errores, configuración TLS/CORS y
  todos los caminos de escritura del stock y las transacciones de entregas.
- Pruebas unitarias/HTTP y PostgreSQL 16 de Testcontainers: migraciones reales,
  `synchronize: false`, sin cargar `.env` ni usar Supabase/Atlas. Chrome prueba MVC;
  no equivale a una prueba del frontend Next.js ni de infraestructura remota.
- Búsqueda local de archivos sensibles versionados y patrones de secretos en
  1.742 objetos de texto históricos alcanzables por las referencias disponibles.
  Solo se reportan rutas/clasificación, nunca valores. No es una certificación
  exhaustiva de todo el historial, imágenes, referencias eliminadas o secretos
  de plataformas externas.

Los documentos de [dependencias](docs/laboratory/lab-07/dependencias-backend.md),
[identidad vigente](docs/laboratory/lab-07/autenticacion-vigente.md),
[rate limiting](docs/laboratory/lab-07/rate-limiting-backend.md),
[concurrencia](docs/laboratory/lab-07/concurrencia-optimista.md) y
[transacciones](docs/laboratory/lab-07/transacciones-entregas.md) conservan sus
validaciones históricas. También se consultaron [pipeline](docs/laboratory/lab-07/pipeline-ci-cd.md),
[observabilidad](docs/laboratory/lab-07/observabilidad-base.md) y
[evidencias de pruebas](docs/laboratory/lab-07/testing-evidence.md), sin modificarlos.
Las cifras anteriores, por ejemplo 634 integraciones antes del Bloque 5, no se
presentan como conteos actuales ni se suman a las nuevas ejecuciones.

## C. Hallazgos y correcciones

| Bloque                | Hallazgo y riesgo demostrado                                                                                                                                                                                                                  | Corrección aplicada y evidencia                                                                                                                                                                                                                                                                                   | Commit                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1 — Dependencias      | Paquetes con avisos conocidos; no se demostró explotación por HTTP. Había un aviso crítico y altos en el árbol de producción.                                                                                                                 | Actualizaciones compatibles del lockfile y overrides acotados. Se conserva NestJS 11 y no se usa `audit fix --force`. Detalle y estado actual debajo.                                                                                                                                                             | [c0025c4](https://github.com/AaronChaves29/Chorotega-E-Market/commit/c0025c4673e70f8f9466cb3fa08f729d64a44a91), PR #93  |
| 2 — Identidad vigente | Login podía admitir cuentas inactivas y los permisos podían quedar sujetos a información antigua del token/sesión.                                                                                                                            | [AuthService](apps/backend/src/auth/auth.service.ts) rechaza credenciales incorrectas/cuentas inactivas; [CurrentIdentityService](apps/backend/src/auth/current-identity.service.ts) verifica firma/expiración y consulta PK, estado y rol persistidos en cada solicitud protegida. MVC reutiliza esta identidad. | [46d4e3c](https://github.com/AaronChaves29/Chorotega-E-Market/commit/46d4e3c95ca02545703a0730d0c223affb3da65e), PR #94  |
| 3 — Límites           | Login REST, login MVC y registro carecían de presupuesto de solicitudes. Riesgo de automatización/consumo de recursos, sin atribuir un ataque observado.                                                                                      | [AuthRateLimitService](apps/backend/src/auth/rate-limit/auth-rate-limit.service.ts): reserva síncrona en memoria, 429 y `Retry-After`, recuperación de ventana y presupuestos separados.                                                                                                                          | [866c342](https://github.com/AaronChaves29/Chorotega-E-Market/commit/866c3429a6a8976c622d1fd5351d609cb6c5f53b), PR #96  |
| 4 — Productos         | Dos ediciones o una edición concurrente con una compra podían sobrescribir existencias sin detectar una lectura antigua.                                                                                                                      | [ProductsRepository.updateForActor](apps/backend/src/modules/products/repositories/products.repository.ts) ejecuta UPDATE atómico por ID, propietario y versión esperada; incrementa versión y usa RETURNING. La versión desactualizada visible produce 409 mediante servicio y filtro global.                    | [1d57dfa](https://github.com/AaronChaves29/Chorotega-E-Market/commit/1d57dfa3839bafdbef740466e5d404bd17ca6817), PR #98  |
| 5 — Entregas          | `startDelivery`/`completeDelivery` consultaban la propiedad con un repositorio global dentro de la transacción. Con pool de una conexión se reprodujo timeout al adquirir una segunda conexión. **No se demostró un deadlock de PostgreSQL**. | [DeliveriesService.assertCourierOwnsDelivery](apps/backend/src/modules/deliveries/services/deliveries.service.ts) recibe el EntityManager transaccional y construye el repositorio con él. Conserva propiedad, bloqueos y atomicidad.                                                                             | [2ff0eb9](https://github.com/AaronChaves29/Chorotega-E-Market/commit/2ff0eb98c9382b921561d924401787807373b5e1), PR #101 |

### Dependencias: resultado histórico y consulta actual

| Consulta                                 | Críticas | Altas | Moderadas | Bajas | Paquetes señalados |
| ---------------------------------------- | -------: | ----: | --------: | ----: | -----------------: |
| Bloque 1, 28 de octubre, todas antes     |        1 |     8 |         2 |     8 |                 19 |
| Bloque 1, todas después                  |        0 |     0 |         0 |     8 |                  8 |
| Bloque 1, producción antes               |        1 |     3 |         3 |     0 |                  7 |
| Bloque 1, producción después             |        0 |     0 |         0 |     0 |                  0 |
| Cierre documental, 3 de noviembre, todas |        0 |     0 |        39 |     1 |                 40 |
| Cierre documental, producción            |        0 |     0 |         0 |     0 |                  0 |

Son paquetes señalados por npm, incluidos dependientes transitivos, no 40 CVE
independientes. Se ejecutaron de nuevo, desde `apps/backend`:

```sh
npm audit --json --ignore-scripts --package-lock-only --registry=https://registry.npmjs.org
npm audit --json --ignore-scripts --package-lock-only --omit=dev --registry=https://registry.npmjs.org
```

Salidas: 1 para el árbol completo y 0 para producción. Los avisos actuales con
descripción propia son `deepmerge` ([GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)),
`glob` ([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)) y
`minimatch` ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)).
Alcanzan herramientas de CLI, ESLint, Jest y Testcontainers. Hay que evaluar
correcciones compatibles en otro bloque autorizado: npm propone también cambios
mayores/degradaciones que no se han validado. No se demostró explotación desde
las rutas del backend; tampoco se descarta riesgo en build/CI al procesar entradas
no confiables. Los ocho avisos bajos históricos no describen el estado actual.

Actualizaciones del Bloque 1 que se mantienen:

| Paquete         | Antes → después                                               |
| --------------- | ------------------------------------------------------------- |
| body-parser     | 2.3.0 → 2.4.0                                                 |
| proxy-addr      | 2.0.7 → 2.0.8                                                 |
| multer          | 2.2.0 → 2.5.0, override acotado a platform-express            |
| qs              | 6.15.3 → 6.17.1                                               |
| js-yaml         | Swagger 5.3.0 → 5.4.1; desarrollo 3.15.1/4.3.1 → 3.15.2/4.3.2 |
| @grpc/grpc-js   | 1.14.4 → 1.14.6                                               |
| undici          | 8.10.2 → 8.12.3                                               |
| brace-expansion | 1.1.18/2.1.4/5.0.9 → 1.1.21/2.1.7/5.0.12                      |
| fast-uri        | 3.1.5 → 3.1.9                                                 |
| content-type    | 2.0.0 → 2.1.0                                                 |

### Corrección posterior de dependencias del frontend — 3 de noviembre

Rama local `fix/lab-07-frontend-dependencies`, creada desde `upstream/develop`
en `c17a354e13c719a294898632a76e4613b1480357`, que contiene los PR #101 y #102.
Los cambios de este apartado están pendientes de commit, CI e integración;
no están publicados en producción. La tabla de Git de A pertenece al cierre
anterior y no describe el HEAD de esta corrección.

Se consultaron los PR abiertos y se actualizaron referencias: no había PR abiertos
ni cambios remotos recientes sobre estos manifiestos. Esto no permite conocer
trabajo local no publicado de otros colaboradores; repetir la comprobación antes
de publicar. La modificación previa de `.gitignore` se conserva intacta.

La auditoría inicial del frontend encontró cinco paquetes señalados en producción:
Next.js, su PostCSS anidado, Sharp, Nanoid y source-map-js. Los avisos incluyen RCE
condicionada a características/plataformas concretas, procesamiento de imágenes,
mapas de fuentes y disponibilidad. No se demostró explotación en el despliegue.
No se encontraron usos de `next/image`, `next/og`, Server Actions o `use cache`
en el código de la aplicación; esto no garantiza que toda superficie del framework
sea inaccesible. Entre los avisos críticos de Next están
[GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw) y
[GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr).

| Paquete                        | Versión anterior | Versión instalada y en lockfile |
| ------------------------------ | ---------------- | ------------------------------- |
| next                           | 16.2.12          | 16.4.5                          |
| eslint-config-next, desarrollo | 16.2.12          | 16.4.5                          |
| postcss, copia de Next         | 8.4.31           | 8.5.23                          |
| sharp                          | 0.34.5           | 0.35.5                          |
| nanoid                         | 3.3.16           | 3.3.20                          |
| source-map-js                  | 1.2.1            | 1.2.2                           |
| brace-expansion, desarrollo    | 1.1.18 / 5.0.9   | 1.1.21 / 5.0.12                 |
| js-yaml, desarrollo            | 4.3.1            | 4.3.2                           |
| zod, desarrollo                | 4.4.3            | 4.6.7                           |

React y React DOM conservan 19.2.4. La copia de PostCSS de Tailwind conserva
8.5.25; no era la copia señalada. El lockfile incorpora los binarios y componentes
asociados a Next/SWC y Sharp/libvips. No se agregaron dependencias directas,
overrides, cambios mayores de Next ni cambios en el backend. Las transitivas
seleccionadas satisfacen los rangos de sus consumidores; Next y su configuración
ESLint se mantienen fijados y alineados.

Desde `apps/frontend`, con Node.js 22.22.0 y npm 11.20.0:

```sh
npm install --save-exact --no-audit --no-fund next@16.4.5
npm install --save-dev --save-exact --no-audit --no-fund eslint-config-next@16.4.5
npm update brace-expansion js-yaml zod nanoid source-map-js --no-audit --no-fund
```

No se utilizó `--force`. Las auditorías siguientes se ejecutaron antes y después
con el registro público de npm, sin modificar el backend:

```sh
npm audit --json --ignore-scripts --registry=https://registry.npmjs.org
npm audit --json --ignore-scripts --omit=dev --registry=https://registry.npmjs.org
```

| Árbol / momento                            | Críticas | Altas | Moderadas | Bajas | Paquetes señalados | Salida |
| ------------------------------------------ | -------: | ----: | --------: | ----: | -----------------: | -----: |
| Frontend completo, antes                   |        1 |     7 |        15 |     0 |                 23 |      1 |
| Frontend producción, antes                 |        1 |     4 |         0 |     0 |                  5 |      1 |
| Frontend completo, después                 |        0 |     0 |        16 |     0 |                 16 |      1 |
| Frontend producción, después               |        0 |     0 |         0 |     0 |                  0 |      0 |
| Backend producción, comprobación posterior |        0 |     0 |         0 |     0 |                  0 |      0 |

Los 16 paquetes del frontend corresponden a una causa raíz restante:
`minimatch` ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)),
transitivo de ESLint/configuración de Next/typescript-eslint. El consumidor
`@next/eslint-plugin-next` actualizado también queda señalado: por eso hay 16
paquetes moderados en vez de los 15 iniciales, sin un GHSA raíz nuevo. Los avisos
altos y críticos iniciales ya no aparecen en los árboles locales auditados.
No se suman paquetes transitivos como CVE independientes.

El parche de minimatch comienza en 11.0.1, fuera de los rangos actuales 3/10 de
estos consumidores. No se fuerza globalmente esa versión por sus cambios de API.
El backend conserva los avisos de desarrollo documentados antes (deepmerge,
glob y minimatch); no se actualizó su manifiesto ni su lockfile. Estos avisos
permanecen pendientes, no corregidos por excluir desarrollo de una consulta.

#### Regresión local de esta corrección

Se utilizaron Node.js 22.22.0, el build real de Next 16.4.5, NestJS con módulos
reales de Auth/catálogo/pedidos, las cuatro migraciones reales y PostgreSQL 16
exclusivo de Testcontainers. No se cargaron `.env` privados, AppModule/MongoDB,
seeds globales ni servicios productivos. El servidor Next se ejecutó desde un
directorio temporal sin archivos de entorno, apuntando únicamente al backend
local; se utilizaron puertos dinámicos y credenciales ficticias efímeras.

El arnés temporal `/tmp/chorotega-frontdeps-regression.cjs` ejecutó diez escenarios:

1. HTML público y redirecciones de `/pedidos` y `/pedidos/nuevo` sin sesión.
2. API de pedidos con 401 sin cookie y con cookie inválida.
3. Registro inválido sin escritura y registro válido CLIENTE con hash bcrypt.
4. Login incorrecto 401 y correcto 200; cookie HttpOnly/Secure/SameSite Lax,
   sin token en el body de respuesta de Next.
5. Catálogo, filtros y paginación real de tiendas/productos, y consulta de barrios.
6. Pedido inválido sin escritura y compra válida con importes exactos, stock,
   versión, detalle y listado persistidos.
7. Chrome: validación visible de registro, conservación del formulario y creación.
8. Chrome: login incorrecto/correcto, navegación al listado e inaccesibilidad de
   la cookie HttpOnly desde JavaScript.
9. Chrome: selección de tienda/productos, resumen existente de compra,
   formulario incompleto bloqueado, creación real y regreso al listado.
10. Chrome: logout, redirección de ruta protegida y retorno de la API a 401.

Son seis escenarios HTTP y cuatro de navegador: TAP 11/11 incluye una
contenedora y no representa once escenarios funcionales. No se desactivaron
JWT/roles ni se simuló el backend. Las escrituras se comprobaron en PostgreSQL
con datos ficticios, incluido el incremento de versión al comprar. Esto verifica
el flujo de selección/resumen disponible; no incorpora un carrito nuevo.

El arnés y sus logs están fuera del repositorio: no se agrega una suite ni un
script de frontend al CI. Es evidencia local reproducible durante esta sesión,
no una prueba permanente ni una comprobación de Vercel/Render. No se probaron
certificados HTTPS ni ajustes de proveedores. La carga del módulo nativo Sharp
0.35.5 y una codificación PNG de un píxel también funcionaron en Node 22.22.0.

| Verificación de esta corrección                           | Resultado                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ESLint frontend y backend                                 | Aprobados                                                                                             |
| TypeScript frontend y backend, sin emisión ni incremental | Aprobados                                                                                             |
| Build frontend y backend                                  | Aprobados                                                                                             |
| Unitarias backend y cobertura existente                   | 533/533, 43 suites                                                                                    |
| Integración backend completa                              | Dos ejecuciones: 645/646 cada una, código 1; socket hang up en casos distintos, detallados debajo     |
| Suites afectadas aisladas                                 | Categories 43/43 y seguridad del catálogo 88/88; subconjuntos de la integración, no casos adicionales |
| Chrome MVC backend                                        | 9/9 escenarios; TAP 10/10 incluye la contenedora                                                      |
| Regresión Next/Nest/PostgreSQL temporal                   | 10/10 escenarios, incluidos cuatro Chrome; TAP 11/11                                                  |
| Sharp nativo                                              | Carga y PNG local aprobados                                                                           |
| npm ls frontend                                           | Código 0, sin problemas en el árbol instalado                                                         |
| Prettier y git diff --check                               | Aprobados sobre los archivos modificados                                                              |

La primera integración de esta corrección terminó 645/646: el caso
`Categorías: API real con PostgreSQL PATCH rechaza {"nombre":null}` recibió
`socket hang up`, sin código HTTP ni Problem Details. Categories aislado aprobó
43/43 sin cambios. La repetición completa también terminó 645/646, ahora en
`Catálogo: seguridad de escrituras con JWT real y PostgreSQL patch categories ADMIN autorizado conserva el contrato HTTP`,
con el mismo error de transporte y sin respuesta HTTP. No se modificaron backend,
dependencias backend, guards, expectativas ni timeouts. Las dos ejecuciones
completas fallaron y no se presentan como aprobadas; tampoco se suman sus casos
para construir un resultado verde. No se identificó la causa ni se demostró
relación con la actualización de Next. La suite de seguridad del catálogo
aislada aprobó 88/88 después del segundo fallo, sin cambios. Los resultados
aislados no reemplazan las dos ejecuciones completas fallidas. La incidencia
queda pendiente antes de considerar cerrada la validación de integración.

Los resultados de las tablas anteriores del Bloque 6 se conservan como
históricos; no se presentan como nuevas ejecuciones de este cambio. La cobertura
sigue limitada a pedidos/entregas, con los umbrales/exclusiones existentes.
El comportamiento en Node 24 del CI frontend y las plataformas de despliegue
queda pendiente de la publicación autorizada y sus comprobaciones remotas.

### Identidad, permisos y límites

Los guards [JWT](apps/backend/src/auth/guards/jwt-auth.guard.ts) y
[roles](apps/backend/src/auth/guards/roles.guard.ts) siguen activos. Una cuenta
eliminada/inactiva o un token inválido/expirado recibe 401; un rol vigente no
permitido recibe 403. La identidad se consulta una vez por solicitud protegida,
sin seleccionar hashes ni `authId`. El registro público solo crea CLIENTE:
no permite autoasignarse ADMIN. Un error de persistencia conserva un 500 seguro,
no se transforma artificialmente en credenciales incorrectas.

MVC mantiene [sesión AES-256-GCM](apps/backend/src/admin/admin-session.service.ts),
cookie HttpOnly/SameSite Strict/Secure en producción, rotación al autenticar y
[CSRF ligado a sesión](apps/backend/src/admin/admin.guards.ts). Conserva
Referrer-Policy same-origin, formularios escapados y PRG 303. La vigencia de
permisos se vuelve a comprobar en el backend; el rol mostrado por el frontend
no constituye autorización. No hay revocación individual de JWT: una cuenta
reactivada puede reutilizar un token aún vigente y una solicitud ya autorizada
no se cancela retroactivamente al cambiar su estado.

| Operación limitada           | Límite predeterminado | Ventana |
| ---------------------------- | --------------------: | ------: |
| POST `/api/v1/auth/login`    |        60 solicitudes |    60 s |
| POST `/admin/login`          |        20 solicitudes |    60 s |
| POST `/api/v1/auth/register` |        10 solicitudes |    60 s |

Configuración: `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_LOGIN_MAX_REQUESTS`,
`ADMIN_LOGIN_MAX_REQUESTS` y `AUTH_REGISTER_MAX_REQUESTS`. Se cuentan éxitos,
fallos y entradas inválidas que alcanzan el guard. `Retry-After` indica segundos
positivos; las denegaciones no prolongan la ventana. El 429 no revela existencia,
estado o rol de una cuenta; el registro conserva su 409 previo de correo duplicado.

**Son límites globales por operación e instancia, no por usuario ni IP, y no
distribuidos.** No existe una cadena de proxies confiables verificada en Render;
se ignoran X-Forwarded-For y encabezados similares para estos presupuestos.
Falsificar una IP no abre otro contador. Reiniciar limpia memoria, las réplicas
tienen presupuestos independientes y un atacante puede agotar el presupuesto
compartido, afectando usuarios legítimos. El proxy Next.js conserva 429 pero no
reenvía `Retry-After`; la prueba del encabezado corresponde al backend.

### Concurrencia, inventario y transacciones

[Product.version](apps/backend/src/modules/products/entities/product.entity.ts)
usa `@VersionColumn`. La [migración 1793296800000](apps/backend/src/database/migrations/1793296800000-AddProductVersion.ts)
agrega `version integer NOT NULL DEFAULT 1`, conservando productos existentes.
Está registrada en [migraciones de producción](apps/backend/src/database/production-migrations.ts),
el helper de Testcontainers y la infraestructura de navegador.
**Debe aplicarse antes de utilizar el backend y el contrato de edición nuevos**;
su aplicación productiva no se verificó ni se ejecutó en este cierre.

PATCH `/api/v1/products/:id` requiere `version` entera positiva de 32 bits en el
body. GET/POST/PATCH exponen la versión mediante DTO; precio conserva string.
Un cliente debe leer la versión, enviarla al editar y recargar/conciliar ante
409; no debe reintentar una sobrescritura automáticamente. Versión ausente o
inválida produce 400. JWT inválido: 401; rol prohibido: 403; recurso/destino ajeno
o inexistente: 404. El conflicto de versión se informa con 409 únicamente para
un recurso autorizado cuya versión haya quedado desactualizada.
Ejemplo ilustrativo del contrato probado, sin datos productivos:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "El producto cambió desde su lectura. Consulte la versión vigente antes de volver a editar.",
  "instance": "/api/v1/products/1"
}
```

La traducción exacta está en [ProductsService](apps/backend/src/modules/products/products.service.ts)
y el [filtro global](apps/backend/src/common/filters/problem-details.filter.ts).
El UPDATE verifica simultáneamente versión y propiedad de origen/destino.
`RETURNING` obtiene el resultado de esa misma escritura. Un PATCH con solo
versión también consume la versión. No basta la anotación del ORM.

Las compras conservan [FOR UPDATE ordenado por ID](apps/backend/src/modules/products/repositories/products.repository.ts)
y la [transacción de pedidos](apps/backend/src/modules/orders/transactions/order-transaction.ts).
Guardar el inventario incrementa también la versión y el rollback revierte ambos.
Se prueban los dos órdenes de ejecución compra/edición. No se modificó frontend:
actualmente no consume PATCH de productos; cualquier consumidor futuro deberá
enviar la precondición. DELETE no incorpora este contrato de versión.

En entregas se conserva el orden de bloqueos y las cuatro operaciones
transaccionales. Se prueba asignar/iniciar/completar con pool de una conexión,
propiedad, cancelación, carreras y fallos posteriores a escrituras reales con
rollback total. El uso del EntityManager elimina la segunda adquisición en la
consulta identificada; no garantiza ausencia de cualquier saturación o deadlock
en otras cargas. Los timeouts acotados de las regresiones son de pruebas, no una
modificación de la configuración productiva.

## D. Los ocho puntos exactos de la lista del profesor

Fuente: Sesión 14, **lámina 28, “Revisión de seguridad del sistema propio”**.
Se conserva la referencia a JPA del enunciado y se evalúa su equivalente TypeORM.
“Completo” significa comprobado en el código/pruebas indicados; ninguna fila
certifica por sí sola el despliegue productivo.

| #   | Verificación exacta                                   | Estado                                    | Evidencia concreta y pruebas                                                                                                                                                                                                                                                                                                                                 | Hallazgo, corrección y riesgo pendiente                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Un usuario no puede ver ni modificar recursos de otro | Completo en las rutas protegidas probadas | Guards vigentes; [OrdersReadService](apps/backend/src/modules/orders/services/orders-read.service.ts), repositorios de pedidos/entregas con alcance SQL y escrituras del catálogo con propiedad. `current-identity`, `catalog-write-security`, `orders`, `deliveries` y `security` HTTP prueban 401/403/404 y propiedad.                                     | El [Bloque 2](https://github.com/AaronChaves29/Chorotega-E-Market/commit/46d4e3c95ca02545703a0730d0c223affb3da65e) corrige permisos antiguos; el [Bloque 5](https://github.com/AaronChaves29/Chorotega-E-Market/commit/2ff0eb98c9382b921561d924401787807373b5e1) conserva propiedad dentro de la transacción. ADMIN puede administrar recursos ajenos por política; GET públicos de catálogo/barrios/repartidores son excepciones intencionales, no aislamiento entre cuentas. Falta comprobación productiva. |
| 2   | Ningún endpoint devuelve una entidad JPA              | Completo en los contratos inspeccionados  | Controladores REST devuelven DTOs, paginación de DTOs o vacío; [UserMapper](apps/backend/src/modules/users/mappers/user.mapper.ts) selecciona ocho campos y omite hash/authId/relaciones. OpenAPI, Users, Orders y catálogo HTTP verifican respuestas; MVC produce HTML escapado.                                                                            | No se encontró exposición directa de entidades por estos controladores. Métodos internos que devuelven entidades no son endpoints. Fronteras DTO preexistentes; el [Bloque 4](https://github.com/AaronChaves29/Chorotega-E-Market/commit/1d57dfa3839bafdbef740466e5d404bd17ca6817) añade versión al DTO, no una entidad pública.                                                                                                                                                                              |
| 3   | No hay consultas construidas concatenando texto       | Completo en los caminos inspeccionados    | Repositorios usan parámetros para valores. La interpolación de nombres en Users/Orders procede de listas internas; sort usa whitelist. Mongo filtra por `pedidoId` tipado, no recibe operadores del cliente. Pruebas de filtros/orden inválido y [concurrencia real](apps/backend/test/integration/http/product-optimistic-concurrency.integration-spec.ts). | No se halló concatenación de valores no confiables en SQL ejecutado. SQL de migraciones y nombres fijos no son datos de usuario. El [Bloque 4](https://github.com/AaronChaves29/Chorotega-E-Market/commit/1d57dfa3839bafdbef740466e5d404bd17ca6817) conserva parámetros en CAS. No equivale a un pentest exhaustivo de SQL/NoSQL.                                                                                                                                                                             |
| 4   | Los errores no envían la traza al cliente             | Completo en los casos probados            | [Problem Details](apps/backend/src/common/http/problem-details.ts), filtro global y adaptadores explícitos; se omite la query de `instance`. `http-foundation`, Users, Orders y Deliveries provocan errores y comprueban que no salen SQL, stack ni secretos.                                                                                                | 500 genérico para errores desconocidos; MVC conserva error HTML seguro. No se convierten errores desconocidos en conflictos. Implementación HTTP previa conservada y regresiones de los bloques 2/4/5; no fue necesario corregir el filtro en este cierre.                                                                                                                                                                                                                                                    |
| 5   | CORS solo permite el dominio de la SPA                | Parcial                                   | [environment.ts](apps/backend/src/config/environment.ts) exige orígenes HTTPS exactos en producción y rechaza comodines; [configureHttp](apps/backend/src/common/http/configure-http.ts) usa allowlist. `start-http-server.spec.ts` prueba origen permitido, ajeno, null y preflight.                                                                        | El código permite una lista explícita, no obliga a un único dominio SPA: MVC del mismo origen puede requerir también el origen del backend porque CORS se aplica globalmente a POST con Origin. Sin Origin se permite acceso no navegador. No es autenticación. Configuración segura del Lab 6 conservada; valores reales de Render no inspeccionados. Confirmar alcance aceptado y lista mínima, sin desactivar CSRF/CORS.                                                                                   |
| 6   | No hay secretos en el repositorio ni en su historial  | Parcial                                   | `git ls-files` solo detectó `.env.example` como archivo de entorno versionado; búsqueda de historial por rutas privadas sin coincidencias. Escaneo de 1.742 objetos de texto para claves privadas, tokens de proveedores/JWT y URI con credenciales.                                                                                                         | No se identificaron secretos reales en los candidatos revisados: ejemplos/localhost en README y `.env.example`, y marcadores ficticios en pruebas de diagnóstico. No se copiaron sus valores. Sin corrección nueva: búsqueda limitada, sin garantía sobre imágenes, referencias borradas, paneles o credenciales antiguas no reconocibles. No se auditó el contenido de `.env` privados. Si se descubre un secreto, revocar/rotar antes de limpiar historial.                                                 |
| 7   | Las claves se guardan con BCrypt y el JWT expira      | Completo en código/pruebas                | [AuthService](apps/backend/src/auth/auth.service.ts) hace bcrypt hash con coste 10; [AuthModule](apps/backend/src/auth/auth.module.ts) firma con expiración 3.600 s. Registro HTTP compara el hash persistido; identidad vigente prueba tokens expirados y cuentas inactivas.                                                                                | Se mantiene criptografía existente; el [Bloque 2](https://github.com/AaronChaves29/Chorotega-E-Market/commit/46d4e3c95ca02545703a0730d0c223affb3da65e) verifica vigencia antes de autorizar. Validación productiva exige JWT_SECRET ≥32 caracteres. Longitud no demuestra entropía; no se leyeron hashes, claims o secretos productivos.                                                                                                                                                                      |
| 8   | Las dependencias no tienen vulnerabilidades conocidas | Parcial                                   | Auditorías npm de backend y frontend; resultados anteriores y posteriores en C. Producción: cero paquetes señalados en cada aplicación. Desarrollo: 40 en backend y 16 moderados en frontend.                                                                                                                                                                | El [Bloque 1](https://github.com/AaronChaves29/Chorotega-E-Market/commit/c0025c4673e70f8f9466cb3fa08f729d64a44a91) corrigió los avisos iniciales del backend; la corrección frontend posterior está local y pendiente de commit/CI/despliegue. Los avisos residuales siguen pendientes. Dependabot no verificado.                                                                                                                                                                                             |

Los archivos de integración citados están en
[`apps/backend/test/integration/http/`](apps/backend/test/integration/http/).
No se inventaron ocho categorías sustitutas: son las ocho filas de la fuente.

## E. OWASP Top 10:2025

Se contrastó la lámina 6 con la [lista oficial OWASP 2025](https://top10.owasp.org/2025/).
La siguiente es una relación de controles concretos, no certificación OWASP/ASVS
ni prueba de resistencia a todos los ataques de cada categoría.

| Categoría                                    | Aplicación, hallazgo y control comprobado                                                                                                                                                                                       | Commit o base existente; límite                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 — Broken Access Control                  | Aislamiento de pedidos/entregas, escrituras de catálogo por propietario y permisos persistidos actuales. Pruebas de otros usuarios, roles, 401/403/404.                                                                         | Bloques 2, 4 y 5, commits de C. No sustituye comprobación productiva ni revisión de futuros endpoints.                                                                                                                                                                                                    |
| A02 — Security Misconfiguration              | Validación dev/prod, TLS con certificados verificados, CORS explícito y cookies seguras. CSP/escape para MVC.                                                                                                                   | Base del Lab 6, conservada. Swagger es público por configuración: documenta contratos, no evita guards; decidir exposición según política. No se verificaron paneles ni todas las cabeceras de REST/SPA.                                                                                                  |
| A03 — Software Supply Chain Failures         | Actualizaciones, lockfile y `npm ci`; auditoría renovada encuentra avisos residuales de desarrollo.                                                                                                                             | Bloque 1. Pendiente evaluar parches y hardening de dependencias/actions; no se verificaron firmas/proveniencia de toda la cadena.                                                                                                                                                                         |
| A04 — Cryptographic Failures                 | bcrypt, JWT con expiración, AES-GCM para sesión MVC y TLS verificado en configuración.                                                                                                                                          | Base criptográfica previa y Bloque 2. No se probaron remotamente certificados, rotación ni entropía de secretos.                                                                                                                                                                                          |
| A05 — Injection                              | Parámetros SQL, whitelist de columnas, DTOs, filtros Mongo tipados y escape Handlebars. Se prueban campos adicionales/orden inválido y XSS escapado.                                                                            | Base REST/MVC y Bloque 4. No se encontró concatenación de valores revisados; no hay pentest exhaustivo ni pruebas Atlas reales.                                                                                                                                                                           |
| A06 — Insecure Design                        | Reglas server-side, precios calculados en backend, control de versión, stock transaccional y límites de autenticación.                                                                                                          | Bloques 3–5 y proceso de pedidos previo. Presupuesto global puede agotarse y la protección no es distribuida.                                                                                                                                                                                             |
| A07 — Authentication Failures                | Rechazo de inactivos, JWT vigente, roles actuales y límites REST/MVC/registro.                                                                                                                                                  | Bloques 2–3. No hay MFA ni revocación individual; el registro informa correo duplicado por contrato existente.                                                                                                                                                                                            |
| A08 — Software or Data Integrity Failures    | El pipeline obtiene el SHA aprobado y comprueba SHA/metadata de despliegue; MVC verifica la autenticidad de su cookie con AES-GCM. La consistencia transaccional del stock no demuestra por sí sola autenticidad de artefactos. | Base MVC y [9f15ffb](https://github.com/AaronChaves29/Chorotega-E-Market/commit/9f15ffbc75ba4947541a9f04f0f670022ad1475d). Job de despliegue automático deshabilitado; no se ha demostrado verificación completa de firmas/proveniencia ni ejecución real del orquestador.                                |
| A09 — Security Logging and Alerting Failures | JSON stdout para `login_failed`, `access_denied` y `concurrency_conflict`, sin errores/cuerpos arbitrarios. Pruebas de sanitización y fallo síncrono del sink.                                                                  | [927d1d5](https://github.com/AaronChaves29/Chorotega-E-Market/commit/927d1d57d198f98dc0e0c81ed5736de859306beb), [0e2b857](https://github.com/AaronChaves29/Chorotega-E-Market/commit/0e2b85790acbffa85e5703ab15128e4b9522da64). Best effort, sin persistencia garantizada/alertas operativas demostradas. |
| A10 — Mishandling of Exceptional Conditions  | Errores seguros, 409 conocido y rollback de escrituras reales; pool pequeño y timeouts controlados.                                                                                                                             | Bloques 2, 4 y 5 y filtro previo. Se probó agotamiento del pool identificado, no imposibilidad de cualquier deadlock/fallo externo.                                                                                                                                                                       |

## F. Pruebas y riesgos residuales

### Comprobaciones del cierre documental del Bloque 6 (históricas)

Las pruebas siguientes se ejecutaron al preparar el Bloque 6. En la revisión
previa al commit se contrastaron sus informes, sin repetir las suites funcionales.
Node.js **22.22.0**. Informes generados fuera del repositorio bajo `/tmp/chorotega-b6-*`;
no se incorporan logs ni credenciales. Las ejecuciones del Bloque 5 citadas en
su documento son históricas; la tabla siguiente corresponde a este cierre.

| Comprobación                                                | Resultado local del 3 de noviembre                                               |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ESLint completo, TypeScript sin emisión/incremental y build | Aprobados, códigos 0                                                             |
| Jest con cobertura existente                                | 533/533, 43 suites, código 0                                                     |
| Integración completa, primer intento                        | 645/646, 25/26 suites aprobadas, código 1, aproximadamente 103 s                 |
| Products aislado después del fallo                          | 61/61, código 0                                                                  |
| Integración completa, repetición                            | 646/646, 26 suites, código 0, aproximadamente 101 s                              |
| Artefacto JavaScript compilado                              | 9/9, código 0                                                                    |
| Chrome MVC                                                  | Nueve escenarios aprobados; TAP 10/10 incluye la contenedora, código 0           |
| Orquestación de despliegue simulada, sin red                | 17/17, código 0; no ejecuta despliegues                                          |
| Prettier documental, enlaces locales y `git diff --check`   | Aprobados; se verificaron los destinos locales referenciados en ambos documentos |

La primera integración falló en Products, caso
`disponible=false filtra cero stock sin confundirlo con estado`, por
`socket hang up`: no se obtuvo código HTTP ni Problem Details. Products aislado
aprobó luego sin cambios y la repetición completa aprobó 646/646. No se identificó
la causa ni se presenta como corregida.
Las pruebas específicas de identidad, límites, 409, propiedad, concurrencia,
migración y rollback forman parte de la integración completa; no son casos
adicionales para sumar otra vez. E2E selecciona un subconjunto HTTP de esa misma
integración; no se ejecutó por separado en este cierre. No se ejecutó instalación
limpia ni pruebas automatizadas del frontend.

Cobertura local y CI #275, conservando umbrales/exclusiones existentes:

| Métrica    | Resultado | Mínimo |
| ---------- | --------: | -----: |
| Statements |   97,50 % |   70 % |
| Branches   |   84,63 % |   70 % |
| Functions  |   92,00 % |   70 % |
| Lines      |   97,74 % |   70 % |

Mide los archivos seleccionados de pedidos/entregas: excluye entidades,
repositorios, interfaces, módulos y tests. No mide todo backend, Auth, MVC,
logger ni frontend. Superar esos cuatro umbrales no demuestra cobertura total
de seguridad. El script `test:cov` hace fallar CI al incumplirlos.

Comandos de validación reproducibles desde `apps/backend`, con Docker disponible:

```sh
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
npm run test:cov -- --runInBand
npm run test:integration
npm run test:integration -- --testPathPatterns='http/products.integration-spec.ts'
npm run test:deployment
npm run test:browser
node --test ../../scripts/ci/production-deploy.test.mjs
```

Los comandos de migración/arranque productivo **no** se ejecutan para esta
auditoría. Las pruebas usan bases efímeras y eliminan sus recursos; no se utiliza
el contenedor PostgreSQL local preexistente.

`docker ps` final confirmó que no quedaron contenedores temporales de estas
ejecuciones. Se conservó únicamente el PostgreSQL preexistente, sin operaciones
sobre él. No se reprodujeron en este cierre el 401 de Users ni el incidente de
inicialización de Chrome; esto no demuestra que sus causas estén resueltas.

### Riesgos de seguridad, operación y pruebas

| Tipo / prioridad                 | Riesgo y evidencia                                                                                                                                                        | Acción pendiente                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Seguridad / media                | Backend con 40 paquetes de desarrollo señalados y frontend con 16 moderados; ambos árboles productivos auditados sin avisos.                                              | Evaluar parches compatibles en otro bloque autorizado; no forzar versiones mayores ni presentar los residuales como corregidos.                                                      |
| Seguridad / media                | Límites compartidos por instancia, reiniciables y sin identificación fiable del cliente tras proxies.                                                                     | Aceptar expresamente el riesgo de agotamiento global o diseñar protección distribuida/proxy confiable antes de escalar.                                                              |
| Seguridad / media                | Estado de secretos, orígenes y permisos externos no verificado; análisis histórico limitado a texto y patrones.                                                           | Revisar plataforma e historial con procedimiento seguro, sin extraer valores a la evidencia.                                                                                         |
| Operación / alta para la entrega | Lab 7 ausente de `main`; producción y aplicación de la migración de versión no verificadas.                                                                               | Publicar solo con autorización, respaldo y comprobación de migraciones antes de utilizar PATCH con versión; validar posteriormente el SHA y contrato realmente publicados.           |
| Operación / alta                 | Render y Vercel no forman una transacción de despliegue. Un proveedor puede actualizarse y el otro fallar; un timeout no necesariamente cancela el trabajo remoto.        | Primera liberación controlada, evitar nuevos pushes durante ella, comprobar ambos SHA/health y preparar recuperación compatible con migraciones. No revertir DDL con datos a ciegas. |
| Operación / media                | El orquestador verifica `main` antes de fases críticas, pero existe intervalo entre verificación y acción remota.                                                         | Conservar deploy deshabilitado hasta autorizar/verificar configuración; coordinar exclusión durante la primera liberación. Tests simulados no prueban plataformas reales.            |
| Operación / media                | Eventos best effort en stdout, sin persistencia/alertas garantizadas; health solo PostgreSQL, sin deadline propio de consulta ni comprobación Atlas.                      | Verificar recepción de eventos y health en despliegue; acordar equivalencia académica. No se afirma que se haya implantado monitorización completa.                                  |
| Pruebas / media                  | Incidentes históricos de Chrome/Users/socket hang up; Bloque 6 observó Products y la corrección frontend observó dos socket hang up en Categories/seguridad del catálogo. | Mantener abierta la validación completa; no atribuir causas ni declarar correcciones por pases aislados. No cambiar guards, expectativas o timeouts para ocultarlos.                 |
| Académico / media                | Health distinto a `/actuator/health` y herramientas equivalentes a las Java de la guía.                                                                                   | Confirmar aceptación específica; ADR del stack no demuestra equivalencia individual de todos los entregables.                                                                        |

El [ruleset de main](https://github.com/AaronChaves29/Chorotega-E-Market/rules/26098619)
se consultó en modo lectura: activo, dirigido a `main`, PR obligatorio, eliminación
y force push bloqueados, checks `Build Backend`/`Build Frontend` obligatorios y
rama actualizada exigida. Exige cero aprobaciones: PR obligatorio no equivale a
revisión humana aprobatoria obligatoria. No se probaron intentos de bypass/escritura.
Los seis secrets y dos variables del pipeline y los auto-deploy de proveedores
constan como configuración reportada en el contexto, no como valores/paneles
independientemente comprobados aquí. No se consultaron ni publicaron secretos.

## G. Matriz de cierre y conclusiones

| Requisito                                      | Implementación / archivo                                                          | Prueba y evidencia                                                                                                                               | Estado                                                                           |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Corregir dependencias vulnerables              | Manifiestos/lockfiles backend (Bloque 1) y frontend (corrección posterior)        | Comparación de auditorías, versiones instaladas y regresiones reales de C                                                                        | Parcial: producción sin avisos locales; desarrollo y publicación pendientes      |
| Corrección de dependencias frontend            | Next/eslint-config-next 16.4.5 y transitivas compatibles; sin cambios funcionales | Producción cero avisos, diez regresiones reales locales; dos integraciones backend incompletas                                                   | Implementada localmente; fallo de integración abierto y CI/despliegue pendientes |
| Identidad y permisos vigentes REST/MVC         | CurrentIdentityService, AuthService, guards/sesión                                | `current-identity.integration-spec.ts` y unitarias; commit Bloque 2                                                                              | Completo en código/CI; pendiente publicación                                     |
| Restringir automatización de autenticación     | `auth/rate-limit/`, configuración y guards                                        | `rate-limiting.integration-spec.ts`, recuperación/429/Retry-After/cabeceras falsas; Bloque 3                                                     | Completo para alcance global por instancia; riesgo compartido documentado        |
| Edición concurrente e inventario               | Product.version, migración, ProductsRepository/Service, pedidos                   | 13 casos HTTP de concurrencia y migración incremental; Bloque 4                                                                                  | Completo en pruebas; parcial para entrega productiva                             |
| Coherencia transaccional de entregas           | DeliveriesService usa manager para propiedad                                      | [12 casos nuevos](apps/backend/test/integration/deliveries-transactions.integration-spec.ts), asignación concurrente y rollback previo; Bloque 5 | Completo en código/CI; pendiente publicación                                     |
| Auditoría de ocho puntos y OWASP 2025          | Este documento, secciones C–E                                                     | Fuentes oficiales localizadas, inspección, npm y pruebas                                                                                         | Parcial: puntos 5/6/8 y verificación productiva pendientes                       |
| Justificación de contención en README          | Sección Lab 7 con enlace a diseño/auditoría                                       | Explica versión, 409 y bloqueos de compras                                                                                                       | Completo documental en este bloque; pendiente integración                        |
| ≥40 tests, seguridad y conflicto en CI         | Jest/Testcontainers/Chrome, workflow existente                                    | CI #275: 533 Jest, 646 integración; no duplicar subconjuntos                                                                                     | Completo en `develop`                                                            |
| Cobertura ≥70 % en negocio                     | Configuración Jest existente                                                      | Cuatro métricas superiores al umbral; reporte local y CI                                                                                         | Completo en alcance medido; equivalencia JaCoCo por confirmar                    |
| Pipeline y main protegida                      | Workflow/scripts/ruleset, sin modificaciones en este bloque                       | Backend/frontend verdes, 17 tests simulados de orquestación                                                                                      | Parcial: deploy sigue `false`, no hay ejecución productiva automática validada   |
| Observabilidad mínima                          | JsonLogger, filtros, repositorio, HealthModule                                    | Pruebas JSON/eventos/health; commits enlazados en E                                                                                              | Parcial: evidencia local/CI; ruta académica y despliegue pendientes              |
| Sistema corregido desplegado y evidencia final | Publicación `develop` → `main` y proveedores                                      | No ejecutado en este cierre                                                                                                                      | Pendiente                                                                        |

Los bloques 1–5 están integrados y sus regresiones constan en CI de `develop`.
Este documento y el README completan el cierre documental local, sin modificar
los documentos históricos de otros bloques, CI/CD, observabilidad ni `.gitignore`.

Para la entrega faltan: tratar o justificar los avisos residuales sin marcarlos
resueltos, confirmar equivalencias exigidas, publicar la versión final y aplicar
la migración de forma autorizada, verificar producción y completar la activación
controlada/evidencia del despliegue automático. **No activar el job ni efectuar
operaciones productivas basándose únicamente en esta auditoría documental.**
