# Propuesta de dominio — Chorotega E-Market

## 1. Descripción del negocio

Chorotega E-Market es una plataforma web tipo marketplace orientada a apoyar a emprendedores locales de Nicoya, Guanacaste.

El sistema permite a los emprendedores registrar sus tiendas y ofrecer productos dentro de la plataforma. Los clientes pueden consultar las tiendas y productos disponibles, realizar pedidos y consultar el estado de sus compras.

La plataforma también contempla la participación de repartidores, quienes se encargan de realizar las entregas de los pedidos dentro de Nicoya.

El objetivo principal es facilitar la comercialización digital de productos de emprendedores locales y organizar en un mismo sistema la gestión de tiendas, productos, pedidos, inventario y entregas.

----------------------------------------------------------------------

## 2. Actores y permisos

### 2.1 Administrador

Es el encargado de supervisar y administrar el funcionamiento general de la plataforma.

**Permisos principales:**

* Gestionar usuarios.
* Administrar categorías.
* Supervisar tiendas y productos.
* Consultar pedidos.
* Consultar entregas.
* Gestionar los barrios disponibles para entrega.
* Gestionar las tarifas de envío asociadas a cada barrio.
* Activar o desactivar información cuando corresponda.

### 2.2 Emprendedor

Es el usuario que administra una tienda y ofrece sus productos dentro de la plataforma.

**Permisos principales:**

* Crear y administrar su tienda.
* Registrar productos.
* Modificar la información de sus productos.
* Gestionar el inventario disponible.
* Activar o desactivar productos.
* Consultar los pedidos relacionados con su tienda.
* Preparar los pedidos correspondientes.
* Consultar el estado de las entregas.

### 2.3 Cliente

Es el usuario que consulta productos y realiza pedidos dentro de la plataforma.

**Permisos principales:**

* Consultar tiendas.
* Consultar productos.
* Seleccionar productos para realizar un pedido.
* Confirmar pedidos.
* Consultar el estado de sus pedidos.
* Cancelar un pedido cuando las reglas del negocio lo permitan.
* Seleccionar el barrio y registrar la dirección de entrega.
* Consultar la información relacionada con la entrega.

### 2.4 Repartidor

Es el usuario encargado de realizar las entregas de los pedidos.

**Permisos principales:**

* Consultar las entregas que le han sido asignadas.
* Consultar la dirección correspondiente a una entrega.
* Actualizar el estado de una entrega.
* Indicar cuando inicia el traslado de un pedido.
* Marcar una entrega como completada.

----------------------------------------------------------------------

# 3. Procesos de negocio

## 3.1 Proceso 1: Crear y confirmar un pedido

### Descripción

El proceso inicia cuando un cliente selecciona uno o varios productos y decide realizar un pedido.

Antes de confirmar la compra, el sistema debe verificar que los productos y las tiendas estén activos, comprobar que exista inventario suficiente, obtener los precios actuales de los productos, calcular los montos del pedido y determinar la tarifa de envío correspondiente al barrio seleccionado por el cliente.

Cuando el pedido se confirma, se registran el pedido y sus detalles, se guardan los precios utilizados en la compra y se descuentan las cantidades correspondientes del inventario.

La confirmación debe realizarse como una sola operación. Si alguna validación falla o alguno de los cambios no puede realizarse, el pedido no debe confirmarse y ninguno de los cambios relacionados debe quedar aplicado.

### Flujo del proceso

1. El cliente selecciona uno o varios productos.
2. El cliente indica la cantidad que desea comprar de cada producto.
3. El cliente selecciona el barrio de Nicoya donde desea recibir el pedido.
4. El cliente registra o selecciona la dirección específica de entrega.
5. El sistema verifica que los productos seleccionados existan.
6. El sistema verifica que los productos estén activos.
7. El sistema verifica que las tiendas asociadas a los productos estén activas.
8. El sistema valida que las cantidades solicitadas sean mayores que cero.
9. El sistema comprueba que exista inventario suficiente para cada producto.
10. El sistema obtiene el precio actual de cada producto.
11. El precio actual se guarda como `precio_unitario` en cada `DETALLE_PEDIDO`.
12. El sistema calcula el subtotal correspondiente a cada detalle.
13. El sistema calcula el subtotal general del pedido.
14. El sistema verifica que el barrio seleccionado esté disponible para entregas.
15. El sistema obtiene la tarifa de envío correspondiente al barrio.
16. El sistema calcula el total del pedido.
17. El sistema registra el pedido.
18. El sistema registra los detalles del pedido.
19. El sistema descuenta del inventario las cantidades compradas.
20. El sistema confirma el pedido.
21. Si alguna de las operaciones falla, se revierte todo el proceso.

### Reglas de negocio

