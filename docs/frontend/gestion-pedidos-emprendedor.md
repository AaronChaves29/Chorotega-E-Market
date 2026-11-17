# Fase 8: Pedidos recibidos por el emprendedor

Base: `9bae51fc6850ccf55067023ffc33f5fbe5abc0ca`, merge del PR #144.
El [CI posterior al merge](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44028082530)
terminó en Success antes de crear `feature/gestion-pedidos-emprendedor`.
Validación local: 17 de noviembre de 2026, Costa Rica. La implementación se entrega
para revisión mediante PR hacia `develop`; publicar la rama no autoriza merge,
despliegue productivo ni migraciones remotas.

## Alcance y arquitectura

El EMPRENDEDOR selecciona una tienda propia en Mi negocio y utiliza estas páginas:

| Página                                      | Función                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `/mi-negocio/tiendas/:id/pedidos`           | Listado de pedidos recibidos, seis por página, filtro por estado y detalle. |
| `/mi-negocio/tiendas/:id/pedidos/:pedidoId` | Detalles históricos y confirmación para comenzar preparación.               |

Cada tarjeta de Mis tiendas incorpora «Ver pedidos», conservando Gestionar
productos, Editar tienda y Ver tienda. El layout de Mi negocio y SessionBoundary
existentes mantienen autenticación y recuperación de sesión. No se cambia login,
menús de otros roles, `/pedidos` del CLIENTE ni `/api/orders`.

Se reutilizan `managementActor()`, `ownedStore()`, respuestas seguras y eliminación
de cookie de gestión; `useBusinessData()` para lectura con cancelación y protección
contra respuestas de rutas anteriores; el validador de página de Fase 7; y el
formateador CRC existente. Los estilos proceden de Mi negocio, con un CSS Module
específico para detalles y confirmación. No se añaden dependencias.

## Contratos y autorización

| BFF privado                                                    | Contrato NestJS utilizado                                 |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| GET `/api/mi-negocio/tiendas/:id/pedidos`                      | GET `/api/v1/orders` con tienda impuesta por el servidor. |
| GET `/api/mi-negocio/tiendas/:id/pedidos/:pedidoId`            | GET `/api/v1/orders/:id`, lectura directa por ID.         |
| PATCH `/api/mi-negocio/tiendas/:id/pedidos/:pedidoId/preparar` | PATCH `/api/v1/orders/:id/prepare`, cuerpo `{}`.          |

Cada BFF autentica usando la cookie HttpOnly y `/auth/me`, exige EMPRENDEDOR y
comprueba propiedad de la tienda antes de consultar pedidos. CLIENTE, ADMIN y
REPARTIDOR reciben 403 en este módulo, aunque ADMIN conserve sus permisos REST
existentes. Tienda ajena/inexistente y pedido ajeno/inexistente devuelven 404.
Un pedido de otra tienda del mismo emprendedor tampoco es accesible mediante
la URL de la primera tienda. El detalle comprueba ID y `pedido.idTienda` antes
de devolver datos; no recorre páginas.

El listado admite solo `page`, `size` (1–100, interfaz 6) y `estado`. Rechaza
parámetros repetidos, propietario, cliente, tienda o campos desconocidos. Ordena
por fecha DESC, con el desempate por ID existente de NestJS. El BFF impone
`idTienda`; `OrdersReadService` y `OrdersRepository.searchVisible()` añaden además
el propietario autenticado en SQL, antes de paginar y contar. No se filtran filas
después para inventar un conteo. Si el backend devuelve un contrato o alcance
inconsistente, se rechaza toda la respuesta con error seguro.

Se incluyen tiendas propias ACTIVA e INACTIVA y los seis estados reales:
PENDIENTE, CONFIRMADO, PREPARANDO, EN_CAMINO, ENTREGADO y CANCELADO, presentados
como Pendiente, Confirmado, Preparando, En camino, Entregado y Cancelado. Cambiar
el filtro reinicia la página; existen carga, vacío, error y reintento de lectura.

Todas las respuestas y llamadas hacia NestJS usan `no-store`. Los IDs se validan
como enteros positivos de 32 bits. Las rutas de detalle/preparación rechazan
parámetros de consulta adicionales. PATCH exige Origin exactamente del mismo
origen y Content-Type JSON; un Origin ausente, `null` o externo no se acepta.
El único cuerpo admitido es el objeto vacío: estado, propietario, versión,
importes, arrays o null se rechazan con 400. No hay acceso directo a tablas
desde el código funcional de Next.js.

## Proyección y datos históricos

El resumen del listado contiene número, tienda, fecha, estado, total, cantidad de
líneas y unidades sumadas de los detalles disponibles. No devuelve dirección,
identificador del cliente ni el arreglo de detalles. La tienda se proyecta solo
como ID, nombre y estado.

