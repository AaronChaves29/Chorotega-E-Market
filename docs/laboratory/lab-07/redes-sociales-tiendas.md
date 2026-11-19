# Redes sociales de tiendas — Backend, fase A

## Alcance y compatibilidad

Base: `cecfb9b22ea51a3a85b18534ea2326bd2aa1dcf7`, con el carrito integrado.
Rama de implementación: `feature/redes-sociales-tiendas-backend`.

Este bloque añade contactos comerciales opcionales a tiendas. Conserva rutas,
campos previos, filtros, paginación, pedidos, inventario y reglas de propiedad.
No implementa pantallas, imágenes, favoritos, notificaciones ni consultas externas
para comprobar cuentas. No se ejecutan migraciones ni operaciones en producción.

Los GET de catálogo requieren JWT según la política vigente. Los contactos
registrados se incluyen en las respuestas de tiendas para esos usuarios
autenticados. El emprendedor debe proporcionar expresamente los datos comerciales
que desea publicar; nunca se infieren desde contactos personales.

## Modelo y migración

| JSON / TypeScript | Columna PostgreSQL | Tipo         | Ausencia inicial |
| ----------------- | ------------------ | ------------ | ---------------- |
| instagramUrl      | instagram_url      | VARCHAR(500) | NULL             |
| facebookUrl       | facebook_url       | VARCHAR(500) | NULL             |
| whatsappComercial | whatsapp_comercial | VARCHAR(16)  | NULL             |

`1794772600000-AddStoreSocialContact.ts` añade únicamente estas tres columnas
nullable, sin backfill, índices, UNIQUE ni nuevas tablas. Las tiendas anteriores
conservan sus IDs, propietario y datos; los contactos nuevos quedan NULL.

La migración está registrada explícitamente en el ejecutor productivo,
Testcontainers y la fixture MVC de Chrome. Nest compila la clase a JavaScript.
La prueba del artefacto exige cinco migraciones y comprueba la nueva clase.
La configuración CLI existente también la descubre mediante su glob.

**Aplicar la migración antes de utilizar este backend y el nuevo contrato.**
El arranque productivo existente ejecuta migraciones pendientes antes de abrir
HTTP, con el mismo bloqueo y TLS validado. No se cambia ese mecanismo.

Orden para un despliegue futuro autorizado:

1. Revisar respaldo, historial y permisos; probar primero sobre una copia aislada.
2. Aplicar las migraciones pendientes con el ejecutor compilado existente, antes
   de servir tráfico del nuevo backend. No ejecutar seeds ni synchronize.
3. Verificar arranque y lectura de una tienda previa: contactos NULL.
4. Incorporar después los consumidores de frontend de la fase B.

ALTER TABLE requiere un bloqueo breve; coordinar la ventana si hay transacciones
largas. El timeout existente debe provocar fallo seguro ante contención.
Un backend anterior tolera las columnas adicionales. `down()` elimina únicamente
las tres columnas: conserva los datos históricos anteriores, pero **pierde los
contactos nuevos**. Antes de revertir, respaldarlos y retirar el backend que los
requiere; no hacer rollback automático.

## Contratos HTTP

- `POST /api/v1/stores`: los tres campos son opcionales y admiten null.
- `PATCH /api/v1/stores/:id`: omitido conserva; null elimina; string válido reemplaza.
  No se convierten propiedades undefined en null durante PATCH.
- `GET /api/v1/stores` y `GET /api/v1/stores/:id`: el mapper devuelve siempre
  las tres propiedades como string canónico o null, junto con los campos previos.
- `POST /api/v1/auth/register/entrepreneur`: los campos van dentro de `tienda`,
  heredados por `EntrepreneurStoreDto`. La cuenta conserva sus campos previos.

Ejemplo de los campos que pueden agregarse a CREATE o al objeto `tienda` del
registro (perfiles ilustrativos, no cuentas verificadas):

```json
{
  "instagramUrl": "https://instagram.com/negocio_local/",
  "facebookUrl": "https://facebook.com/profile.php?id=123456",
  "whatsappComercial": "+506 8888-8888"
}
```

Se guardan como `https://www.instagram.com/negocio_local/`,
`https://www.facebook.com/profile.php?id=123456` y `50688888888`.