* Un pedido debe contener al menos un producto.
* La cantidad solicitada de cada producto debe ser mayor que cero.
* Solo pueden comprarse productos activos.
* Solo pueden comprarse productos pertenecientes a tiendas activas.
* Un pedido no puede confirmarse si la cantidad solicitada de algún producto supera su inventario disponible.
* El inventario se descuenta en el momento en que el pedido se confirma.
* Si dos clientes intentan comprar la última unidad disponible de un producto, solamente el pedido que consiga confirmar primero la operación podrá adquirirla.
* La creación del pedido, el registro de sus detalles y la actualización del inventario deben realizarse completamente o no realizarse.
* El precio actual del producto se guarda en `DETALLE_PEDIDO.precio_unitario` al confirmar el pedido.
* Si el precio del producto cambia posteriormente, el precio registrado en un pedido ya confirmado no se modifica.
* Las entregas de Chorotega E-Market se realizan únicamente dentro de Nicoya.
* El barrio seleccionado debe encontrarse registrado y habilitado para entregas.
* Cada barrio tiene asociada una tarifa de envío.
* La tarifa correspondiente al barrio se guarda en `PEDIDO.tarifa_envio` cuando se confirma el pedido.
* Si posteriormente cambia la tarifa de un barrio, los pedidos confirmados anteriormente mantienen la tarifa que tenían en el momento de su confirmación.
* Un pedido puede cancelarse únicamente mientras las reglas relacionadas con su estado y la entrega lo permitan.
* Un pedido que ya se encuentra en proceso de entrega no puede ser cancelado directamente por el cliente.

### Cálculos

#### Subtotal por producto

El subtotal de cada detalle se calcula mediante:

`subtotal_linea = cantidad × precio_unitario`

#### Subtotal del pedido

El subtotal general corresponde a la suma de todos los detalles:

`subtotal = Σ(cantidad × precio_unitario)`

#### Tarifa de envío

La tarifa de envío depende del barrio de Nicoya seleccionado para realizar la entrega:

`tarifa_envio = tarifa correspondiente al barrio de entrega`

#### Total del pedido

El total se calcula mediante:

`total = subtotal + tarifa_envio`

El precio unitario de los productos, el subtotal, la tarifa de envío y el total quedan definidos cuando el pedido se confirma.

Los cambios posteriores en los precios de los productos o en las tarifas de los barrios no modifican los valores de pedidos que ya fueron confirmados.

### Validaciones

Antes de confirmar un pedido debe cumplirse lo siguiente:

* El cliente debe estar autenticado.
* El pedido debe contener al menos un producto.
* Todos los productos deben existir.
* Todos los productos deben estar activos.
* Las tiendas relacionadas con los productos deben estar activas.
* La cantidad solicitada de cada producto debe ser mayor que cero.
* Debe existir inventario suficiente para cada producto.
* El precio de cada producto debe ser mayor que cero.
* El barrio seleccionado debe existir.
* El barrio debe estar habilitado para entregas.
* El barrio debe tener una tarifa de envío válida.
* La dirección específica de entrega debe estar registrada.
* La información necesaria para confirmar el pedido debe estar completa.

### Estados del pedido

Los estados permitidos son:

* `PENDIENTE`
* `CONFIRMADO`
* `PREPARANDO`
* `EN_CAMINO`
* `ENTREGADO`
* `CANCELADO`

### Transiciones de estado permitidas

Flujo normal:

`PENDIENTE → CONFIRMADO → PREPARANDO → EN_CAMINO → ENTREGADO`

Cancelaciones permitidas:

`PENDIENTE → CANCELADO`

`CONFIRMADO → CANCELADO`, siempre que todavía no exista una entrega asignada.

Una vez que el pedido se encuentra `EN_CAMINO`, el cliente no puede cancelarlo.

---

## 3.2 Proceso 2: Asignar repartidor y registrar entrega

### Descripción

Este proceso inicia cuando un pedido confirmado ha sido preparado y se encuentra listo para ser entregado.

El sistema debe verificar que el pedido se encuentre en un estado válido, que tenga una dirección de entrega dentro de un barrio habilitado de Nicoya y que exista un repartidor disponible.

Una vez seleccionado el repartidor, se registra la entrega asociada al pedido y el repartidor pasa a estar ocupado. Posteriormente, los estados de la entrega y del pedido se actualizan hasta completar la entrega al cliente.

### Flujo del proceso

1. El sistema verifica que el pedido exista.
2. El sistema verifica que el pedido esté preparado y listo para ser entregado.
3. Se comprueba que el pedido todavía no tenga una entrega activa.
4. Se verifica que exista una dirección de entrega.
5. Se verifica que la dirección corresponda a un barrio habilitado de Nicoya.
6. Se busca un repartidor disponible.
7. Se verifica que el repartidor seleccionado esté activo.
8. Se verifica que el repartidor se encuentre disponible.
9. Se crea una entrega asociada al pedido.
10. La entrega queda en estado `ASIGNADA`.
11. El repartidor cambia su disponibilidad a `OCUPADO`.
12. Cuando el repartidor inicia el traslado, la entrega cambia a `EN_CAMINO`.
13. El pedido cambia a `EN_CAMINO`.
14. Cuando el pedido es entregado al cliente, la entrega cambia a `ENTREGADA`.
15. El pedido cambia a `ENTREGADO`.
16. El repartidor vuelve a estar `DISPONIBLE`.

