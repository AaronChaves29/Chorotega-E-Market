# Verificación autenticada del staged existente — preparación bloqueada

Esta revisión prepara una vía independiente que solo lee el deployment
`dpl_2RA5JfKczFobQfTwmLPqQV8RrBRB`. No crea, compila, promueve ni recupera mediante
una mutación. El nuevo workflow queda bloqueado con `false &&`, pin en ceros y
`VERIFY_TRUST_CONFIGURED="false"`. No se ejecutó durante la preparación.

## Diagnóstico y evidencia

El [run 41986271238](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/41986271238)
ejecutó el workflow staged sobre develop `433d2e9a5e6d56ca9c7873e9bf3f84672793535b`.
El gate de CI y el preflight aprobaron; el paso de creación/comprobación falló
con `POSTCHECK_FAILED`. El log registra una solicitud de creación. La aprobación
del Environment fue reportada por el responsable; esta revisión no la repitió.

Las consultas autenticadas de solo lectura del 5 de noviembre de 2026 confirmaron:

| Elemento         | Resultado                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Candidato        | `dpl_2RA5JfKczFobQfTwmLPqQV8RrBRB`, READY, Production                                                         |
| SHA y rama       | `c338feb55f61bba51da4de7ef63ab455460d87e1`, main                                                              |
| Proyecto         | `prj_CQzkdYWJ5ZADA1glPpRz9Ak2kOpx`                                                                            |
| URL inmutable    | `https://chorotega-e-market-frontend-cpfl6ruvb.vercel.app/login`                                              |
| Búsqueda por SHA | Un candidato, el ID esperado                                                                                  |
| Alias principal  | `chorotega-e-market-frontend.vercel.app` sigue asignado a `dpl_EjxFbBNH25mYAQ5oNxx2QCZT5pPP`, sin redirección |

Un GET anónimo adicional, sin cookies y sin seguir redirecciones, respondió
**302** hacia el origen `https://vercel.com`, ruta `/sso-api`. No se registraron
query strings, cookies ni el cuerpo. La prueba manual reportada con `curl -L`
terminó en la página de acceso de Vercel con 200, sin las marcas de Chorotega;
el navegador autenticado sí mostraba el formulario. Esas dos comprobaciones
manuales son evidencia reportada, no pruebas ejecutadas nuevamente aquí.

El código `health()` de `production-deploy.mjs` realiza peticiones anónimas;
`request()` fija `redirect: 'error'`. Una redirección provoca un error que acaba
en `POSTCHECK_FAILED` tras el presupuesto de lecturas. El workflow **no siguió**
la redirección hasta recibir aquel 200 de Vercel: eso ocurrió en el curl manual.
No se registró el status HTTP original del run. El código, el 302 actual y la
evidencia reportada son consistentes con el bloqueo de Vercel Authentication,
no con un fallo de compilación ni ausencia del formulario de la aplicación.

READY acredita el deployment, pero no acceso anónimo a su HTML. La lectura
autenticada desde Actions sigue pendiente; este PR no la da por aprobada.

## Mecanismo propuesto

Se propone Trusted Sources con el OIDC de GitHub Actions. El job requiere
`id-token: write`; el token efímero se envía en
`x-vercel-trusted-oidc-idp-token`. Vercel valida firma, claims y entorno destino.
No se comparte un nuevo secreto estático ni se desactiva Vercel Authentication.