El detalle añade dirección de entrega, subtotal del pedido, tarifa y los detalles
con ID de detalle/producto, cantidad, precio unitario histórico y subtotal.
No incluye ID de cliente/barrio, perfiles, relaciones internas, teléfono,
credenciales ni nombres de cliente/producto. Los productos se identifican por ID:
el DTO no contiene nombres históricos y no se consultan nombres actuales como
si fueran los del momento de la compra.

Los importes permanecen como cadenas decimales exactas. Se valida su formato y
se usa el formateador CRC que procesa la parte entera mediante BigInt y conserva
la fracción recibida, sin cálculos monetarios binarios. No se recalculan totales,
tarifa, precios ni subtotales del pedido. La fecha se muestra en America/Costa_Rica.
Las sumas de unidades usan enteros y se rechaza un conteo fuera del rango seguro.

## Preparación y concurrencia

«Comenzar preparación» aparece solo cuando el último estado confirmado es
CONFIRMADO. Abre una confirmación visual identificando el pedido; volver sin
preparar no envía ninguna escritura. Confirmar envía un único PATCH con `{}`,
deshabilita la acción y utiliza una referencia síncrona para bloquear doble envío.
Solo una respuesta 200 válida con PREPARANDO actualiza el estado visible.

La autorización y transición siguen a cargo de `OrderPreparationService`:
transacción PostgreSQL, repositorio del EntityManager, consulta por propietario
con bloqueo pesimista de la fila de pedido y transición de dominio. Solo se
actualiza `estado`; no se regraban detalles, precios, inventario o versiones de
productos. Dos preparaciones concurrentes se serializan: una obtiene 200 y la
otra 409. No se modifica esa implementación ni se simula su resultado en la
prueba de concurrencia.

El BFF verifica pertenencia antes del PATCH, pero no duplica la decisión de
transición leyendo el estado. Aunque una lectura vea CONFIRMADO, el dominio debe
volver a evaluarlo bajo bloqueo. Pedidos PENDIENTE, PREPARANDO, EN_CAMINO,
ENTREGADO o CANCELADO devuelven 409 si se fuerza la petición; la interfaz no
ofrece la acción en esos estados.

## Errores y recuperación de respuestas ambiguas

- 400: entrada inválida; 401: sesión inválida/vencida y eliminación de cookie;
  403: rol/origen no autorizado; 404: recurso no visible; 409: conflicto de
  transición; 500: error inesperado seguro; 502: fallo de red, timeout o contrato.
- No se reflejan mensajes SQL, stacks ni errores privados del backend. No se
  añaden logs de cuerpos, direcciones de entrega, JWT o cookies.
- Ante 409 se bloquea otra escritura y se ofrece «Consultar estado vigente».
  Solo el GET confirmado actualiza lo mostrado; no se repite PATCH automáticamente.
- Ante red/5xx se muestra «Último estado confirmado» y se advierte que la operación
  podría haberse completado. No se supone que siga CONFIRMADO ni se declara fracaso
  definitivo. Una consulta fallida mantiene bloqueado el reenvío.
- Si el GET confirma PREPARANDO u otro estado, desaparece la acción. Si devuelve
  CONFIRMADO, hace falta habilitar explícitamente una nueva confirmación y volver
  a confirmar. Consultar o habilitar por sí solo no envía PATCH.

No existe una clave de idempotencia distribuida ni un registro de solicitudes en
este frontend. La protección contra transición duplicada procede del dominio
bajo bloqueo. Un GET no garantiza que otra petición anterior haya terminado;
si se vuelve a confirmar, NestJS debe serializar y validar nuevamente. Navegar o
recargar no conserva el bloqueo de interfaz, y el estado real del backend continúa
siendo la autoridad. No se prometen efectos futuros de notificaciones o entregas.

## Pruebas locales

Chrome usa Next compilado, Nest real y PostgreSQL 16 Testcontainers, con cuentas,
tiendas, pedidos y direcciones exclusivamente sintéticos. La configuración fuerza
API_URL loopback; el helper backend no carga `.env` ni se conecta a Supabase/Atlas.
Las migraciones automáticas ocurren solo dentro de contenedores temporales.

| Validación                                                                | Resultado                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Unitarias frontend                                                        | 255/255, incluidas 34 nuevas comprobaciones.                                                |
| Nueva suite Chrome → Next → Nest → PostgreSQL                             | 28/28 en la ejecución final aislada.                                                        |
| Navegador completo frontend                                               | 197/197, incluye registro, roles, cliente, carrito, búsquedas, tiendas y productos.         |
| Unitarias backend                                                         | 686/686, 48 suites, Node.js 22.22.0.                                                        |
| Integración backend completa                                              | 796/796, 32 suites, Node.js 22.22.0. Incluye preparación, pedidos, rollback y concurrencia. |
| ESLint, TypeScript sin emisión ni incremental y build de ambos workspaces | Aprobados.                                                                                  |
| Prettier y git diff --check                                               | Verificados sobre los archivos de la fase.                                                  |