```json
{ "instagramUrl": null }
```

Ese PATCH elimina solo Instagram, conservando Facebook, WhatsApp y los demás
campos omitidos. La respuesta no incluye entidades, relaciones ni datos privados
del propietario. OpenAPI documenta opcionalidad, nulabilidad y ejemplos; las
pruebas inspeccionan el JSON generado, incluida la herencia de registro.

## Formatos admitidos

### Instagram

HTTPS, autoridad exactamente `instagram.com` o `www.instagram.com`, sin
credenciales, puertos explícitos (ni siquiera `:443`), query o fragmento.
Un único segmento de perfil de 1–30 caracteres ASCII: letras, números,
puntos y guion bajo. No empieza/termina con punto ni tiene puntos consecutivos.
Barra final opcional; salida con `www` y barra final.

Se excluyen recursos reservados como `p`, `reel`, `reels`, `stories`, `accounts`
y `direct`. No se aceptan rutas adicionales, escapes percent-encoded, segmentos
`..`, espacios, controles o barras inversas. La lista exacta está en
[store-social-contact.ts](../../../apps/backend/src/modules/stores/validation/store-social-contact.ts).

### Facebook

HTTPS con `facebook.com` o `www.facebook.com` y las mismas restricciones de
autoridad. Un único nombre ASCII de hasta 100 caracteres (letras, números y
puntos, sin puntos extremos/consecutivos) o exactamente
`/profile.php?id=<entero positivo de hasta 20 dígitos>`.

No se permiten parámetros adicionales, repetidos, fragmentos ni endpoints PHP
alternativos. Se rechazan rutas reservadas de login, redirección, grupos,
marketplace, publicaciones y otros recursos ajenos a perfiles definidos.
Enlaces compartidos, `m.facebook.com`, `/pages/...` y `/people/...` no están
admitidos; se debe registrar el enlace de perfil canónico admitido.

### WhatsApp comercial

Campo independiente de `telefono`, incluso en el registro de emprendedores.
Se admite un número internacional explícito en dígitos, o con `+` inicial y
espacios/guiones. La entrada formateada tiene máximo 64 caracteres; la salida
canónica contiene de 8 a 15 dígitos y comienza de 1 a 9.

Ejemplos equivalentes: `50688888888`, `+506 8888-8888`. Ambos producen
`50688888888`, compatible con `https://wa.me/50688888888`.
No se aceptan `00` inicial, URLs de WhatsApp, extensiones, letras ni un número
local formateado como `8888-8888`. Los dígitos canónicos se interpretan como
internacionales con código de país proporcionado por el usuario: no se infiere
Costa Rica ni se verifica que el número/código esté asignado o tenga WhatsApp.
La validación es sintáctica, no prueba existencia ni titularidad.

## Validación y seguridad

La misma validación se usa en los DTO de CREATE, PATCH y registro. Los servicios
normalizan y vuelven a validar únicamente las propiedades presentes, incluso en
llamadas internas, antes de persistir. Los mensajes de error son estáticos por
campo: no reflejan la URL recibida. No se hacen peticiones HTTP ni DNS.

| Actor                             | Creación de tiendas               | Modificación                                 |
| --------------------------------- | --------------------------------- | -------------------------------------------- |
| ADMIN                             | Para EMPRENDEDOR ACTIVO existente | Cualquier tienda, sin transferir propietario |
| EMPRENDEDOR                       | Solo a su nombre                  | Solo tienda propia; ajena responde 404       |
| CLIENTE / REPARTIDOR              | 403                               | 403                                          |
| JWT ausente / inválido / expirado | 401                               | 401                                          |

Se conservan `JwtAuthGuard`, `RolesGuard`, los roles y los predicados SQL de
propiedad. Cambiar `idEmprendedor` continúa prohibido incluso para ADMIN.
DTO inválido produce 400 Problem Details, sin escribir parcialmente. No se añaden
nuevos códigos ni se cambian los conflictos de integridad existentes.

El registro mantiene una sola transacción para usuario y tienda. Un error de
validación impide ambas inserciones. Si falla el INSERT de tienda se revierte
el usuario; se verifica con un trigger temporal de prueba, no mediante errores
simulados del repositorio.

## Frontend al cerrar la fase A (estado histórico)