Fuentes oficiales: [Trusted Sources](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources),
[OIDC de GitHub](https://docs.github.com/en/actions/reference/security/oidc)
y [vercel curl](https://vercel.com/docs/cli/curl).
No se ejecutó CLI autenticada ni se eligió un bypass secreto como alternativa
automática. Una alternativa de ese tipo exigiría otra decisión de seguridad.

### Configuración externa pendiente: detenerse antes de autenticar

**No se creó ni modificó Trusted Sources. Hace falta autorización humana para
conceder este acceso en Vercel.** Un responsable autorizado debe:

1. Abrir el proyecto exacto → Settings → Deployment Protection → Trusted Sources.
2. En External Services, revisar si existe una regla GitHub Actions adecuada o
   proponer una nueva si falta, sin duplicarla. Limitarla a este repositorio,
   develop y el Environment protegido; destino únicamente Production.
3. Configurar y revisar los claims exactos siguientes, sin comodines:

| Claim           | Valor propuesto                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Issuer          | `https://token.actions.githubusercontent.com`                                                      |
| `aud`           | `https://github.com/AaronChaves29`                                                                 |
| `repository`    | `AaronChaves29/Chorotega-E-Market`                                                                 |
| `repository_id` | `1319529711`                                                                                       |
| `ref`           | `refs/heads/develop`                                                                               |
| `environment`   | `vercel-staged-approval`                                                                           |
| `workflow_ref`  | `AaronChaves29/Chorotega-E-Market/.github/workflows/vercel-staged-readonly.yml@refs/heads/develop` |

4. Si el formulario guiado no permite algún claim, detenerse y revisar la
   configuración avanzada; no omitir restricciones silenciosamente. No es
   necesario personalizar `sub`: con Environment su forma puede variar.
5. Guardar solo tras autorización expresa y conservar evidencia de la regla.
   Revalidar el Environment de GitHub, incluida la revisión requerida de
   `SofiaSJ09`, prevent self-review, bypass deshabilitado y solo develop.

La regla permite alcanzar deployments protegidos Production de **ese proyecto**;
no es una autorización por ID de deployment ni por ruta. El verificador limita
su petición al host y `/login` fijados. Ese alcance externo debe aceptarse antes
de configurarlo. No se afirma que la regla ya exista ni que la autenticación funcione.

## Flujo de lectura y controles

`scripts/ci/vercel-staged-readonly.mjs` no utiliza CLI, procesos de build ni el
entry point staged que puede crear deployments. Reutiliza solo helpers de GET
e identidad del código permanente, sin modificar sus implementaciones.

1. Rechaza contexto distinto del repositorio, workflow_dispatch, develop, frase
   exacta y configuración revisada. Proyecto y equipo deben coincidir con los fijados.
2. Un gate en el workflow exige el último CI push/develop del nuevo SHA antes de
   entregar Secrets al script. Este repite la comprobación, con Backend y Frontend
   aprobados y respuestas completas. Consulta main por API y exige el SHA objetivo.
3. Comprueba propietario del proyecto, búsqueda completa por SHA, exactamente
   el candidato esperado, READY, Production, rama main y host inmutable exacto.
   Verifica también el deployment anterior y la asignación por API del alias principal.
4. Solo entonces solicita a GitHub el OIDC con audiencia exacta. La URL emisora
   debe ser HTTPS bajo `actions.githubusercontent.com`; rechaza usuarios, puertos
   y redirecciones. El token queda en memoria: sin outputs, archivos, cookies ni logs.
5. Hace un único GET autenticado a la URL inmutable, con `redirect: manual`,
   `credentials: omit` y sin caché. El token OIDC solo va a ese origen; los tokens
   de GitHub/Vercel API se usan exclusivamente con sus respectivas API.
6. Exige URL final idéntica, `redirected: false`, ningún Location, HTTP 200,
   `text/html` y las marcas `Chorotega`, `login-title`, `correo` y `clave`.
   Rechaza redirecciones incluso internas, 401/403, otros estados y HTML incorrecto.
   El cuerpo tiene un límite de 256 KiB y nunca se imprime.
7. Repite main, proyecto, candidato único y alias después del HTML. Un cambio
   impide declarar éxito. Solo informa ID/SHA fijados y categorías sanitizadas.

Todos los requests son GET, con TLS normal, timeout de 15 segundos por petición
y presupuesto global de dos minutos. Solo las lecturas API compartidas tienen
sus reintentos GET acotados; el HTML y la emisión OIDC no se reintentan. No hay
fallback anónimo ni segunda creación. No se contacta Render ni una base de datos.

El token existente `VERCEL_TOKEN` puede tener permisos más amplios que los usados;
los GET del script no reducen sus permisos en el proveedor. Revisar su mínimo
alcance efectivo corresponde al responsable, sin modificar Secrets en este PR.

## Pin del nuevo verificador y futura ejecución

El script nuevo **no existe en `0707586496678d2b089a5b861564f82b65eebc13`**.
No se cambia ese pin del ensayo anterior ni su lógica de creación. No volver
a lanzar el workflow anterior para intentar resolver el acceso al HTML.

El workflow nuevo `.github/workflows/vercel-staged-readonly.yml` permanece inerte:

- Solo workflow_dispatch y condición `false &&`.
- Environment `vercel-staged-approval` y concurrencia `chorotega-production`, sin cancelación del run en curso.
- `VERIFY_CODE_SHA` en ceros y `VERIFY_TRUST_CONFIGURED="false"`; el guard falla antes del checkout.
- Contents/actions read; id-token write únicamente en el job protegido. Sin hooks, CLI, npm install ni Render Secrets.

Después de autorizar la regla externa y revisar e integrar este PR, se debe
obtener el **SHA completo integrado que contenga el nuevo script y sus helpers**
y esperar su CI push/develop aprobado. En otro PR revisado fijar ese valor en
`VERIFY_CODE_SHA`, registrar la confirmación de la regla y retirar únicamente el
bloqueo del nuevo job cuando se autorice. El checkout usará ese SHA y verificará
que sea ancestro de develop; el script volverá a exigir su CI. No usar un pin
móvil, ceros ni el SHA antiguo que no contiene este verificador.

La ejecución requerirá autorización específica del responsable, Run workflow
únicamente sobre develop, la frase `[verify-vercel-staged:dpl_2RA5JfKczFobQfTwmLPqQV8RrBRB]`
y aprobación efectiva del Environment. Ninguno de esos pasos se realizó aquí.

## Pruebas y límites

Las pruebas usan fetch simulado, respuestas sintéticas y subprocesos Bash que
solo evalúan guards. Cubren 200 válido, 302 a Vercel, URL final distinta, HTML
incorrecto o excesivo, 401/403, errores y destino OIDC, aislamiento de tokens,
CI incompleto, baseline cambiado, duplicados antes/después y workflow bloqueado.
Se integran en el comando de pruebas del CI existente sin modificar `ci.yml`.

Validación local con Node 24.21.0: **119/119 pruebas del mecanismo aprobadas**,
incluidas las 23 nuevas de lectura y las 96 previas. Se conservan las 96 combinaciones
del job productivo. ESLint, sintaxis de seis MJS y JavaScript embebido, YAML,
Prettier, enlaces locales y `git diff --check` aprobaron. La comprobación local
del workflow nuevo verifica su bloqueo, los pins y el gate anterior a Secrets.

Los resultados se registran también en el PR. Los mocks no acreditan una regla externa
real ni una lectura OIDC exitosa en Actions. Las comprobaciones son puntuales:
no bloquean operadores externos y no garantizan que el alias no cambie después.
El POSTCHECK anterior se conserva sin cambios; este PR no habilita Promote,
una recuperación productiva automática ni una nueva publicación.
