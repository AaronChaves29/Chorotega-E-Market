# Despliegue de NestJS en Render — Laboratorio 6

## Estado de producción al 22 de octubre de 2026

El sistema está publicado desde `main`: [backend NestJS en Render](https://chorotega-e-market.onrender.com), [frontend Next.js en Vercel](https://chorotega-e-market-frontend.vercel.app), [Swagger UI](https://chorotega-e-market.onrender.com/docs) y [MVC administrativo](https://chorotega-e-market.onrender.com/admin/login). `develop` conserva el papel de integración. PostgreSQL está alojado en Supabase y la bitácora MongoDB en Atlas, según el despliegue reportado.

La auditoría de solo lectura comprobó HTTPS, Swagger con 35 operaciones, acceso al formulario MVC, health PostgreSQL y CORS del dominio real de Vercel. No inspeccionó las consolas de proveedores ni ejecutó migraciones o escrituras remotas. El health no constituye una prueba de Atlas. Los detalles y la evidencia pendiente están en [entrega-final.md](entrega-final.md).

[GitHub Actions aprobado](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/39828366237) para `main`, commit `d45b97cf0caae338a86a8dc6c393573759308d47`: jobs backend y frontend exitosos. Este SHA identifica el código auditado. La [captura original de Render incorporada](evidencias/render-deploy.jpeg) muestra main/Live/d45b97c y es consistente con ese commit. No se conoce la fecha exacta de captura; las evidencias y sus límites figuran en el [inventario](evidencias/README.md).

Este documento conserva abajo procedimientos de preparación y resultados históricos. No deben interpretarse como un despliegue todavía pendiente ni como autorización para repetir cambios sobre bases pobladas. No se modifican contratos, entidades ni migraciones en este cierre documental.

## Configuración manual reproducible

Se documenta la configuración manual en lugar de agregar un Blueprint: permite revisar bases existentes, secretos y permisos antes del primer despliegue, sin declarar recursos remotos. Los comandos de arranque y migraciones sí están versionados en `apps/backend/package.json`.

| Ajuste de Render                  | Valor                                                               |
| --------------------------------- | ------------------------------------------------------------------- |
| Tipo                              | Web Service                                                         |
| Repositorio                       | AaronChaves29/Chorotega-E-Market                                    |
| Name de referencia inicial        | chorotega-emarket-api                                               |
| Branch de producción              | main                                                                |
| Root Directory                    | apps/backend                                                        |
| Runtime                           | Node                                                                |
| Versión de Node                   | 22.22.0, igual a la versión fijada por el CI del backend            |
| Build Command                     | `npm ci --include=dev && npm run build && npm prune --omit=dev`     |
| Start Command                     | `npm run start`                                                     |
| Health Check Path                 | `/api/database/health`                                              |
| Pre-Deploy Command, plan gratuito | Vacío                                                               |
| Auto-Deploy                       | Verificar el ajuste vigente en Render; no se inspeccionó su consola |

El nombre de referencia de la preparación inicial no identifica por sí solo el servicio activo; usar la URL pública anterior y verificar su identificador en Render antes de operar. La tabla describe la configuración reproducible del repositorio, no una exportación de la consola.

El lockfile existente fija las dependencias; no se instala ni compila al iniciar. El build no necesita conexiones ni valores de secretos. Instala herramientas de desarrollo únicamente para compilar y después las elimina. El runtime ejecuta `dist/deployment/start-render.js`, sin Nest CLI ni ts-node. No sustituir este comando por el `start:prod` anterior: ese comando se conserva por compatibilidad y no ejecuta este control de migraciones.

Render proporciona `PORT`; no fijarlo ni sobrescribirlo en el servicio. El helper existente valida el puerto, escucha en `0.0.0.0` y registra hooks SIGTERM/SIGINT. Render termina HTTPS; la aplicación escucha HTTP interno. Los logs salen por stdout/stderr, sin archivos persistentes. Swagger sigue público en `/docs` y `/docs-json`; no se añade una ruta REST. El health actual comprueba PostgreSQL y devuelve 503 ante fallo; no comprueba continuamente Atlas. La inicialización de MongoDB debe finalizar antes de abrir el puerto HTTP.

El plan gratuito puede suspenderse por inactividad y tiene arranque en frío; no ofrece shell ni pre-deploy. No guardar datos en su sistema de archivos efímero. En un plan compatible de pago puede configurarse `npm run migration:run:prod` como pre-deploy; mantener `npm run start:render` para volver a comprobar pendientes antes de escuchar, incluso en reinicios. [Despliegues](https://render.com/docs/deploys), [servicios gratuitos](https://render.com/docs/free), [Node](https://render.com/docs/node-version), [health checks](https://render.com/docs/health-checks).

## Secuencia y concurrencia de migraciones

1. `start:render` valida todas las variables de producción, sin cargar `.env`.
2. Crea un DataSource de migración con `createDatabaseOptions`, la misma validación TLS del backend, `synchronize: false` y `migrationsRun: false`.
3. Inicia una transacción y adquiere `pg_try_advisory_xact_lock($1, $2)` con la clave compartida `[509, 6001]`.
4. Ejecuta las pendientes mediante `MigrationExecutor` con ese mismo QueryRunner y `transaction = 'all'`. El historial, el DDL y el lock usan una sola transacción. No basta con adquirir el lock en una conexión y llamar `DataSource.runMigrations()` en otra.
5. Confirma la transacción, libera el lock automáticamente, libera el QueryRunner y destruye el DataSource de migraciones.
6. Solo después importa AppModule, crea Nest y abre HTTP mediante la configuración existente.

Se registran explícitamente estas tres clases, compiladas por Nest a JavaScript:

| Migración                           | Efecto de `up()` existente                    |
| ----------------------------------- | --------------------------------------------- |
| CreateInitialSchema1788732000000    | Nueve tablas, restricciones e índices         |
| AlignTimestampDefaults1788998400000 | Normaliza cinco defaults temporales a `now()` |
| AddPasswordHashToUser1791352458237  | Agrega `usuario.clave_hash` nullable          |

El historial sigue siendo `typeorm_migrations`. No se ejecutan `down()`, sincronización, seeds, fixtures ni recreación de tablas. Se aplica solamente lo pendiente según el historial de TypeORM. Una base sin historial que ya tenga tablas requiere conciliación manual antes de desplegar: el ejecutor no infiere ni falsifica migraciones aplicadas.

El lock no requiere infraestructura adicional. Un segundo ejecutor falla inmediatamente y sale con código 1; no ejecuta DDL ni abre HTTP. No hay bucle automático de reintentos. Esperar a que termine el otro despliegue y reintentar explícitamente. En cada reinicio se consulta nuevamente el historial: si no hay pendientes, se continúa sin repetirlas. El bloqueo transaccional se libera también al revertir o perder la conexión. Todos los ejecutores deben usar este mecanismo y la misma base/clave; una CLI externa que omita el lock no queda protegida. [Advisory locks PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

La conexión tiene timeout de 10 segundos; dentro de la transacción se aplican `lock_timeout = '10s'` y `statement_timeout = '120s'`. Los errores causan rollback, limpieza y salida no exitosa. El logger de migraciones omite SQL, parámetros y errores originales; el comando emite un resultado resumido o un mensaje seguro. Si se pierde la respuesta al COMMIT, comprobar el historial antes de reintentar: PostgreSQL pudo haber confirmado. No revertir automáticamente una migración confirmada si el arranque de Nest/Atlas falla después.

Las tres migraciones actuales admiten transacción. Futuras migraciones con DDL no transaccional necesitan revisión; no cambiar `transaction` para evadir esta garantía. Las migraciones también deben ser compatibles con la instancia anterior que Render pueda mantener durante un despliegue. El lock serializa migradores, no detiene las peticiones de una instancia anterior. El arranque de Render deshabilita el logger de Nest durante la inicialización y emite diagnósticos sanitizados por etapa; después de abrir HTTP restablece ConsoleLogger. No habilitar logs de configuración ni copiar salidas sin revisión.

## Variables de servidor

Solo nombres, sin valores reales:

- `NODE_ENV`
- `NODE_VERSION`
- `PORT`, administrada por Render
- `DATABASE_URL`
- `DATABASE_SSL`
- `DATABASE_CA_CERT`, opcional según cadena de confianza
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `JWT_SECRET`
- `CORS_ORIGIN`

Seleccionar producción y TLS habilitado. Configurar secretos mediante el panel de Render, nunca en Git, comandos compartidos, colección HTTP ni variables públicas del navegador. `CORS_ORIGIN` utiliza el origen HTTPS real del frontend, sin rutas ni barra final, y debe incluir el del backend para sus formularios MVC según el middleware actual. La auditoría comprobó la aceptación del origen de Vercel y el rechazo de un origen externo. Se conservan Authorization, Content-Type y exposición de Location. El secreto JWT debe ser aleatorio, exclusivo y de al menos 32 caracteres.

Vercel utiliza `API_URL` como variable de servidor y `NODE_ENV` como ambiente de ejecución. `API_URL` debe seleccionar el backend con el prefijo `/api/v1`, sin credenciales. No se requiere `NEXT_PUBLIC_API_URL` para el cliente centralizado actual. No colocar credenciales de bases ni JWT_SECRET en Vercel ni en variables públicas del navegador.

## Supabase: procedimiento previo a cambios autorizados

1. Antes de autorizar un despliegue, identificar proyecto, base y esquema correctos; inventariar tablas, datos y restricciones. Obtener respaldo consistente y verificar el procedimiento de restauración según el plan disponible.
2. Revisar las filas de `typeorm_migrations`, si existe, y compararlas con las tres clases anteriores. Confirmar las nueve tablas, los defaults de fecha y `clave_hash`. Si hay tablas sin historial, migraciones desconocidas o divergencias, detenerse y resolver el baseline fuera del arranque; no ejecutar la migración inicial sobre tablas existentes ni editar el historial automáticamente.
3. Obtener `DATABASE_URL` desde Connect del proyecto. Preferir conexión directa si Render tiene conectividad compatible; Supabase ofrece directa IPv6 por defecto. Si solo hay IPv4, evaluar el pooler compartido en modo sesión. Usar directa o modo sesión para este despliegue, no asumir compatibilidad del pooler transaccional con DDL. No asumir conectividad por el formato de la URL.
4. Habilitar `DATABASE_SSL`. Descargar la CA correspondiente desde la configuración oficial del proyecto y configurar `DATABASE_CA_CERT` cuando no baste la confianza del runtime. No incluir parámetros `ssl*` ni `uselibpqcompat` en la URL: el backend ya controla TLS y verifica certificado/hostname. No usar `rejectUnauthorized: false`.
5. Tras autorización independiente, verificar red, cadena TLS, permisos DDL e historial con credenciales de alcance adecuado. El cierre documental no realiza esa conexión ni cambia sus permisos. El plan gratuito de arranque usa la misma DATABASE_URL para migrar y servir, por lo que requiere permisos de migración; una separación de roles migrador/runtime sería una mejora posterior con otro procedimiento.

Fuentes: [conexiones y poolers](https://supabase.com/docs/guides/database/connecting-to-postgres), [validación SSL](https://supabase.com/docs/guides/platform/ssl-enforcement).

## Atlas: procedimiento de aprovisionamiento para operaciones autorizadas

1. Seleccionar el cluster y una base de datos dedicada; crear un usuario de base con permisos mínimos para esa base. Configurar `MONGODB_URI` y `MONGODB_DATABASE` en Render. Usar SRV/TLS con validación de certificados y sin flags que desactiven seguridad.
2. Obtener los rangos de salida del servicio/región de Render y agregarlos a la lista de acceso de Atlas; no abrir `0.0.0.0/0`. Verificar DNS y conectividad solo después de autorización. [Acceso de red Atlas](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
3. La aplicación no aprovisiona esquema ni índices. La colección `bitacora_pedidos` requiere el validador `$jsonSchema` existente y el índice único `{ pedidoId: 1 }`, llamado `uq_bitacora_pedido_id`. Sin ese índice, un upsert concurrente no garantiza una sola bitácora por pedido.
4. En una sesión administrativa autorizada, seleccionar explícitamente `MONGODB_DATABASE`, inspeccionar colecciones, validadores, índices y posibles duplicados de `pedidoId`. Respaldar datos. Copiar y revisar únicamente la definición `bitacoraValidator` de `database/mongodb/seeds/seed-bitacora-pedidos.js`; no ejecutar ese archivo, que también carga fixtures y selecciona una base de desarrollo.
5. Con el objeto `bitacoraValidator` revisado y la base correcta seleccionada, el aprovisionamiento estructural idempotente es:

```javascript
const collectionName = "bitacora_pedidos";
if (!db.getCollectionNames().includes(collectionName)) {
  db.createCollection(collectionName, {
    validator: bitacoraValidator,
    validationLevel: "strict",
    validationAction: "error",
  });
} else {
  const result = db.runCommand({
    collMod: collectionName,
    validator: bitacoraValidator,
    validationLevel: "strict",
    validationAction: "error",
  });
  if (result.ok !== 1) throw new Error("No se aplicó el validador.");
}
db.getCollection(collectionName).createIndex(
  { pedidoId: 1 },
  { name: "uq_bitacora_pedido_id", unique: true },
);
```

Repetirlo conserva documentos y no inserta fixtures; si hay índices incompatibles o duplicados, detenerse y conciliarlos, sin borrar índices/datos automáticamente. MongoDB solo verifica documentos nuevos o modificados con el validador; revisar también los preexistentes. El aprovisionamiento es manual, no forma parte del build ni del arranque. No se ejecutó durante el bloque inicial ni durante este cierre documental. El registro específico de índices/validador y una comprobación actual de Atlas siguen pendientes; no se presentan como verificados por el estado Live de Render.

## Operación y registro del despliegue existente

El primer despliegue ya fue realizado, según el reporte de producción. Para cualquier despliegue posterior desde `main`, revisar previamente bases, respaldos y permisos; inspeccionar el resumen de migraciones, health, conexión Atlas, HTTPS, Swagger y CORS. Adjuntar el registro de despliegue con SHA, fecha y resultado, sin variables ni datos sensibles. El reporte recibido indica PostgreSQL conectado y migraciones sin pendientes, pero aún falta adjuntar el resultado de migraciones del proveedor. La captura de Render Live incorporada no muestra dicho historial. No repetir el aprovisionamiento ni cargar datos de desarrollo para obtener capturas.

API y frontend publican HTTPS administrado por sus plataformas. Las bases utilizan sus protocolos PostgreSQL/MongoDB sobre TLS; no se publican como endpoints HTTP. El código exige validación de certificados en producción. Una captura del estado Live o un test de opciones no demuestra por sí solo todos los detalles del handshake.

Si falla una migración, no habrá listener nuevo: inspeccionar historial y estado con acceso autorizado antes de reintentar. Una migración confirmada no se deshace al hacer rollback del código en Render. Revisar siempre compatibilidad y respaldos. En reinicios se repite el control de pendientes; la disponibilidad de ambas bases sigue siendo necesaria para arrancar.

## Pruebas y límites

Las pruebas unitarias verifican configuración de migraciones, lock previo al ejecutor, conexión compartida, rollback/limpieza, rechazo de concurrencia y orden migraciones → HTTP. `npm run test:deployment`, después del build, ejecuta los entrypoints compilados con configuración incompleta y verifica las nueve entidades/tres migraciones cargadas sin inicializar conexión ni cargar ts-node/TypeScript/Nest CLI. No utiliza `.env` privado.

La suite `production-migrations.integration-spec.ts` usa PostgreSQL temporal para comprobar historial en reinicios, exclusión concurrente y rollback después de DDL/escrituras. Requiere Docker; las simulaciones unitarias no demuestran esas garantías en un servidor real. Esos resultados son de bases temporales. La evidencia remota disponible y sus límites se separan en [entrega-final.md](entrega-final.md); CI no utiliza Supabase ni Atlas.

Resultados históricos locales del bloque inicial de despliegue del **Laboratorio 6**, anteriores a MVC y a la publicación en producción:

| Comprobación                              | Resultado                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Prettier                                  | Archivos nuevos y package.json aprobados; párrafo nuevo del README revisado           |
| ESLint completo                           | Aprobado, sin advertencias                                                            |
| TypeScript sin emisión ni incremental     | Aprobado                                                                              |
| Build                                     | Aprobado                                                                              |
| Unitarias completas                       | 394/394, 33 suites; 13 casos nuevos                                                   |
| Artefactos compilados (`test:deployment`) | 4/4, sin conexión a bases                                                             |
| Cobertura existente                       | Statements 96.97%, branches 84.63%, functions 89%, lines 97.18%; umbrales sin cambios |
| Integración                               | No ejecutada: Docker no disponible; 19 suites, incluida la nueva de cuatro casos      |
| E2E                                       | No ejecutada: Docker no disponible; 11 suites HTTP                                    |
| git diff --check                          | Sin errores                                                                           |

En ese bloque inicial, el entorno local utilizó Node.js 26.11.1 y no ejecutó el arranque remoto. Posteriormente, el CI de cierre con Node.js 22.22.0 aprobó las integraciones y el despliegue se reportó operativo. Consultar [la evidencia consolidada](entrega-final.md) para los resultados actuales. Ninguna prueba omitida en la tabla histórica se considera ejecutada en aquel bloque.
