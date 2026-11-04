# S3 — Pruebas, cobertura y evidencia verificada

> Cierre de entrega actualizado el 4 de noviembre de 2026 al final de este
> documento. Las secciones previas conservan los resultados históricos de #99;
> sus referencias a deploy bloqueado y verificaciones pendientes no describen
> por sí solas el estado posterior al PR #110.

Responsable: Sofía. Auditoría del 2 de noviembre de 2026, sin cambios funcionales,
de configuración, proveedores o secretos. Producción conserva `false` en deploy.
Esta evidencia complementa [S2](observabilidad-base.md), [seguridad](autenticacion-vigente.md),
[rate limiting](rate-limiting-backend.md), [concurrencia](concurrencia-optimista.md)
y [pipeline](pipeline-ci-cd.md), sin repetir sus diseños.

## Versión y alcance

Rama documental: `docs/lab-07-testing-evidence`, creada con árbol limpio tras fetch
desde origin/develop `941e43ed1a431976ae7348fded394c22ae2f7e39`, merge del
[PR #99](https://github.com/AaronChaves29/Chorotega-E-Market/pull/99).
Contiene `0e2b85790acbffa85e5703ab15128e4b9522da64`; ambos árboles coinciden según
`git diff 0e2b857 HEAD` antes de escribir este documento.
Local: Windows, Node 24.18.0, npm 11.16.0, dependencias ya instaladas. CI utiliza
Ubuntu, Node 22.22.0 backend y Node 24 frontend. No se hizo una instalación limpia
local; CI sí ejecutó npm ci.

## Suites y resultados

| Suite | Archivos | Local actual: aprobados | CI #99: aprobados |
| --- | ---: | ---: | ---: |
| Jest predeterminado: unitarias y HTTP con dependencias simuladas | 43 | 533 | 533 |
| Integración PostgreSQL/Testcontainers, incluido HTTP/API | 25 | No ejecutada | 634 |
| Artefacto compilado, node:test | 1 | 9 | 9 |
| Orquestación CI/CD simulada, node:test | 1 | 17 | 17 |
| Navegador Chrome MVC y PostgreSQL temporal | 1 | No ejecutada | 9 escenarios; TAP 10/10 con contenedora |

Cero fallos/omitidos en las ejecuciones anteriores. Lo no ejecutado localmente no
se cuenta como omitido por Jest. Los 25 archivos de integración incluyen 16 HTTP
y 9 fuera de HTTP: no sumar API otra vez. `test:e2e` selecciona el mismo subconjunto
HTTP. Los 43 archivos Jest no son 43 casos ni exclusivamente pruebas unitarias puras.
Navegador comprueba MVC, no la SPA Next.js. Frontend tiene lint/build, sin script de tests.

Los grupos se informan por separado: no se presenta su suma como un total de
pruebas únicas ni como cobertura funcional adicional. El total TAP adicional del
navegador es su contenedora, no un décimo escenario. No sumar local y CI como
casos distintos. Los pases
históricos de 529 completos y 106 focalizados no describen el resultado actual.

## Comandos y reportes

Desde apps/backend, ejecutados en este cierre, con exit code 0:

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd run test:deployment
npm.cmd run test:cov -- --runInBand --json --outputFile=coverage/jest-unit-results.json
```

Desde la raíz: `node --test scripts/ci/production-deploy.test.mjs` y
`git diff --check`, aprobados. Se inspeccionaron el JSON Jest y coverage-summary
generados bajo apps/backend/coverage (ignorados por Git).

`docker info` no pudo conectar con el motor; tampoco pudo leer su configuración.
No se instaló ni inició Docker. Quedan sin ejecutar localmente:

```powershell
# Desde apps/backend, con Docker disponible; navegador exige build y Chrome.
npm.cmd run test:integration -- --json --outputFile=coverage/jest-integration-results.json
npm.cmd run test:browser
```

CI ejecuta esos comandos equivalentes con npm, más migraciones y seeds solo en
PostgreSQL efímero del runner. Testcontainers utiliza sus bases temporales.
No se ejecutaron migraciones, seeds ni operaciones contra bases reales en este cierre.

## Cobertura real

| Métrica | Local y CI | Cubiertos / total | Umbral |
| --- | ---: | ---: | ---: |
| Statements | 97,50 % | 548 / 562 | 70 % |
| Branches | 84,63 % | 281 / 332 | 70 % |
| Functions | 92 % | 92 / 100 | 70 % |
| Lines | 97,74 % | 520 / 532 | 70 % |

Se miden 32 archivos seleccionados por `src/modules/{orders,deliveries}/**/*.ts`,
excluyendo entidades, repositorios, interfaces, módulos y pruebas. Incluye servicios,
controladores, DTOs, dominio, excepciones, mapeadores y adaptadores HTTP/transacción.
No representa todo backend, Auth, logger, health ni frontend. La integración no
añade cobertura a este cálculo. Los cuatro umbrales se aplican mediante Jest.

Comparación de #99 contra su base `9518a8d`: bloque jest del package.json idéntico;
ningún archivo de src/test/scripts CI eliminado. La revisión del diff de pruebas
conserva casos y aserciones anteriores y agrega comprobaciones de eventos/errores
de logging. No se modificaron umbrales ni exclusiones para este cierre.

## Evidencia remota comprobada

[Run 41507841921, CI número 268](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41507841921),
del 2 de noviembre: completed/success. Consultados sus jobs, pasos y log backend:

- [Backend 125491594918](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41507841921/job/125491594918):
  lint, build, artefacto, orquestación, cobertura, integración y Chrome aprobados.
- [Frontend 125491594229](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41507841921/job/125491594229):
  lint y build aprobados.
- Deploy production (disabled): skipped; no evidencia de despliegue productivo.

Run asociado al head `0e2b85790acbffa85e5703ab15128e4b9522da64`; el log de checkout
muestra la referencia de prueba `pull/99/merge`, SHA sintético
`ca75ca4d385f23d24d8994d214f49ed62cfe7b2a`. No confundirlo con el merge final
941e43e validado localmente. La herramienta de consulta de runs por SHA solo lista
eventos de PR: su respuesta vacía para el merge final no demuestra ausencia de un
run de push.

Artefacto `backend-coverage-and-test-results`, ID `13171497614`, listado y descargado
a una carpeta temporal; ZIP inspeccionado sin incorporar archivos al repositorio.
Se verificaron numPassedTests/numFailedTests/numPendingTests y archivos de ambos
JSON Jest, coverage-summary y resultados de los casos de seguridad/concurrencia.
SHA-256 local del ZIP coincide con el digest GitHub:
`f6b1644430cbe6de402f9384963cc81213353d366784aedf2970737cf699e1e2`.
Caduca el 16 de noviembre de 2026 según metadata; el enlace del run permite
localizarlo mientras siga disponible. No se guardan URLs firmadas ni logs completos.
Antes de esa fecha, conservar una copia segura del ZIP o de los JSON/resúmenes
necesarios para la entrega, con acceso restringido y revisión de datos sensibles.
Guardar junto a la copia run, SHA y hash de integridad; no publicar credenciales,
URLs temporales ni archivos privados. El enlace del run no garantiza conservar
los archivos después de su caducidad. Esta recomendación no implica que ya exista
una copia permanente de entrega; la descarga verificada fue temporal.

## Seguridad y concurrencia confirmadas

Subconjuntos extraídos del artefacto CI; todos aprobados, cero fallidos/omitidos:

| Archivo (dentro de apps/backend) | Casos | Evidencia |
| --- | ---: | --- |
| src/common/observability/security-events.spec.ts | 8 | Eventos JSON, secretos ausentes, conteo único, 409 ajeno y fallo de sink |
| src/modules/health/health-http.spec.ts | 3 | Health público 200/503 y esquema sin database/timestamp |
| test/integration/http/security.integration-spec.ts | 5 | Credenciales/token rechazados 401 y permisos/propiedad 403 |
| test/integration/http/current-identity.integration-spec.ts | 25 | Identidad persistida vigente y permisos revocados |
| test/integration/http/rate-limiting.integration-spec.ts | 13 | Límites de autenticación y contrato HTTP |
| test/integration/http/catalog-write-security.integration-spec.ts | 88 | Escrituras y propiedad de catálogo |
| test/integration/http/product-optimistic-concurrency.integration-spec.ts | 13 | PostgreSQL real: versiones, dos PATCH, 401/403/404, interacción con compras |
| test/integration/orders-business.integration-spec.ts | 3 | Compra, rollback y última unidad concurrente |
| test/integration/deliveries-concurrency.integration-spec.ts | 2 | No duplicar pedido/repartidor en asignaciones simultáneas |

El caso de dos PATCH conserva resultado 200/409, una escritura, versión 2 y un solo
concurrency_conflict. Su assertionResult está aprobado y la suite aparece PASS en
el log. Esto cierra la falta de evidencia PostgreSQL real para #99 en CI, aunque
no permite afirmar reproducción local ni equivalencia con una base productiva.

## Relación con S3 y límites

Se acredita automatización, pruebas de seguridad/concurrencia, ejecución real en
CI y cobertura de negocio superior al mínimo solicitado, sin debilitar pruebas.
No se asigna calificación ni se certifican requisitos adicionales de la guía
completa que no fue proporcionada en este cierre.

Pendientes: reproducción local con Docker, tests de navegador para la SPA si la
rúbrica los exige y comprobación de servicios/logs en producción cuando exista
autorización. Los reportes de CI no prueban el estado de Supabase/Atlas/Render.
Los registros son best effort y el health cubre solo PostgreSQL; límites detallados
en observabilidad-base.md. Mantener el deploy bloqueado y conservar los artefactos
necesarios antes de su expiración. Este cierre solo añade documentación.

## Cierre de entrega — 4 de noviembre de 2026

### Versiones y ejecuciones comprobadas en esta revisión

| Evidencia | Resultado y alcance |
| --- | --- |
| [PR #110](https://github.com/AaronChaves29/Chorotega-E-Market/pull/110), main `9e353f372c38cb03125074f7b528de5bcc45ab21` | Activación del workflow productivo integrada; no equivale a un despliegue completo exitoso. |
| [Run productivo 41872406367](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41872406367) | **failure**. Backend/frontend aprobados; Render completó SHA/health; etapa Vercel falló con VERCEL_COMMAND_FAILED. No presentarlo como success. |
| [Commit diagnóstico 93f1db3](https://github.com/AaronChaves29/Chorotega-E-Market/commit/93f1db32775b703284fd18b1ebddead0fbd49e62) y [PR #111](https://github.com/AaronChaves29/Chorotega-E-Market/pull/111) | Integrados únicamente en develop mediante `0122708889a5c13a322bfac00587699cd2cd5b00`; no están en la versión productiva de main. |
| [Run develop 41882190820](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41882190820) | completed/success para `0122708`; backend/frontend aprobados, deploy omitido. Consultados jobs y resumen del log backend; acredita CI, no recuperación productiva. |

Resultados del último run de develop, sin sumar suites como casos únicos:

| Suite | Archivos cuando aplica | Aprobados |
| --- | ---: | ---: |
| Jest | 43 | 533 |
| Integración/API Testcontainers | 26 | 646 |
| Artefacto compilado | 1 | 9 |
| Mecanismo CI/CD y recuperación simulada | 1 | 29 |
| Navegador MVC | 1 | 9 escenarios, TAP 10/10 incluye contenedora |

Los resúmenes consultados no muestran fallos. No se repitieron estas suites
localmente durante este cierre documental. El log mantiene 97,50 % statements,
84,63 % branches, 92 % functions y 97,74 % lines. El alcance sigue limitado a los
32 archivos seleccionados de pedidos/entregas descritos arriba; no cubre todo
backend ni frontend. Los 29 casos de orquestación incluyen los 17 originales,
las 96 combinaciones y pruebas sintéticas de diagnóstico/recuperación: no son
29 publicaciones ni evidencia de una recuperación real mediante ese script.

### Incidencia y recuperación: alcance de lo demostrado

El primer intento dejó Render actualizado y Vercel con el deployment
`dpl_EjxFbBNH25mYAQ5oNxx2QCZT5pPP`, target production, READY y SHA `9e353f3`.
El diagnóstico anterior confirmó esos metadatos sin alias productivo en ese
momento. El error genérico no permite identificar retrospectivamente el comando
exacto: se descartaban stderr y metadatos. #111 agrega diagnóstico seguro y un
modo de recuperación separado, pero no demuestra que la causa histórica esté resuelta.

**Reportado por el equipo para la entrega, no comprobado independientemente
contra producción en esta revisión:** el deployment existente fue promovido
manualmente y de forma controlada; el dominio principal apunta al SHA `9e353f3`.
Se reportan login y consultas públicas HTTP 200, consulta de pedidos, cuatro
migraciones PostgreSQL aplicadas y respaldo actualizado confirmado por Aarón.
No se adjuntan credenciales, datos de pedidos, contenido del respaldo ni checksum
completo. Un HTTP 200 de login no demuestra por sí solo todos los recorridos de
autenticación/autorización.

La promoción manual **no cambia** el resultado failure de Actions y no acredita
el modo vercel-recover. No existe evidencia de un run completo de despliegue
automático Render + Vercel en success. Esta es una limitación de S1 pendiente,
no un requisito que pueda declararse cerrado por el éxito de CI o de la promoción manual.

### Evidencias disponibles y pendientes de conservar

- Seguridad: [identidad vigente](autenticacion-vigente.md),
  [rate limiting](rate-limiting-backend.md) y auditoría enlazada en README;
  avisos residuales/fallos intermitentes conservados, sin nueva auditoría aquí.
- Concurrencia: [productos](concurrencia-optimista.md) y
  [transacciones de entregas](transacciones-entregas.md), con pruebas reales en
  PostgreSQL temporal documentadas; no provocar conflictos en datos productivos.
- Observabilidad: [JSON/eventos/health](observabilidad-base.md). La recolección de
  logs JSON en Render y muestras sanitizadas de eventos productivos no se
  acreditan con los HTTP 200 reportados; conservarlas si están disponibles.
- Guardar reportes/artefactos del run final, SHA y enlaces antes de su caducidad
  de 14 días. El artefacto histórico de #99 caduca el 16 de noviembre de 2026;
  no se descargaron ni archivaron reportes nuevos en este cierre.
- Pendiente adjuntar o presentar evidencia sanitizada de la promoción manual,
  alias/SHA, respuestas health/frontend y confirmación de migraciones/respaldo
  por Aarón. No se inventan capturas ni se afirma que ya estén archivadas.

### Checklist breve para la exposición

- [ ] Mostrar main `9e353f3`, develop `0122708` y diferencia de #111.
- [ ] Mostrar CI de develop, suites separadas y cobertura con su alcance real.
- [ ] Mostrar pruebas de 401/403, conflicto optimista 409, ausencia de duplicados
  y sanitización JSON; no realizar ataques o escrituras productivas.
- [ ] Explicar health público PostgreSQL y diferencia entre CI y disponibilidad real.
- [ ] Mostrar el run productivo fallido y la secuencia Render → Vercel READY →
  promoción manual reportada, sin presentarla como automatización completa.
- [ ] Presentar evidencia productiva sanitizada disponible; identificar lo solo
  reportado y explicar recuperación, riesgos y pendientes sin ejecutar publicaciones.

La rúbrica puede evaluarse con estas evidencias, pero no se asigna calificación
ni se afirma aprobación académica del endpoint equivalente a /actuator/health.