La [fase 6B](../../frontend/redes-sociales-tiendas.md) amplía posteriormente el
registro y el detalle con contactos. Los párrafos siguientes describen el límite
original de esta fase backend; no representan el estado frontend de la fase 6B.

La fase A no modifica Next.js. El registro existente sin contactos sigue
funcionando. Su intermediario mantiene una whitelist que todavía **rechaza**
estos campos nuevos; debe ampliarse junto con los tipos/formularios en la fase B.
Tampoco se muestran todavía redes sociales en `/tiendas/[id]` ni existe aquí
una pantalla de edición. No se presentan enlaces ficticios de Figma.

La fase B deberá pedir consentimiento explícito al emprendedor, mostrar solo
campos registrados y generar WhatsApp desde los dígitos canónicos. Los enlaces
externos deben usar HTTPS y, al abrir una pestaña, `rel="noopener noreferrer"`.
Los datos anteriores y los contratos de catálogo/pedidos/carrito no requieren
cambios para continuar utilizándose.

## Verificación local

Solo PostgreSQL 16 efímero mediante Testcontainers, sin .env ni bases remotas.
Ejecuciones iniciales con Node 24.21.0. Para el contraste se descargó Node
22.22.0 desde nodejs.org, se verificó SHA-256 y se extrajo únicamente en
`/private/tmp`, sin cambiar dependencias ni configuración del repositorio.

Las pruebas nuevas cubren:

- Formatos válidos y peligrosos, normalización, null y herencia de DTO.
- CREATE, detalle/listado, PATCH omitido/null/reemplazo y ausencia de escrituras
  ante errores; JWT real y controles de roles/propiedad sin desactivar guards.
- Registro con/sin contactos y rollback real de ambas entidades.
- Migración con tiendas existentes, longitudes/NULL, ejecución única y reversión.
- Registro productivo/temporal y presencia de la migración compilada.
- Esquemas OpenAPI reales.

Resultados locales del 15 de noviembre de 2026:

| Comprobación                                                                  | Resultado                                |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| Backend `npm test -- --runInBand`                                             | 686/686; 48 suites                       |
| Integración focalizada de contactos, tiendas, registro, OpenAPI y migraciones | 180/180; 7 suites                        |
| Backend `npm run test:integration` completo                                   | **795/796; 31 de 32 suites aprobadas**   |
| Suite de seguridad de catálogo aislada, tras el incidente                     | 88/88                                    |
| Artefacto compilado `npm run test:deployment`                                 | 9/9                                      |
| Chrome MVC `npm run test:browser`                                             | 9 escenarios y prueba contenedora: 10/10 |
| Frontend `npm test`                                                           | 105/105                                  |
| Navegador frontend, ejecución secuencial de archivos                          | 90/90                                    |
| Builds backend y frontend                                                     | Aprobados                                |
| ESLint backend/frontend y TypeScript sin emisión ni incremental en ambos      | Aprobados                                |

La integración completa registró `socket hang up` en
`catalog-write-security.integration-spec.ts` → `patch categories` →
`JWT invalid devuelve 401 sin escribir`. Esa suite aprobó aislada después,
sin alterar código ni expectativas. **No se considera corregido ni se atribuye
una causa a ese incidente.** No se repitió indefinidamente la integración para
obtener un resultado verde. El resto de las 31 suites, incluidas transacciones,
concurrencia, pedidos, esquema y contactos, aprobaron en la ejecución completa.

En la primera ejecución focalizada se corrigieron dos defectos de las pruebas
nuevas: import dinámico incompatible con Jest y creación anticipada de dos
peticiones Supertest sobre un servidor de puerto efímero. La ejecución final
focalizada aprobó íntegra; no se modificó la infraestructura compartida.
La ejecución inicial de unitarias dentro del sandbox no pudo abrir puertos
(EPERM); las 686 pruebas finales se ejecutaron con permiso de HTTP local.

Los 90 casos de navegador incluyen catálogo, detalle, registro/login, sesiones,
carrito, compra e inventario en PostgreSQL temporal. Se conservan los archivos
funcionales de frontend. No se ejecutó `test:e2e` como comando separado; sus
archivos HTTP están incluidos en la integración completa, cuyo fallo se declara
arriba. No se presenta esa ejecución como totalmente aprobada.

