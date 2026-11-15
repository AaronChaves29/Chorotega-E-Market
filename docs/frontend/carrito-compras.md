# Implementación 5: carrito de compras del cliente

## Base y alcance

Rama `feature/carrito-compras-cliente`, desde `upstream/develop`
`67a79b0ea7bc66af24c3ae4a559caa08d78a9818`.
El PR #139 está integrado y el [CI posterior al merge aprobó](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/43682887078).
El trabajo de este bloque permanece local, sin staging, commit ni publicación.

Referencia visual: PNG original «Chorotega 2.0 · Carrito» proporcionado por el usuario,
correspondiente al [frame 2023:53695](https://www.figma.com/design/Ogxj2qKjAbnS2jf94si9Os/Chorotega-E-Market?node-id=2023-53695).
No se consultó Figma MCP, no se utilizó la captura como asset y no se descargaron imágenes genéricas.

## Rutas y flujo

1. CLIENTE entra a una tienda y elige cantidades enteras entre 1 y las existencias informadas.
2. **Agregar al carrito** acumula unidades de un producto o añade otro de la misma tienda.
   El encabezado muestra la suma de unidades y acceso a `/carrito`; **Mis pedidos** sigue en el dropdown.
3. Si el carrito pertenece a otra tienda, se requiere elegir explícitamente
   **Conservar carrito** o **Reemplazar carrito y agregar**. No se mezcla ni se borra silenciosamente.
4. `/carrito` muestra productos, cantidades editables, eliminación, subtotal estimado,
   envío pendiente y acceso a `/carrito/confirmar`. Permite volver a `/mercado`.
5. La confirmación conserva los productos seleccionados; solicita barrio y dirección,
   sin volver a elegir tienda o productos. Antes de enviar vuelve a consultar su disponibilidad.
6. El servidor existente crea y confirma el pedido dentro de su transacción, calcula
   el importe definitivo y descuenta existencias. Solo una respuesta 201 coherente vacía el carrito.

Ambas rutas son privadas y exclusivas de CLIENTE. Usuarios sin sesión siguen el
flujo de recuperación existente; ADMIN, EMPRENDEDOR y REPARTIDOR se redirigen a `/cuenta`.
Los demás roles conservan las lecturas del mercado, sin controles para agregar o comprar.

## Componentes y reutilización

- `CartProvider`: estado compartido entre encabezado, tarjetas y carrito, restaurado al navegar.
- `AddToCart`, `CartLink`, `CartView`: cantidades, decisión de tienda, resumen y confirmación.
- `lib/cart.ts`: proyección y validación del almacenamiento, invariantes de una tienda,
  límite de 50 productos distintos, conciliación explícita y cálculo en centavos mediante BigInt.
- `lib/cart-review.ts`: valida la respuesta de disponibilidad y detecta sesiones rechazadas.
- `lib/order-submission.ts`: único envío sin reintentos, compartido con `CreateOrderForm`.
- `DeliveryFields` y `useNeighborhoods`: mismos campos, barrios activos y validaciones
  para creación manual y compra desde carrito. Se conservan IDs y el diálogo manual de éxito.

La selección manual de `/pedidos/nuevo`, sus listas paginadas y contratos continúan disponibles.
El cambio de `CreateOrderForm` extrae entrega/envío comunes, usa centavos exactos y bloquea
el reenvío en esa vista ante un resultado ambiguo. El formateo Prettier también normaliza su indentación.
No se modifica backend, dependencias, entidades, migraciones, inventario ni reglas de negocio.

## Aislamiento por identidad y sesión

`sessionStorage["chorotega.cart.v1"]` contiene exclusivamente un scope opaco,
ID/nombre de tienda, ID/nombre/precio estimado/stock de productos, cantidades y fase
de envío. No contiene correo, dirección de entrega, JWT, contraseña, cookie ni relaciones.
El ID del pedido confirmado puede conservarse para mostrar el resultado tras recargar.

El login exitoso añade un nonce aleatorio en `chorotega_cart_session`:
HttpOnly, SameSite=Lax, Path=/, Secure en producción y duración del login.
Se rota incluso si dos logins reciben el mismo JWT. El logout elimina esa cookie y
el botón limpia el almacenamiento local antes de navegar al login.
Sesiones anteriores al carrito reciben el nonce al consultar su sesión del carrito.
No se altera la cookie JWT, su contenido, los permisos ni el contrato JSON de login.

`GET /api/cart/session` verifica identidad vigente con NestJS y exige CLIENTE.
Devuelve un hash SHA-256 de identidad, nonce y token como namespace de almacenamiento,
nunca sus valores originales. Ese hash **no es una credencial** ni permite autenticar peticiones.
Una identidad o sesión diferente produce otro namespace y descarta el carrito anterior.
La sesión se revalida al montar, volver a una pestaña y antes de confirmar; la vista
oculta su estado mientras comprueba identidad. Se mantiene `SessionBoundary`.

El envío del carrito añade `X-Cart-Scope` al intermediario existente `/api/orders`.
Ese intermediario verifica identidad CLIENTE y que el scope corresponda a las cookies
de esa misma petición antes de llamar a NestJS: 401 sin sesión, 403 por rol y 409
si la sesión del carrito cambió. El encabezado no sustituye el JWT ni se reenvía al backend.
La creación manual no necesita ese encabezado y conserva su contrato anterior.

Los datos de almacenamiento se consideran modificables por el navegador: se validan
tipos, IDs PostgreSQL, cantidades, stock informado, dinero decimal, duplicados, tamaño,
estado y tienda única; solo se retienen campos explícitos. JSON inválido o scope
distinto no se restaura. Si sessionStorage no funciona, no se habilita la compra.
React escapa los textos y no se inserta HTML suministrado por productos/tiendas.

## Revisión de disponibilidad y dinero

`POST /api/cart/review` es un intermediario **de solo lectura**. Acepta únicamente
`idTienda` e `items` con `idProducto`/`cantidad`; rechaza campos adicionales,
duplicados, tipos inválidos y más de 50 productos. Verifica CLIENTE y tienda activa;
consulta los endpoints existentes de detalle de producto en lotes de hasta cinco.

Devuelve una proyección segura. Un producto inexistente, inactivo o ajeno a la tienda
se marca no disponible; errores desconocidos no se presentan como inexistencia ni
se exponen SQL o mensajes internos. Las respuestas usan `Cache-Control: no-store`.
No se envían precios o IDs de cliente como autoridad para crear pedidos.

Cada cambio de precio o stock detectado se muestra antes de continuar. Se bloquea
la acción hasta que el cliente aplique los cambios indicados: precio nuevo, ajuste
de cantidad al stock y retirada de productos no disponibles. No se aplica en silencio.
Una tienda inactiva bloquea la confirmación. La revisión se repite justo antes del POST;
un cambio detectado en ese momento no envía ningún pedido y conserva barrio/dirección.

Los cálculos usan BigInt en centavos, sin multiplicar precios con Number. Se conservan
los dos decimales de PostgreSQL, incluyendo la estimación del envío. Los importes
mostrados son estimados; el backend mantiene la autoridad final.

## Doble envío y resultados ambiguos

Una exclusión síncrona mediante ref impide dos envíos desde la vista con doble clic.
Antes del POST se persiste la fase `submitting`; si no puede guardarse, no se envía.
Un 201 debe contener un pedido CONFIRMADO, IDs/cantidades/dirección coherentes,
líneas con importes exactos y totales consistentes para considerar inequívoca la creación.
Solo entonces se vacían los productos y se conserva el ID confirmado.

Errores de red, respuestas 5xx/408/429, JSON inválido o éxito contradictorio se
consideran resultado incierto. Se conserva el carrito en fase `uncertain`, bloqueado,
y se indica revisar Mis pedidos. Recargar un `submitting` también lo convierte en
incierto. No se reenvía automáticamente ni se crea un segundo pedido para averiguar el resultado.
Los rechazos conocidos 4xx conservan el carrito editable para revisar la solicitud.

Esta protección es por pestaña/sesión, **no idempotencia distribuida**. Borrar el
almacenamiento, duplicar una pestaña, usar otro navegador o iniciar una nueva sesión
no comparte la exclusión. El backend actual no ofrece una clave de idempotencia;
garantizar una sola creación entre clientes requeriría otro bloque aprobado.
Un resultado incierto no se desbloquea automáticamente: se debe revisar el pedido
existente antes de decidir cualquier nueva compra, sin asumir que el error significa rollback.

Procedimiento manual para resolver un carrito bloqueado:

1. Recuperar la conexión y abrir **Revisar mis pedidos**. Revisar también las páginas
   del listado y los datos del pedido; no basta con que no aparezca inmediatamente.
2. Si se identifica la compra creada, conservar ese pedido y no repetirla.
3. Si el resultado sigue siendo incierto, mantener el bloqueo y pedir al responsable
   técnico que confirme el resultado antes de autorizar un nuevo intento. No borrar
   sessionStorage, duplicar la pestaña o volver a enviar para comprobar si se guardó.
4. Una vez verificado el resultado, **Cerrar sesión** invalida el carrito de esa sesión.
   Al volver a iniciar sesión se habilita un carrito nuevo; reconstruir una compra
   fallida requiere agregar nuevamente los productos y revisar sus condiciones actuales.
   Si la compra ya existía, ese carrito nuevo corresponde únicamente a una compra posterior.

Este procedimiento no ofrece reanudación automática del carrito ni demuestra por sí
solo la ausencia de un pedido. La reconciliación fiable y la recuperación sin cerrar
sesión quedan pendientes de un contrato de idempotencia aprobado para el backend.

## Diseño y diferencias respecto al PNG

Se mantienen fondo crema, verde principal y vino, tipografías locales, emblema,
tarjetas blancas redondeadas, controles de cantidad, resumen lateral y franja de comunidad.
Se reutilizan SVG locales del catálogo, bolsa y brote, sin URLs temporales.

- No se asignan fotografías de cerámica a productos reales: el contrato carece de imágenes.
  Se muestran alternativas identificadas como **Sin fotografía del producto**.
- Nombres, cantidades e importes proceden de los productos seleccionados; no de las dos piezas de muestra.
- **Continuar al pedido** sustituye «Ir a pagar»: no existe procesamiento de pagos en este bloque.
  No se presentan SINPE, efectivo ni descuentos como capacidades implementadas.
- No se incorporan favoritos o notificaciones. Mis pedidos permanece en el dropdown aprobado.
- La dirección se ingresa en la confirmación, donde también se calcula el envío por barrio.
- Móvil/tablet adaptan la composición de escritorio sin afirmar identidad píxel a píxel.

## Verificaciones locales — 15 de noviembre de 2026

Entorno: Node.js 24.21.0, Chrome y PostgreSQL 16 temporal mediante Testcontainers.
Los procesos Next.js usan API_URL de loopback explícita y los módulos NestJS de prueba
usan la base temporal sin cargar `.env`. No se consultaron Supabase, Atlas ni servicios reales.

| Comprobación                     | Resultado                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias frontend               | 105/105: 87 anteriores y 18 nuevas de modelo, dinero, persistencia, contrato BFF, rotación de nonce y envío seguro.                |
| Navegador frontend completo      | 90/90: 19 escenarios nuevos de carrito y una prueba padre, más 70 pruebas de regresión.                                            |
| Unitarias backend                | 630/630, 47 suites.                                                                                                                |
| Integración seleccionada backend | 173/173, 4 suites: Orders HTTP, Orders transaccional, concurrencia optimista e inventario, y seguridad de escrituras del catálogo. |
| ESLint y TypeScript              | Backend y frontend aprobados; TypeScript sin emisión ni incremental.                                                               |
| Builds                           | NestJS y Next.js estándar con Turbopack aprobados.                                                                                 |
| Formato y Git                    | Prettier, enlaces locales y git diff --check aprobados.                                                                            |
| Responsive                       | 320, 390, 768, 1280 y 1440 px; sin desbordamiento horizontal ni imágenes rotas.                                                    |

La prueba real confirmó un solo pedido por doble clic, total **521.16** y descuento
exacto de existencias: primer producto **10 → 8**, segundo **5 → 2**. Otro escenario
interrumpe únicamente la respuesta después de que el pedido se guardó: la base tiene
el segundo pedido y el carrito permanece bloqueado, incluso tras recargar, sin crear
un tercero. No se simulan esos resultados con mocks de persistencia.

Se verificaron vacío, agregar/acumular, eliminar, cambiar cantidades, reemplazo
explícito de tienda, recarga, precios y stock modificados, desactivación, errores
seguros/reintento, roles, sesión inválida, logout/cambio de cuenta y nuevo login de la
misma identidad. Se conserva la regresión de creación manual, registros de los tres
roles, búsqueda en vivo, landing, sesiones y navegación. Los fallos inyectados se
limitan a procesos de pruebas; no se desactivan guards.

La primera regresión de navegador encontró cinco expectativas históricas de enlaces:
no incluían la nueva ruta `/carrito`. Se añadió únicamente esa ruta a la lista
permitida, conservando las comprobaciones de recursos, columnas y desbordamiento.
La ejecución final completa aprobó 90/90. Durante la compilación inicial, el target
TypeScript existente rechazó literales BigInt; se utiliza el constructor BigInt sin
cambiar tsconfig ni perder precisión. Se regeneraron los tipos de rutas de Next.js
para incorporar el layout nuevo sin conflicto con los tipos generados del servidor de desarrollo.

No se ejecutaron toda la integración independiente del backend, sus E2E ni Chrome MVC.
Los resultados remotos enlazados al inicio pertenecen exclusivamente a la base;
esta rama todavía no tiene resultados de CI ni está desplegada.

Para reproducir, desde `apps/frontend`, con dependencias de ambos paquetes, Docker y Chrome:

```bash
npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
npm run test:browser
```

Solo el flujo nuevo de navegador, después del build:

```bash
node --test test/browser/cart.test.mjs
```

Desde `apps/backend`:

```bash
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
npm test -- --runInBand
npm run test:integration -- --testPathPatterns='orders.integration-spec|product-optimistic-concurrency.integration-spec|catalog-write-security.integration-spec'
```

Las capturas con fixtures se guardan en `chorotega-cart-evidence/carrito-{ancho}.png`
dentro del directorio temporal del sistema, para 320, 390, 768, 1280 y 1440 px.
Chrome, Next.js y los contenedores creados por las pruebas se cierran al finalizar.

## Límites pendientes

- Persistencia de una sola pestaña; no hay carrito en servidor, sincronización entre
  dispositivos/pestañas ni recuperación tras cerrar la sesión. El navegador puede
  restaurar una pestaña cerrada mientras la sesión siga vigente.
- Máximo 50 productos distintos; no se reserva stock mientras se explora.
- Existe una ventana entre la última revisión y la transacción: otro actor puede
  cambiar precios o stock. El backend valida las reglas e inventario con sus bloqueos;
  garantizar aceptación del precio revisado durante esa ventana requeriría un nuevo
  contrato condicional aprobado. No se afirma que esta interfaz elimine esa carrera.
- No hay reconciliación automática de pedidos con resultado incierto ni idempotencia
  entre procesos. La creación manual sigue siendo una operación independiente.
- No se implementan pago, imágenes de catálogo, favoritos, notificaciones o redes sociales.
- Node.js 22.22.0 no estaba instalado localmente; no se atribuyen pruebas a esa versión.
