# Correcciones previas al release — 19 de noviembre de 2026

Base revisada: develop `b366f5dcae35f16ee6c0476267ca1a122b996fd7`.
Estas correcciones no autorizan merge, migraciones, aprovisionamiento ni publicación.
El job productivo conserva **`false &&`**; un push o PR de esta rama no puede ejecutarlo.

## PostgreSQL: objetos internos privados

La sexta migración `AddOrderAuditOutbox1795082400000` crea sus dos tablas en
`public`, revoca todos los privilegios de PUBLIC y, si existen, `anon` y
`authenticated`, y habilita RLS sin políticas públicas ni FORCE RLS. El rol
que crea las tablas conserva su propiedad y acceso; un rol runtime distinto
requiere grants explícitos y políticas RLS limitadas a ese rol, revisados por el operador;
los grants por sí solos no evitan el default-deny de RLS.

`runProductionMigrations()` inicia una transacción en un QueryRunner, adquiere
el advisory lock transaccional y utiliza ese mismo runner en MigrationExecutor
con `transaction='all'`. DDL, revocaciones y registro del historial se confirman
juntos. Un fallo posterior revierte los tres. No hay ventana entre creación y
revocación; tampoco se omite la protección si faltan roles específicos de Supabase.

La migración todavía no estaba aplicada en producción en la auditoría previa.
Si otro entorno ya registró la versión anterior de esta migración, TypeORM **no la
reaplica**: ese entorno necesita una corrección de ACL explícita y autorizada.
Nunca borrar su historial para forzar una repetición.

### Tablas existentes: SQL separado, no automático

[release-privileges.sql](sql/release-privileges.sql) es una propuesta operativa,
no una migración ejecutada por el backend. Revoca acceso web al historial y su
secuencia, y TRUNCATE a las nueve tablas comerciales. RLS no protege TRUNCATE.
No cambia propietarios, contraseñas, datos ni privilegios predeterminados globales.
La inspección de membresías y comprobación efectiva posterior detecta accesos
heredados adicionales; si siguen existiendo, aborta para revisión humana.

Antes de autorizarla:

1. Identificar el rol técnico efectivo de Render mediante canal privado. No suponer
   que sea el usuario del MCP. Si usa roles separados, verificar cada uno.
2. Obtener respaldo reciente, comprobar su huella y restaurarlo en PostgreSQL aislado.
3. Probar el script con ese rol y revisar ACL, membresías y permisos predeterminados.
4. Preparar directorio privado con `umask 077` y nombre nuevo para el archivo de
   recuperación. No subir ese archivo, salida privada ni respaldo a GitHub.
5. Ejecutar solamente tras autorización, con conexión TLS y credenciales seguras:

   ```sh
   psql -X -v ON_ERROR_STOP=1 -v technical_role=ROL_TECNICO_VERIFICADO \
     -v recovery_file=/ruta/privada/recuperacion-UNICA.sql \
     -f docs/laboratory/lab-07/sql/release-privileges.sql
   ```

El script conserva un snapshot de permisos efectivos del rol indicado y compara
antes/después; una diferencia aborta la transacción. Guarda grants explícitos de
recuperación sin datos comerciales. Fallar antes del COMMIT revierte los cambios.
Después del COMMIT, una restauración de privilegios exige revisar ese archivo y
nueva autorización; restauraría también permisos inseguros, por lo que no es una
recuperación automática recomendada. El propietario conserva sus permisos.

## Vercel: health protegido y alias real

Se utiliza el mecanismo oficial
[Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)
por encabezado `x-vercel-protection-bypass`. SSO permanece habilitado.
No se utiliza parámetro en URL, cookie de bypass, ni el token de API como bypass.

Configuración externa **pendiente, no realizada por este PR**:

- Autorizar que un administrador configure un secreto de bypass dedicado al proyecto.
- Guardarlo en GitHub como **VERCEL_AUTOMATION_BYPASS_SECRET**, sin prefijo público,
  con acceso limitado al job de producción. Tiene alcance sobre deployments del
  proyecto; custodiarlo y revocarlo al dejar de necesitarlo. No incluirlo en capturas.
- Comprobar posteriormente su funcionamiento real. Las pruebas locales usan valores
  sintéticos y no demuestran que Deploy, Promote o el bypass estén autorizados.

El preflight rechaza ausencia del secreto antes de build/Render. El encabezado se
usa únicamente en GET de frontend cuyo deployment ya pasó validación de API, o
el dominio principal configurado tras comprobar la promoción. Se excluye del
entorno de procesos CLI; no se envía a Render ni a la API de Vercel.
El health exige HTTP 200, HTML y las cuatro marcas del login en la misma URL.
Rechaza redirecciones, incluida Vercel Authentication, incluso si otro destino
responde 200. No se registra el cuerpo de error ni el secreto.