Los totales solapados no se suman como casos distintos. No se ejecutaron pruebas
contra Supabase, Atlas ni otros servicios productivos. Los contenedores de estas
pruebas se cierran; se conserva el contenedor PostgreSQL local preexistente.
Seguimiento previo al Draft PR:

| Comprobación adicional                          | Resultado                              |
| ----------------------------------------------- | -------------------------------------- |
| Integración completa más reciente, Node 24.21.0 | **794/796; 31 de 32 suites aprobadas** |
| Categories y seguridad del catálogo aisladas    | 131/131                                |
| Users aislado después de los fallos             | 74/74                                  |
| Integración completa, Node 22.22.0 / npm 10.9.4 | **796/796; 32 suites; 119,998 s**      |

En la segunda ejecución completa con Node 24 no se reprodujo el error de
Categories, pero Users obtuvo dos 401 inesperados: PATCH parcial esperaba 200 y
PATCH con `{"extra":true}` esperaba 400. Users aprobó luego aislado. Los fallos
siguen sin causa demostrada y no se consideran corregidos.

El log original de `socket hang up` no incluye stack ni eventos por petición;
el caso también ejecuta cinco logins en `beforeEach`. No permite demostrar
si falló el PATCH o una petición de preparación. La configuración original y
los contrastes usan `--runInBand`, sin suites Jest paralelas. Se encontraron
antecedentes del síntoma en el commit base, sin demostrar una causa común.

El contraste con Node 22 ejecutó el mismo comando de integración y los 796
casos con PostgreSQL temporal, sin cambiar código, timeouts ni añadir reintentos.
Una ejecución aprobada no demuestra que Node 24 sea la causa de los incidentes.
Al no persistir el fallo en este contraste, no se añadió una ejecución del
commit base en un worktree. La validación oficial de CI queda pendiente del
Draft PR, que **no autoriza merge ni producción**.

## Archivos del bloque

24 archivos existentes modificados y 7 nuevos. Los cambios en pruebas de
infraestructura actualizan el historial esperado a cinco migraciones; los
servicios de pedidos y productos no se modifican. Inventario para revisión:

```text
apps/backend/src/auth/entrepreneur-registration.service.spec.ts
apps/backend/src/auth/entrepreneur-registration.service.ts
apps/backend/src/database/production-migrations.spec.ts
apps/backend/src/database/production-migrations.ts
apps/backend/src/modules/stores/dtos/create-store.dto.ts
apps/backend/src/modules/stores/dtos/store-response.dto.ts
apps/backend/src/modules/stores/dtos/update-store.dto.ts
apps/backend/src/modules/stores/entities/store.entity.ts
apps/backend/src/modules/stores/mappers/store.mapper.ts
apps/backend/src/modules/stores/repositories/stores.repository.ts
apps/backend/src/modules/stores/services/stores.service.spec.ts
apps/backend/src/modules/stores/services/stores.service.ts
apps/backend/test/browser/admin-mvc.browser.test.cjs
apps/backend/test/deployment/compiled-deployment.test.cjs
apps/backend/test/integration/catalog-repositories.integration-spec.ts
apps/backend/test/integration/http/entrepreneur-registration.integration-spec.ts
apps/backend/test/integration/http/openapi.integration-spec.ts
apps/backend/test/integration/http/stores.integration-spec.ts
apps/backend/test/integration/orders.integration-spec.ts
apps/backend/test/integration/postgres-infrastructure.integration-spec.ts
apps/backend/test/integration/product-version-migration.integration-spec.ts
apps/backend/test/integration/production-migrations.integration-spec.ts
apps/backend/test/support/postgres-test-database.ts
docs/laboratory/lab-07/entrepreneur-registration.md
apps/backend/src/database/migrations/1794772600000-AddStoreSocialContact.ts
apps/backend/src/modules/stores/dtos/store-social-contact.dto.ts
apps/backend/src/modules/stores/validation/store-social-contact.spec.ts
apps/backend/src/modules/stores/validation/store-social-contact.ts
apps/backend/test/integration/http/store-social-contact.integration-spec.ts
apps/backend/test/integration/store-social-migration.integration-spec.ts
docs/laboratory/lab-07/redes-sociales-tiendas.md
```
