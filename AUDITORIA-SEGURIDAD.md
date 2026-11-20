# Auditoría de seguridad — Laboratorio 7 y cierre de Chorotega E-Market

**Fecha de actualización:** 19 de noviembre de 2026  
**Proyecto:** Chorotega E-Market  
**Repositorio:** [AaronChaves29/Chorotega-E-Market](https://github.com/AaronChaves29/Chorotega-E-Market)  
**Versión examinada:** rama `main`, commit `e4639d5d6483896cae70806529098431e9d04a9e` (PR [#155](https://github.com/AaronChaves29/Chorotega-E-Market/pull/155))  
**Estado del documento:** revisión consolidada del cierre, con hallazgos y riesgos pendientes explícitos. **No es una certificación de seguridad ni acredita por sí sola un despliegue automático.**

> **Trazabilidad histórica.** El documento original del Laboratorio 7, fechado el 3 de noviembre de 2026, evaluó los Bloques 1–6 y conserva su evidencia en el historial de Git. Esta revisión incorpora el estado del sistema publicado el 19 de noviembre, sin presentar resultados históricos como nuevas pruebas ni atribuir correcciones a problemas que siguen abiertos. Los enlaces a commits, PR y documentación histórica permiten consultar el detalle de cada hallazgo.

## A. Resumen ejecutivo

El proyecto utiliza un frontend **Next.js/React** (Vercel), una API y panel administrativo MVC **NestJS/TypeORM/Handlebars** (Render), **PostgreSQL** (Supabase) para los datos transaccionales y **MongoDB Atlas** para la bitácora de pedidos y entregas. El acceso aplica JWT, identidad vigente desde PostgreSQL, cookies HttpOnly para el frontend y sesiones administrativas con protección CSRF.

El proyecto ya fue integrado a `main` mediante el **PR #155**, y su [workflow de GitHub Actions #44599870798](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44599870798) terminó en **SUCCESS**. El CI ejecutó **767/767** pruebas unitarias de backend y **877/877** pruebas de integración, además de las verificaciones de compilación y calidad incluidas en el workflow. Los dos servicios publicados corresponden al mismo SHA `e4639d5`:

- Render: backend `LIVE`; publicación **manual** desde el SHA anterior.
- Vercel: frontend `READY` en Production, con el dominio principal asignado al deployment de ese SHA.
- GitHub Actions: el trabajo `Deploy production` continúa **desactivado** mediante `false &&`; **no se ha demostrado un despliegue automático de producción realizado por Actions**.

**Hallazgos productivos que no deben declararse corregidos:**

1. **Privilegios excesivos en PostgreSQL (prioridad crítica).** Roles web `anon` y `authenticated` conservan `TRUNCATE` efectivo sobre tablas transaccionales como `pedido`, `producto` y `tienda`, además de `typeorm_migrations`. Esta última mantiene RLS desactivado. Es un riesgo concreto que no se resuelve únicamente porque las rutas NestJS exijan JWT.
2. **Publicación de bitácora pendiente (prioridad alta).** Se observaron tres filas de outbox en estado `FALLIDO`, con diez intentos cada una. Render emite repetidamente `outbox_publish_failed`; el motivo específico no ha sido demostrado. La persistencia de eventos en MongoDB Atlas **no está verificada de extremo a extremo en producción**.
3. **CD automático no activado (prioridad alta para la rúbrica).** El CI está verde y el sistema fue publicado, pero el job automático de despliegue no ejecutó los pasos de Render y Vercel.

La **prueba completa de los cuatro roles en Internet** y la validación externa de MongoDB aún requieren evidencias separadas. No se han realizado escrituras productivas para preparar esta actualización documental.

### A.1. Matriz de estado vigente

| Ámbito | Estado al 19-11-2026 | Evidencia o limitación |
|---|---|---|
| Código final | **Integrado en `main`** | PR #155, SHA `e4639d5` |
| Calidad automatizada | **CI verde** | [Run #44599870798](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44599870798); backend y frontend aprobaron |
| Concurrencia de productos | **Implementada y probada** | `producto.version`, conflictos HTTP 409, transacciones; migraciones ya registradas en producción |
| Autenticación y permisos de la aplicación | **Implementados y probados en CI** | JWT, roles, identidad vigente, propiedad por consulta SQL, MVC/CSRF |
| Seguridad de privilegios de PostgreSQL | **Pendiente crítico** | Consultas de permisos productivos realizadas en modo lectura |
| Render | **Publicado (`LIVE`)** | SHA `e4639d5`; publicación manual, sin atribuirla al job de Actions |
| Vercel | **Publicado (`READY`)** | Deployment `dpl_F9rayvPBmNffJyeVDCkFQGZSEAyf`, alias principal del mismo SHA |
| Bitácora MongoDB | **Código/pruebas completos; operación productiva no comprobada** | Outbox PostgreSQL con tres filas `FALLIDO`; logs de Render |
| Pipeline de despliegue automático | **Pendiente** | Condición `false &&` en `.github/workflows/ci.yml` |
| Smoke test real de los cuatro roles | **Pendiente de evidencia completa** | Un CI verde y un deployment `READY` no sustituyen la operación funcional comprobada desde Internet |

## B. Metodología y alcance

Esta actualización combina las **evidencias históricas documentadas en el archivo original** con comprobaciones recientes de solo lectura:

- GitHub: rama `main`, PR #155, contenido versionado, workflow, resultado y logs de la ejecución final.
- Render: configuración del servicio, estado del despliegue de `e4639d5` y logs de aplicación; sin reiniciar ni redesplegar.
- Vercel: metadatos del deployment asignado al dominio principal; sin publicar ni promover nuevos deployments.
- Supabase/PostgreSQL: consultas de **metadatos y conteos**, sin credenciales, datos personales ni comandos de escritura; privilegios efectivos, RLS y estado de la outbox.
- Código: guards, DTOs, servicios, repositorios, migraciones, transacciones, publicador outbox y script de privilegios.

**No se realizó** un pentest externo, no se verificaron todos los secretos ni todos los recursos de los proveedores, no se inspeccionaron documentos individuales de Atlas y no se ejecutó una restauración aislada demostrada del respaldo. Por lo tanto, el alcance de estas evidencias debe leerse literalmente.

### B.1. Requisitos del Laboratorio 7

| Criterio | Puntos | Resultado y condición pendiente |
|---|---:|---|
| CI/CD | 2,5 | Compilaciones, pruebas y cobertura verificadas en `main`; **despliegue automático pendiente** |
| Seguridad | 2,5 | Controles auditados en el código; **privilegios productivos críticos todavía abiertos** |
| Concurrencia | 2,0 | Bloqueo transaccional, versión optimista, conflictos y pruebas implementados |
| Observabilidad | 1,5 | Logs JSON, eventos de seguridad y health; falta resolver/publicar bitácora y acordar seguimiento operativo |
| Pruebas | 1,5 | Más de 40 pruebas; CI del release aprobado |

La aplicación utiliza tecnología distinta de los ejemplos Java de la guía, de acuerdo con el ADR histórico del equipo. Equivalencias: TypeORM en lugar de JPA, Jest/Istanbul en lugar de JaCoCo y ruta real de salud **`/api/database/health`** en lugar de `/actuator/health`. La equivalencia académica de cada punto debe confirmarse con el profesor cuando corresponda.

## C. Hallazgos originales, correcciones y trazabilidad

Las siguientes correcciones pertenecen a la auditoría histórica de los Bloques 1–5. Su integración al proyecto final **ya no está pendiente**; los riesgos residuales son distintos de la falta de publicación de esos commits.

| Bloque | Hallazgo histórico | Corrección aplicada | Evidencia |
|---|---|---|---|
| 1. Dependencias | Paquetes vulnerables en el árbol de producción | Actualizaciones compatibles, lockfile y overrides acotados | [Commit `c0025c4`](https://github.com/AaronChaves29/Chorotega-E-Market/commit/c0025c4673e70f8f9466cb3fa08f729d64a44a91), PR #93 |
| 2. Identidad vigente | Cuentas inactivas y roles desactualizados podían conservar acceso | Verificación de hash, estado y rol vigentes de usuario en solicitudes protegidas | [Commit `46d4e3c`](https://github.com/AaronChaves29/Chorotega-E-Market/commit/46d4e3c95ca02545703a0730d0c223affb3da65e), PR #94 |
| 3. Límites de autenticación | Login REST/MVC y registro sin presupuesto | `AuthRateLimitService`, respuestas HTTP 429 y `Retry-After` | [Commit `866c342`](https://github.com/AaronChaves29/Chorotega-E-Market/commit/866c3429a6a8976c622d1fd5351d609cb6c5f53b), PR #96 |
| 4. Inventario concurrente | Ediciones con versión antigua podían sobrescribir existencias | `@VersionColumn`, validación de versión y escritura atómica condicional; conflicto 409 | [Commit `1d57dfa`](https://github.com/AaronChaves29/Chorotega-E-Market/commit/1d57dfa3839bafdbef740466e5d404bd17ca6817), PR #98 |
| 5. Transacciones de entrega | Consulta de propietario desde otra conexión durante una transacción | Consulta mediante el `EntityManager` de la misma transacción, conservando rollback | [Commit `2ff0eb9`](https://github.com/AaronChaves29/Chorotega-E-Market/commit/2ff0eb98c9382b921561d924401787807373b5e1), PR #101 |

### C.1. Dependencias: evidencias con fecha

La auditoría histórica del **3 de noviembre** registró, después de las correcciones compatibles, **cero avisos señalados en los árboles auditados de producción** y advertencias de herramientas de desarrollo: 40 paquetes de backend y 16 de frontend, según el entorno y el lockfile de ese momento. Esos números son **históricos**, no una auditoría npm nuevamente ejecutada en esta revisión.

El despliegue reciente de Render mostró **22 avisos moderados durante la instalación del árbol completo** y **0 vulnerabilidades después de `npm prune --omit=dev`**. Esta es una evidencia del build de Render, no una garantía de ausencia de vulnerabilidades futuras ni de toda la cadena de suministro. No se ejecutó `npm audit fix --force` ni se recomienda hacerlo sin pruebas de compatibilidad.

La corrección histórica del frontend llevó Next.js y `eslint-config-next` a **16.4.5**, además de actualizar dependencias transitivas compatibles. El frontend compiló correctamente en el CI final. Las advertencias históricas de desarrollo se deben revaluar con un nuevo `npm audit` controlado antes de presentar cifras vigentes.

### C.2. Seguridad de autenticación, sesión y autorización

- **REST:** JWT con expiración y validación de identidad persistida; 401 si no hay sesión o esta es inválida, 403 si el rol vigente carece de acceso y 404 uniforme para varios recursos no visibles.
- **Frontend:** BFF de Next.js y cookies HttpOnly; las comprobaciones de interfaz no reemplazan autorización en NestJS.
- **MVC administrativo:** sesión cifrada, cookies configuradas según entorno, protección CSRF y patrón Post/Redirect/Get.
- **Aislamiento:** clientes consultan pedidos propios; emprendedores gestionan sus tiendas/productos/pedidos; repartidores consultan entregas propias. El destino (`GET /api/v1/deliveries/:id/destination`) se restringe por rol, propietario y estado `ASIGNADA`/`EN_CAMINO` en PostgreSQL.
- **Registro:** no hay autoasignación del rol ADMIN en registros públicos.

Los límites de autenticación documentados inicialmente son por **operación e instancia**, no un límite distribuido por IP o por identidad. Los reinicios y las múltiples réplicas pueden alterar el comportamiento. Tampoco existe evidencia de MFA o revocación individual inmediata de todos los JWT.

### C.3. Concurrencia y transacciones

La entidad `producto` incluye versión optimista. Las ediciones envían la versión esperada; una escritura concurrente obsoleta puede devolver **409**. Las compras y la modificación de inventario se ejecutan bajo las transacciones y los bloqueos de PostgreSQL. La lógica de entrega conserva reglas explícitas para asignación, inicio, finalización y cancelación.

La base productiva ya registra la migración `AddProductVersion1793296800000` junto con las otras cinco migraciones de la versión publicada. **No volver a ejecutar ni manipular el historial para forzar migraciones.**

Estas garantías no prueban la ausencia de todos los deadlocks, errores de red o contenciones en producción. Incidentes intermitentes de `socket hang up` y Chrome quedaron documentados sin una causa definitiva; ejecuciones posteriores exitosas no demuestran su resolución.

### C.4. Bitácora de pedidos: implementación posterior

Los [PR #153](https://github.com/AaronChaves29/Chorotega-E-Market/pull/153) y [#154](https://github.com/AaronChaves29/Chorotega-E-Market/pull/154), integrados en el release, incorporan **PostgreSQL Transactional Outbox → MongoDB** y controles de seguridad asociados. Incluyen escritura de eventos dentro de las transacciones comerciales, secuencia por pedido, idempotencia, reintentos, conciliación y validación de esquema.

Los siete tipos de evento definidos en el código son: `PEDIDO_CONFIRMADO`, `PEDIDO_CANCELADO`, `PEDIDO_PREPARANDO`, `ENTREGA_ASIGNADA`, `ENTREGA_CANCELADA`, `ENTREGA_EN_CAMINO` y `PEDIDO_ENTREGADO`. El almacenamiento documental utiliza la colección `bitacora_pedidos`. No existe transacción ACID única entre PostgreSQL y MongoDB; la outbox hace recuperable la publicación, pero requiere operación e índices adecuados.

**Estado productivo:** la tabla `pedido_audit_outbox` tenía tres eventos en `FALLIDO` con diez intentos. Render registró advertencias `outbox_publish_failed`. No se ha verificado la causa ni la entrega de esos eventos a MongoDB Atlas. No afirmar que la bitácora productiva está en verde; revisar conexión autorizada, índices/validador, permisos y configuración antes de cualquier reintento manual.

## D. Ocho verificaciones de seguridad solicitadas por el profesor

Esta sección conserva los **ocho puntos** del documento histórico; “implementado” significa comprobación acotada por código/pruebas, no prueba de invulnerabilidad.

| # | Verificación | Evidencia | Resultado y riesgo residual |
|---:|---|---|---|
| 1 | Un usuario no puede ver ni modificar recursos de otro | Guards, identidad vigente y filtros de propietario en consultas de pedidos, tiendas, entregas y destino | **Implementado/probado en CI**; pendiente smoke test productivo completo |
| 2 | Ningún endpoint devuelve una entidad JPA/ORM | DTOs y mappers, contratos OpenAPI y pruebas HTTP | **Implementado/probado**; no equivale a auditar toda respuesta futura |
| 3 | No hay consultas construidas concatenando texto no confiable | Parámetros SQL, whitelist de ordenamiento, filtros tipados MongoDB | **Revisado en caminos inspeccionados**; no es pentest exhaustivo |
| 4 | Los errores no envían trazas al cliente | `Problem Details`, filtros globales, HTML administrativo seguro | **Implementado/probado**; errores desconocidos no deben exponer SQL ni stack |
| 5 | CORS permite solamente los orígenes previstos | Validación de orígenes y lista permitida en NestJS | **Parcial**: no se inspeccionó el valor productivo real de la allowlist; la política soporta una lista, no fuerza un solo origen |
| 6 | No existen secretos en repositorio ni historial | Escaneo histórico de archivos y patrones documentado el 3 de noviembre | **Parcial**: ningún secreto real identificado en aquella muestra; no certifica todo historial, binarios ni paneles |
| 7 | Contraseñas con BCrypt y JWT con expiración | `AuthService`, configuración JWT y pruebas de identidad vigente | **Implementado/probado**; no se revisó la entropía o rotación real del secreto productivo |
| 8 | Dependencias sin vulnerabilidades conocidas | Auditorías históricas npm y logs del build actual | **Parcial**: instalación productiva de Render sin avisos tras prune; advertencias de desarrollo y análisis de frontend requieren nueva evaluación |

El problema de **privilegios de PostgreSQL identificado en producción** no queda cubierto por los guards de la fila 1: son capas diferentes y ambas requieren control.

## E. Mapeo OWASP Top 10:2025 (alcance no exhaustivo)

| Categoría | Control, evidencia y limitación |
|---|---|
| **A01 — Broken Access Control** | JWT, roles, propiedad SQL y validación de identidad vigente; **riesgo abierto de ACL PostgreSQL productivo**, independiente de rutas NestJS |
| **A02 — Security Misconfiguration** | CORS, TLS y cookies configuradas; revisar variables reales, CORS efectivo y privilegios excesivos de tablas existentes |
| **A03 — Software Supply Chain Failures** | Lockfiles, `npm ci`, versiones compatibles, CI; avisos residuales históricos de herramientas de desarrollo |
| **A04 — Cryptographic Failures** | BCrypt, JWT, sesión MVC cifrada y conexiones TLS; secretos y rotación externos no inspeccionados |
| **A05 — Injection** | Valores SQL parametrizados, validación DTO, escaping Handlebars y filtros Mongo tipados; sin pentest de todas las entradas |
| **A06 — Insecure Design** | Precios y stock calculados/validados en backend, transacciones, versión y límites; la protección de rate limiting no es distribuida |
| **A07 — Authentication Failures** | Rechazo de inactivos, expiración JWT, login/registro limitados y comprobación de rol persistido; sin MFA demostrada |
| **A08 — Software or Data Integrity Failures** | CI comprueba el SHA; outbox garantiza escritura transaccional del evento en PostgreSQL; **publicación MongoDB fallida en la evidencia reciente** |
| **A09 — Security Logging and Alerting Failures** | Logs JSON `login_failed`, `access_denied`, `concurrency_conflict`, `outbox_publish_failed`; no hay alertas proactivas verificadas |
| **A10 — Mishandling of Exceptional Conditions** | Problem Details, rollback, 409 y reintentos outbox diseñados; se conservan fallos intermitentes no explicados y eventos en `FALLIDO` |

Referencia de la clasificación: [OWASP Top 10:2025](https://top10.owasp.org/2025/). Es un mapeo de controles concretos, no una certificación OWASP o ASVS.

## F. Pruebas y evidencias de la versión final

### F.1. GitHub Actions, SHA `e4639d5`

**Fuente verificable:** [Workflow de `main` #44599870798 — SUCCESS](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44599870798). El log de backend confirma:

| Verificación | Resultado |
|---|---:|
| Suites unitarias backend | **50/50** |
| Pruebas unitarias backend | **767/767** |
| Suites de integración backend | **36/36** |
| Pruebas de integración backend | **877/877** |
| Build Backend | **Success** |
| Build Frontend | **Success** |
| `Deploy production` | **Skipped** (bloqueo deliberado) |

**Cobertura del backend reportada por ese run, para los archivos incluidos en Jest:**

| Métrica | CI final | Umbral |
|---|---:|---:|
| Sentencias | 96,33 % | 70 % |
| Ramas | 82,30 % | 70 % |
| Funciones | 94,69 % | 70 % |
| Líneas | 96,13 % | 70 % |

La cobertura **no** equivale a cobertura del 100 % de los módulos, del frontend, del sistema desplegado o de seguridad. Las pruebas utilizan infraestructura temporal para integración; no efectúan una compra real en producción.

Las validaciones registradas en las fases previas incluyen 359/359 pruebas unitarias de frontend, 131/131 de orquestación sin red, 42/42 de diagnóstico Chrome y 28/28 de MVC Chrome. **Esas cifras son históricas del cierre previo**, no se suman a 767/877 ni se etiquetan como nuevos runs si no aparecen en el log examinado.

### F.2. Despliegue real

| Proveedor | Versión | Evidencia | Limitación |
|---|---|---|---|
| [Render](https://chorotega-e-market.onrender.com) | `e4639d5` | Servicio `LIVE` y build exitoso, despliegue `dep-dbvkvlnf3r2c73cj68b0` | Despliegue **manual**; no prueba el job `Deploy production` |
| [Vercel](https://chorotega-e-market-frontend.vercel.app) | `e4639d5` | Production `READY`, `dpl_F9rayvPBmNffJyeVDCkFQGZSEAyf`, alias principal asignado | Publicación puntual; la regla de Ignored Build Step fue restaurada y no demuestra automatización futura |
| [Swagger](https://chorotega-e-market.onrender.com/docs) | Backend publicado | Ruta de documentación configurada | Debe comprobarse apertura pública desde incógnito y disponibilidad real |
| [Salud](https://chorotega-e-market.onrender.com/api/database/health) | Backend publicado | Health configurado en Render | No prueba por sí solo MongoDB, todos los roles ni entrega de eventos |

El `README.md` y las pruebas de CI documentan el sistema, pero cualquier prueba de uso público debe registrarse separadamente con capturas de datos **sintéticos**.

## G. Riesgos abiertos y medidas propuestas

### G.1. CRÍTICO — Privilegios excesivos de PostgreSQL productivo

**Hallazgo reproducido mediante consulta de solo lectura:** para `pedido`, `producto`, `tienda` y `typeorm_migrations`, `has_table_privilege(..., 'TRUNCATE')` devuelve `true` para los roles `anon` y `authenticated`. En `typeorm_migrations` además `relrowsecurity = false`. Las tablas `pedido_audit_outbox` y `pedido_audit_sequence` presentan RLS activo y no exhiben ese permiso efectivo.

**Impacto:** el permiso `TRUNCATE` es incompatible con el principio de mínimo privilegio para esos roles. **RLS no protege la operación TRUNCATE**. La presencia del privilegio no demuestra explotación, pero obliga a remediar la configuración productiva y verificar las vías efectivas de acceso.

**Corrección propuesta, no aplicada:** [`docs/laboratory/lab-07/sql/release-privileges.sql`](docs/laboratory/lab-07/sql/release-privileges.sql), preparado para **`psql`**, no para pegarlo directamente en el SQL Editor. Antes de ejecutarlo:

1. Confirmar el rol técnico real con el que conecta Render y los permisos que necesita.
2. Verificar un respaldo reciente y **probar su restauración en un entorno aislado**.
3. Probar el script y las comprobaciones de ACL/rol técnico en esa restauración.
4. Preparar y custodiar el archivo privado de recuperación de privilegios; no compartirlo en el repositorio.
5. Obtener **autorización expresa de cambio productivo**, ejecutar de forma coordinada y comprobar nuevamente los privilegios efectivos sin afectar la API.

**Estado:** **ABIERTO**. No se hizo `REVOKE`, no se alteró RLS ni se ejecutó SQL de corrección al preparar esta revisión.

### G.2. ALTO — Outbox sin publicación productiva comprobada

**Hallazgo:** tres filas en `pedido_audit_outbox` permanecían `FALLIDO` con diez intentos. Render mostraba advertencias recurrentes `outbox_publish_failed`; el publicador registra mensajes sanitizados que **no identifican la causa**.

**Medidas:** verificar por canal autorizado configuración de MongoDB y conectividad desde Render, colección `bitacora_pedidos`, índice único de `pedidoId`, validadores y permisos; comparar con el aprovisionador `node dist/deployment/provision-order-audits.js`. Solo después de corregir una causa demostrada, acordar recuperación/reintento supervisado y cotejar un evento sintético con PostgreSQL y Atlas. No manipular contadores o filas para forzar un estado verde.

**Estado:** **ABIERTO**. No se inspeccionaron ni modificaron documentos de Atlas durante esta actualización.

### G.3. ALTO para la rúbrica — Despliegue automático desactivado

El workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) conserva:

```yaml
if: ${{ false && github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.backend.result == 'success' && needs.frontend.result == 'success' }}
```

Las pruebas de orquestación verifican comportamiento **sin publicar** en plataformas externas. Render tiene Auto-Deploy desactivado y Vercel conserva una regla de build ignorado para Production; estas protecciones deben armonizarse con el mecanismo de Actions para evitar publicaciones concurrentes. Para terminar el criterio académico: validar secretos por existencia/permisos **sin revelar valores**, preflight y plan de recuperación; autorizar un release controlado, habilitar el job con restricción a `push/main` y verificar de forma real SHA, health y dominio público. **No quitar `false &&` basándose solo en el CI verde.**

**Estado:** **ABIERTO**; la publicación del SHA final se realizó por otro procedimiento.

### G.4. Riesgos adicionales y validación pendiente

| Riesgo | Impacto/alcance | Próxima comprobación |
|---|---|---|
| Prueba funcional productiva incompleta | `READY`/`LIVE` no equivalen a compra y entrega probadas | Smoke test con los cuatro roles y datos sintéticos, sin contraseñas en evidencias |
| Secretos y CORS efectivos no auditados completamente | Configuración externa diferente a configuración de código | Revisar solo existencia, dominios permitidos y permisos; no imprimir valores |
| Intermitencias de integración y Chrome históricas | Resultados esporádicos `socket hang up`/Chrome | Conservar logs e investigar solo con reproducción/evidencia; no afirmar corrección por pase posterior |
| Límites de autenticación por instancia | Posible agotamiento global y falta de coordinación entre réplicas | Evaluar aceptación de riesgo o protección distribuida en evolución futura |
| Pruebas frente a rúbrica | Ruta real `/api/database/health` y stack diferente del ejemplo | Confirmar equivalencias técnicas con el profesor |

## H. Matriz de cierre y conclusión

| Requisito | Situación del código | Estado para entrega |
|---|---|---|
| Identidad vigente, contraseñas y roles | Implementados, en `main`, CI verde | **Cerrado en código; smoke test productivo pendiente** |
| DTOs, errores seguros, CSRF, consultas parametrizadas | Implementados y cubiertos por pruebas | **Cerrado en alcance probado** |
| Concurrencia, stock y rollback | Implementados y migración de versión presente en producción | **Cerrado en código y pruebas** |
| Más de 40 pruebas y cobertura ≥70 % | CI de `main` verde, métricas verificadas | **Cerrado en CI** |
| Bitácora MongoDB y outbox | Implementados y probados en integración temporal | **Pendiente operativo productivo** |
| ACL de PostgreSQL y RLS de migraciones | Script de corrección preparado | **Pendiente crítico en producción** |
| CI/CD productivo automático | Workflow construido, job bloqueado | **Pendiente de ejecución real** |
| Publicación de la versión final | Render `LIVE`, Vercel `READY`, mismo SHA | **Publicación confirmada; operaciones de roles por verificar** |
| Auditoría documental | Este documento actualiza hechos y riesgos al 19-11-2026 | **Preparado para revisión y aprobación del equipo** |

**Conclusión:** el release final está versionado, las suites principales de `main` aprobaron y ambos servicios tienen publicado el mismo commit. El proyecto demuestra controles importantes de autenticación, autorización, concurrencia y pruebas. **No sería correcto afirmar que la seguridad productiva está totalmente corregida, que la bitácora de Atlas funciona o que GitHub Actions ya realiza despliegues automáticos.** Los tres hallazgos permanecen abiertos, con procedimientos de remediación y validación descritos arriba.

### Fuentes y documentación de respaldo

- [Auditoría histórica y versiones anteriores de este archivo](https://github.com/AaronChaves29/Chorotega-E-Market/commits/main/AUDITORIA-SEGURIDAD.md).
- [PR #155 — Release final](https://github.com/AaronChaves29/Chorotega-E-Market/pull/155) y [CI #44599870798](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44599870798).
- [PR #153 — Outbox](https://github.com/AaronChaves29/Chorotega-E-Market/pull/153) y [PR #154 — Hardening](https://github.com/AaronChaves29/Chorotega-E-Market/pull/154).
- [`docs/laboratory/lab-07/`](docs/laboratory/lab-07/): documentos originales de dependencias, identidad, concurrencia, transacciones, observabilidad y pruebas.
- [`docs/laboratory/lab-07/sql/release-privileges.sql`](docs/laboratory/lab-07/sql/release-privileges.sql): procedimiento controlado de privilegios productivos, **no ejecutado**.
- [OWASP Top 10:2025](https://top10.owasp.org/2025/).

---

*Esta actualización es exclusivamente documental: no crea una nueva versión desplegada ni sustituye la autorización formal para cambiar Git, Supabase, Render, Vercel o MongoDB.*