Frontend/Chrome ejecutados con Node.js 24.21.0. La integración backend y sus
unitarias utilizan Node.js 22.22.0. El CI de base aprobado no equivale a CI de
esta rama sin publicar; el CI frontend actual no incluye su navegador completo.

La suite nueva cubre roles, sesiones, propiedad, múltiples tiendas, históricos,
paginación, filtros, proyección, confirmación/cancelación, los cinco estados no
preparables, duplicados, concurrencia, respuesta perdida y recuperación mediante
GET. Retiene una fila PostgreSQL antes de lanzar dos PATCH y comprueba que ambos
esperan el bloqueo; al liberarlo obtiene exactamente 200/409. También compara
pedido, detalles, producto y versión para demostrar que solo cambió el estado.

Se probaron dos respuestas ambiguas después de guardar realmente: excepción
sintética de la capa HTTP después del commit del servicio y rechazo sintético de
fetch en Chrome después de recibir la respuesta real. En ambos casos se conserva
el último estado conocido, se consulta el vigente y no se envía un segundo PATCH.
Son escenarios de fallo controlados con restauración de wrappers, no cambios de
la aplicación ni fallos inducidos en producción.

La primera ejecución nueva registró 24/28: tres subpruebas fallaron y el contenedor
de pruebas también se marcó fallido. Las causas fueron una expectativa ordenada
incorrectamente (EN_CAMINO/ENTREGADO), la comparación del prototipo de una entidad
TypeORM con un objeto plano y un timeout consecuente al no llegar a la página de
paginación. Se corrigieron las aserciones y se hizo independiente esa navegación.
El primer ajuste no aplicó la corrección de orden y la segunda ejecución quedó en
26/28. Tras aplicar esa corrección concreta, la tercera aprobó 28/28 y el comando
normal completo aprobó 197/197. No se aumentaron timeouts ni agregaron reintentos.
Durante la validación, los logs se guardaron fuera de Git con prefijo
`/private/tmp/phase8-`. Esos archivos temporales ya no estaban disponibles en la
revisión de publicación; los resultados anteriores no se presentan como nuevas
ejecuciones ni como logs nuevamente inspeccionados.

Los 401 históricos de preparación de fixtures de Fase 7 y los incidentes previos
de socket/Chrome siguen sin causa demostrada; no se presentan como corregidos por
estas pruebas ni se atribuyen a cambios funcionales sin evidencia.

## Evidencias y ejecución

Se verificaron listado, detalle y confirmación en 320, 390, 768, 1280 y 1440 px sin
desbordamiento horizontal. Se generan seis PNG fuera de Git en
`/private/tmp/chorotega-phase8-order-evidence/`: `pedidos-320.png`,
`pedidos-1440.png`, `detalle-320.png`, `detalle-1440.png`, `confirmacion-320.png`
y `confirmacion-1440.png`. Contienen solo fixtures, nunca datos de clientes reales.
Las capturas deben adjuntarse manualmente al PR o regenerarse si ya no se
conservan; sus rutas temporales no son enlaces públicos ni evidencias persistentes.
Se revisaron visualmente las composiciones móvil y escritorio; son una adaptación
de la identidad de Mi negocio, no una réplica de un frame Figma no proporcionado.

```sh
# apps/frontend, backend ya instalado y Docker disponible para navegador
npm test
node --test test/browser/managed-orders.test.mjs
npm run test:browser
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
npm run build

# apps/backend, Node.js 22.22.0 y Docker local
npm test -- --runInBand
npm run test:integration
npm run lint
node_modules/.bin/tsc --noEmit --incremental false
npm run build
```

## Limitaciones y revisión

No hay actualización push/polling de pedidos: el listado se actualiza mediante
navegación, filtros, paginación o recarga; la revisión de una escritura consulta
explícitamente. No se conservan bloqueos de interfaz entre pestañas/recargas.
Los detalles históricos no contienen nombres ni fotos. No se implementan
cancelaciones, otras transiciones, asignaciones, entregas, pagos, notificaciones,
mensajería o edición de pedidos registrados.

No se modifican código backend, migraciones, dependencias, CI/CD, observabilidad,
configuración productiva, `.env`, `.gitignore` ni la autenticación global. No se
ejecutan E2E independientes ni Chrome MVC del backend como comandos separados en
esta fase; el alcance ejecutado se distingue en la tabla anterior.

La autorización posterior permite commit, push y PR para revisión. El merge y
cualquier despliegue productivo requieren otra autorización.