`GET /v4/aliases/{dominio}` es la autoridad para la asignación del dominio:
se exige alias exacto, proyecto exacto, deploymentId aprobado y ausencia de
redirect; si aparece `deployment.id`, debe coincidir. Se combina con
`GET /v13/deployments/{id}` para READY, SHA, rama main, target production e
identidad, y con el proyecto autenticado para el equipo autorizado.
Las proyecciones opcionales `aliasAssigned` y `alias: []` no acreditan ni niegan
por sí solas una promoción. Un error explícito o una contradicción se rechaza.

Se conservan búsqueda por SHA antes de crear, rechazo de candidatos múltiples,
una única creación, reconciliación GET ante resultados ambiguos y validación
Render/SHA/main. Una promoción ambigua no se repite en la misma ejecución.
Si la API confirma que ya se promovió, el rerun y la recuperación no vuelven a
promover. No se agregaron reintentos de mutaciones ni mayores timeouts.

## Validaciones

Resultados locales bajo Node.js 22.22.0:

- Orquestación: 131/131, incluidos los controles de las 96 combinaciones del workflow.
- Backend unitarias: una ejecución 766/767 por `socket hang up` en
  `admin-http.spec.ts`, creación de productos con PRG. Contraste aislado 68/68 y
  una ejecución completa posterior 767/767. No se demuestra resuelta la intermitencia.
- Integración seleccionada de seguridad/migraciones/outbox: 123/123, seis suites.
  Incluye el publicador real con PostgreSQL y MongoDB temporales.
- Revalidación final de migraciones/outbox: 31/31. Tras añadir el contraste del
  rol técnico dependiente de PUBLIC, privilegios y recuperación: 5/5.
- Artefacto compilado: 9/9. Build backend, tipos completos y ESLint aprobados.
- La primera ejecución unitaria dentro del sandbox falló al abrir sockets (`EPERM`);
  se repitió fuera del sandbox para permitir el HTTP local. No es evidencia de
  regresión funcional. La primera comprobación ESLint de scripts los ignoró por
  ruta; una comprobación posterior desde la raíz analizó ambos sin advertencias.
- Sintaxis Node, YAML, Prettier y diff check verificados al cierre.
- No se ejecutó toda la integración ni el navegador frontend localmente; se deja
  explícito su alcance y se solicita CI independiente antes de integrar.
  Las pruebas nuevas utilizan contenedores temporales propios y mocks; no acceden a
  Supabase ni Atlas. La prueba SQL también ejecuta el archivo de recuperación sobre
  el contenedor aislado, nunca en producción.

Se conserva el historial de intermitencias HTTP y Chrome: aprobar esta revisión
no demuestra que su causa histórica esté resuelta. El CI no ejecuta toda la suite
Chrome del frontend; no se atribuye esa cobertura al CI remoto.

## Secuencia de salida a producción, todavía no autorizada

1. Aprobar CI y revisar este PR antes de integrarlo a develop.
2. Respaldo reciente recuperable; verificar timestamps históricos sin conversiones
   masivas. Confirmar roles técnicos, variables y privilegios.
3. Autorizar por separado SQL operativo y aprovisionamiento Atlas mediante
   `node dist/deployment/provision-order-audits.js`. Revisar duplicados, permisos,
   índice único y validador compatible; sin seeds ni pérdida de historial.
4. Autorizar PR develop → main con producción bloqueada; comprobar ambos CI.
5. Configurar y verificar bypass seguro, destino de API_URL, TLS, Auto-Deploy Off,
   Git deployments de main bloqueados y health Render disponible.
6. Solo tras otra autorización, preparar activación revisada de Actions.
7. El flujo prepara prebuilt, publica Render con migraciones 5/6 antes de HTTP,
   comprueba SHA/health, crea o reconcilia Vercel staged, valida login protegido,
   promueve y comprueba alias final. La migración fallida impide abrir HTTP.
8. Smoke de cuatro roles y siete eventos, sin datos reales en el video.

Detener ante backup insuficiente, migración fallida, alias/SHA inesperado,
health fallido o bitácora detenida. Consultar API antes de repetir una mutación
ambigua. No hay transacción ni rollback automático entre ambos proveedores.
Una recuperación autorizada de aplicaciones debe conservar esquema aditivo y
outbox; no ejecutar down ni restaurar datos automáticamente.