### Reglas de negocio

* Solo puede asignarse una entrega a un pedido preparado y listo para entregar.
* Un pedido no puede tener más de una entrega activa al mismo tiempo.
* Solo pueden asignarse repartidores activos.
* Solo pueden asignarse repartidores cuya disponibilidad sea `DISPONIBLE`.
* Un repartidor no puede recibir una nueva entrega mientras se encuentre `OCUPADO`.
* Cuando se asigna una entrega, la disponibilidad del repartidor cambia a `OCUPADO`.
* Cuando la entrega finaliza correctamente, el repartidor vuelve a estar `DISPONIBLE`.
* Si una entrega se cancela antes de iniciar el recorrido, el repartidor vuelve a estar `DISPONIBLE`.
* Una entrega no puede cambiar directamente de `ASIGNADA` a `ENTREGADA`.
* Una entrega debe encontrarse en `EN_CAMINO` antes de poder marcarse como `ENTREGADA`.
* Cuando la entrega cambia a `EN_CAMINO`, el pedido también debe cambiar a `EN_CAMINO`.
* Cuando la entrega cambia a `ENTREGADA`, el pedido debe cambiar a `ENTREGADO`.
* Las entregas solamente pueden realizarse dentro de los barrios de Nicoya habilitados en el sistema.

### Cálculos

Este proceso no realiza cálculos adicionales relacionados con el costo del pedido.

La tarifa de envío ya fue calculada y almacenada cuando se confirmó el pedido, según el barrio de entrega seleccionado por el cliente.

Por lo tanto, la asignación de un repartidor no modifica:

* El subtotal.
* La tarifa de envío.
* El total del pedido.
* Los precios unitarios registrados en los detalles.

### Validaciones

Antes de asignar un repartidor debe cumplirse lo siguiente:

* El pedido debe existir.
* El pedido debe estar preparado y listo para entrega.
* El pedido no debe encontrarse cancelado.
* El pedido no debe encontrarse entregado.
* El pedido no debe tener otra entrega activa.
* La dirección de entrega debe existir.
* El barrio de entrega debe existir y estar habilitado.
* Debe existir al menos un repartidor disponible.
* El repartidor seleccionado debe estar activo.
* El repartidor debe encontrarse en estado `DISPONIBLE`.
* La información necesaria para realizar la entrega debe estar completa.

### Disponibilidad del repartidor

Los valores permitidos son:

* `DISPONIBLE`
* `OCUPADO`
* `INACTIVO`

El flujo normal es:

`DISPONIBLE → OCUPADO → DISPONIBLE`

Un repartidor `INACTIVO` no puede recibir entregas.

### Estados de la entrega

Los estados permitidos son:

* `ASIGNADA`
* `EN_CAMINO`
* `ENTREGADA`
* `CANCELADA`

### Transiciones de estado permitidas

Flujo normal:

`ASIGNADA → EN_CAMINO → ENTREGADA`

Cancelación:

`ASIGNADA → CANCELADA`

Si una entrega se cancela antes de iniciar el recorrido, el repartidor asignado vuelve al estado `DISPONIBLE`.

----------------------------------------------------------------------

# 4. Alcance

## 4.1 Dentro del alcance

Durante el desarrollo de Chorotega E-Market se contempla:

* Gestión de usuarios con diferentes roles.
* Gestión de emprendedores.
* Gestión de tiendas.
* Gestión de categorías.
* Registro y administración de productos.
* Gestión del inventario disponible de los productos.
* Consulta de tiendas y productos.
* Creación y confirmación de pedidos.
* Registro de los productos incluidos en cada pedido.
* Conservación del precio utilizado al momento de realizar la compra.
* Validación de inventario antes de confirmar pedidos.
* Actualización del inventario al confirmar pedidos.
* Cálculo del subtotal del pedido.
* Gestión de barrios de Nicoya disponibles para entrega.
* Gestión de tarifas de envío por barrio.
* Cálculo de la tarifa de envío.
* Cálculo del total del pedido.
* Gestión de los estados de los pedidos.
* Gestión de repartidores.
* Gestión de la disponibilidad de los repartidores.
* Asignación de repartidores a entregas.
* Registro y actualización de las entregas.
* Entregas únicamente dentro de Nicoya.

## 4.2 Fuera del alcance

No se contempla implementar:

* Pagos reales mediante tarjetas.
* Pagos mediante SINPE Móvil.
* Facturación electrónica ante el Ministerio de Hacienda.
* Aplicación móvil nativa.
* Seguimiento GPS de los repartidores en tiempo real.
* Optimización automática de rutas de entrega.
* Integración con empresas externas de reparto.
* Entregas fuera de Nicoya.
* Comercio internacional.
* Analítica avanzada de ventas.
