# Documento técnico — Laboratorio 2

## 1. Persistencia del sistema

Chorotega E-Market utiliza PostgreSQL y MongoDB para almacenar diferentes tipos de información de acuerdo con las necesidades del sistema.

PostgreSQL se utiliza como base de datos principal para la información estructurada y transaccional del marketplace. MongoDB se utiliza para almacenar la bitácora de eventos asociados a los pedidos.

Esta separación permite utilizar cada base de datos según las características de la información que administra.

---

## 2. Modelo relacional en PostgreSQL

El modelo relacional de Chorotega E-Market está compuesto por nueve tablas:

- `usuario`
- `tienda`
- `categoria`
- `producto`
- `barrio`
- `pedido`
- `detalle_pedido`
- `repartidor`
- `entrega`

Las relaciones entre estas tablas se controlan mediante llaves primarias y foráneas.

También se incorporaron restricciones como `NOT NULL`, `UNIQUE` y `CHECK` para proteger la integridad de la información almacenada.

Entre las principales reglas implementadas directamente en la base de datos se encuentran:

- El precio de un producto debe ser mayor que cero.
- La cantidad disponible de un producto no puede ser negativa.
- La cantidad solicitada en un detalle de pedido debe ser mayor que cero.
- El precio unitario almacenado en un detalle de pedido debe ser mayor que cero.
- El subtotal de un detalle corresponde a `cantidad × precio_unitario`.
- El subtotal, la tarifa de envío y el total de un pedido no pueden ser negativos.
- El total de un pedido corresponde a `subtotal + tarifa_envio`.
- Los estados de usuarios, tiendas, categorías, productos, pedidos, repartidores y entregas se encuentran limitados a los valores definidos para cada entidad.
- La tarifa de envío correspondiente a un barrio no puede ser negativa.

El modelo permite mantener la integridad de los datos incluso antes de aplicar las reglas adicionales correspondientes a la capa de servicios del backend.

---

## 3. Decisiones principales del modelo relacional

### Usuarios y roles

La tabla `usuario` almacena la información general de las personas registradas en el sistema.

Los roles permitidos son:

- `ADMIN`
- `CLIENTE`
- `EMPRENDEDOR`
- `REPARTIDOR`

El campo `auth_id` permite relacionar al usuario almacenado en PostgreSQL con el sistema de autenticación.

### Tiendas y emprendedores

Cada tienda pertenece a un emprendedor mediante la relación establecida con `id_emprendedor`.

Un emprendedor puede administrar varias tiendas, mientras que cada tienda pertenece a un único emprendedor.

### Productos

Cada producto pertenece a una tienda y a una categoría.

Además de la información descriptiva, se almacena:

- Precio.
- Cantidad disponible.
- Estado.
- Fecha de publicación.

La cantidad disponible no puede ser negativa y el precio debe ser mayor que cero.

### Barrios

La tabla `barrio` permite representar las zonas de entrega dentro de Nicoya.

Cada barrio tiene asociada una tarifa de envío.

Esto permite que el costo de entrega de un pedido dependa del barrio seleccionado por el cliente.

### Pedidos

Cada pedido se encuentra relacionado con:

- Un cliente.
- Una tienda.
- Un barrio.

El pedido almacena el subtotal, la tarifa de envío y el total.

La base de datos valida que:

```text
total = subtotal + tarifa_envio
```

También se almacena la dirección específica de entrega y el estado actual del pedido.

### Detalle de pedido

La tabla `detalle_pedido` permite representar los productos incluidos dentro de un pedido.

Para cada producto se almacena:

- Cantidad.
- Precio unitario.
- Subtotal.

El precio unitario queda almacenado en el detalle para conservar el precio utilizado al momento de realizar el pedido, aunque posteriormente cambie el precio actual del producto.

La base de datos valida que:

```text
subtotal = cantidad × precio_unitario
```

### Repartidores y entregas

La tabla `repartidor` complementa la información del usuario que posee el rol correspondiente.

Permite registrar:

- Medio de transporte.
- Disponibilidad.

La tabla `entrega` relaciona un pedido con el repartidor encargado de realizar la entrega y permite registrar el estado y las fechas correspondientes al proceso.

---

## 4. Índices

Se agregaron índices sobre columnas utilizadas frecuentemente para relacionar y consultar información.

Los índices implementados permiten facilitar búsquedas como:

- Tiendas pertenecientes a un emprendedor.
- Productos pertenecientes a una tienda.
- Productos pertenecientes a una categoría.
- Pedidos realizados por un cliente.
- Pedidos pertenecientes a una tienda.
- Pedidos según el barrio de entrega.
- Detalles asociados a un producto.
- Entregas asignadas a un repartidor.

Los índices definidos son:

```text
idx_tienda_emprendedor
idx_producto_tienda
idx_producto_categoria
idx_pedido_cliente
idx_pedido_tienda
idx_pedido_barrio
idx_detalle_producto
idx_entrega_repartidor
```

Estos índices buscan facilitar las consultas realizadas sobre columnas que participan frecuentemente en relaciones y filtros del sistema.

---

## 5. Migración de PostgreSQL

El esquema de PostgreSQL se encuentra versionado mediante una migración inicial ubicada en:

```text
database/postgres/migrations/V1__create_initial_schema.sql
```

La migración contiene la creación de las nueve tablas del sistema junto con:

- Llaves primarias.
- Llaves foráneas.
- Restricciones `NOT NULL`.
- Restricciones `UNIQUE`.
- Restricciones `CHECK`.
- Índices.

Esto permite reconstruir el esquema de PostgreSQL desde una base de datos vacía de manera reproducible.

La migración se ejecuta automáticamente durante la inicialización del contenedor de PostgreSQL configurado mediante Docker Compose.

---

## 6. Datos seed de PostgreSQL

Los datos iniciales de PostgreSQL se encuentran definidos en:

```text
database/postgres/seeds/V1__seed_initial_data.sql
```

Estos datos permiten disponer de información inicial para verificar el funcionamiento del modelo relacional y sus relaciones.

Los seeds se ejecutan durante la inicialización del contenedor de PostgreSQL después de la creación del esquema.

Esto permite que al construir el entorno desde cero se disponga automáticamente de datos con los cuales comprobar la base de datos.

---

# 7. Subdominio documental en MongoDB

## 7.1 Selección del subdominio

Para la parte documental del sistema Chorotega E-Market se seleccionó la **bitácora de pedidos**, almacenada en MongoDB mediante la colección `bitacora_pedidos`.

Esta colección permite registrar los eventos importantes que ocurren durante el ciclo de vida de un pedido, por ejemplo:

- Creación del pedido.
- Confirmación del pedido.
- Actualización del inventario.
- Inicio de la preparación.
- Asignación de un repartidor.
- Cambios posteriores relacionados con la entrega.

La información principal y transaccional del pedido permanece almacenada en PostgreSQL.

MongoDB se utiliza para conservar el historial de eventos asociados al pedido.

---

## 7.2 Estructura del documento

Cada documento de la colección `bitacora_pedidos` representa la bitácora correspondiente a un pedido.

La estructura utilizada es similar a la siguiente:

```javascript
{
  pedidoId: 1,
  eventos: [
    {
      tipo: "PEDIDO_CREADO",
      fecha: ISODate("2026-08-21T14:00:00Z"),
      detalle: "El cliente creó el pedido"
    },
    {
      tipo: "PEDIDO_CONFIRMADO",
      fecha: ISODate("2026-08-21T14:05:00Z"),
      detalle: "El pedido fue confirmado correctamente"
    }
  ]
}
```

El campo `pedidoId` permite identificar el pedido relacionado que se encuentra almacenado en PostgreSQL.

El arreglo `eventos` contiene los acontecimientos registrados durante el ciclo de vida del pedido.

Cada evento almacena:

- Tipo de evento.
- Fecha en que ocurrió.
- Descripción del evento.

---

## 7.3 Justificación del uso de MongoDB

La bitácora se seleccionó como subdominio documental porque representa información que naturalmente puede almacenarse y consultarse como un documento.

La decisión se analizó utilizando las tres preguntas de diseño propuestas para el laboratorio.

### ¿Cómo se lee el 90 % del tiempo?

La bitácora normalmente se consulta completa para conocer el historial de un pedido.

Por ejemplo, cuando se desea conocer qué ocurrió con un pedido, resulta útil obtener en una misma consulta los eventos relacionados con su creación, confirmación, preparación, asignación de repartidor y entrega.

Por esta razón, almacenar los eventos juntos dentro del documento facilita la consulta del historial.

### ¿Cuánto crece en el peor caso?

La cantidad de eventos asociados a un pedido tiene un crecimiento limitado.

Durante su ciclo de vida, un pedido genera una cantidad relativamente pequeña de eventos importantes.

Una vez que el pedido es entregado o cancelado, normalmente dejan de agregarse nuevos eventos.

Por esta razón, el arreglo `eventos` puede mantenerse dentro del mismo documento sin esperar un crecimiento ilimitado.

### ¿Quién más necesita estos datos?

Los eventos pertenecen principalmente al pedido que los originó.

Normalmente se consultan para conocer el historial de un pedido específico y no necesitan compartirse como entidades independientes con otras partes del sistema.

Por esta razón, resulta conveniente mantenerlos agrupados dentro de la bitácora correspondiente.

---

## 7.4 Decisión de incrustar los eventos

Se decidió utilizar el patrón de **documentos incrustados (embedded documents)**.

Los eventos se almacenan dentro del arreglo `eventos` de cada documento de `bitacora_pedidos`, en lugar de crear una colección independiente para cada evento.

La decisión se basa en que:

- Los eventos normalmente se consultan junto con la bitácora del pedido.
- La cantidad de eventos por pedido tiene un crecimiento limitado.
- Cada evento pertenece principalmente a un único pedido.
- Permite obtener el historial completo mediante una sola consulta al documento.

Por estas razones, incrustar los eventos representa mejor la forma en que esta información será utilizada por el sistema.

---

## 7.5 Relación con PostgreSQL

PostgreSQL continúa siendo la base de datos principal para la información estructurada y transaccional del sistema.

En PostgreSQL se almacenan entidades como:

- Usuarios.
- Tiendas.
- Categorías.
- Productos.
- Barrios.
- Pedidos.
- Detalles de pedidos.
- Repartidores.
- Entregas.

Estas entidades requieren relaciones, restricciones de integridad y consistencia entre los datos.

MongoDB complementa este modelo almacenando la bitácora de actividad de los pedidos.

La relación entre ambas bases se realiza mediante `pedidoId`, que identifica el pedido de PostgreSQL al cual pertenece la bitácora.

De esta manera, Chorotega E-Market utiliza una estrategia de **persistencia políglota**, utilizando PostgreSQL para el núcleo transaccional y MongoDB para información con estructura documental.

---

## 8. Datos seed de MongoDB

MongoDB cuenta con datos iniciales para comprobar el funcionamiento de la colección `bitacora_pedidos`.

El seed se encuentra en:

```text
database/mongodb/seeds/seed-bitacora-pedidos.js
```

El documento inicial contiene eventos representativos del ciclo de vida de un pedido.

Entre los eventos utilizados se encuentran:

```text
PEDIDO_CREADO
PEDIDO_CONFIRMADO
INVENTARIO_ACTUALIZADO
PEDIDO_EN_PREPARACION
REPARTIDOR_ASIGNADO
```

Por ejemplo:

```javascript
{
  tipo: "PEDIDO_CREADO",
  fecha: ISODate("2026-08-21T14:00:00Z"),
  detalle: "El cliente creó el pedido"
}
```

Estos datos permiten comprobar que la colección puede almacenar correctamente diferentes acontecimientos relacionados con un mismo pedido.

---

## 9. Docker Compose

Para facilitar la ejecución local del entorno de persistencia se utiliza Docker Compose.

El archivo:

```text
docker-compose.yml
```

se encuentra en la raíz del proyecto y define dos servicios de bases de datos:

- PostgreSQL 16.
- MongoDB 7.

PostgreSQL utiliza el puerto:

```text
5432
```

MongoDB utiliza el puerto:

```text
27017
```

Los scripts de migración y seeds se montan en los contenedores para ejecutarse durante la inicialización de las bases de datos.

Todo el entorno puede levantarse desde la raíz del proyecto mediante:

```bash
docker compose up -d
```

El estado de los servicios puede verificarse mediante:

```bash
docker compose ps
```

Para detener los contenedores:

```bash
docker compose down
```

Para detener los contenedores y eliminar sus volúmenes locales:

```bash
docker compose down -v
```

El comando `docker compose down -v` permite eliminar los datos locales y posteriormente comprobar que el entorno puede reconstruirse desde cero.

---

## 10. Verificación de PostgreSQL

Para comprobar PostgreSQL se puede acceder directamente al contenedor mediante:

```bash
docker exec -it chorotega-postgres psql -U postgres -d chorotega_emarket
```

Una vez dentro de PostgreSQL, las tablas pueden verificarse mediante:

```sql
\dt
```

La base debe contener las nueve tablas:

```text
usuario
tienda
categoria
producto
barrio
pedido
detalle_pedido
repartidor
entrega
```

También pueden realizarse consultas sobre los datos iniciales, por ejemplo:

```sql
SELECT * FROM usuario;
SELECT * FROM producto;
SELECT * FROM pedido;
```

Para salir de PostgreSQL:

```sql
\q
```

Esta comprobación permite confirmar que la migración y los seeds se ejecutaron correctamente.

---

## 11. Verificación de MongoDB

Para comprobar MongoDB se puede acceder directamente al contenedor mediante:

```bash
docker exec -it chorotega-mongodb mongosh
```

Posteriormente se selecciona la base:

```javascript
use chorotega_emarket
```

Las colecciones pueden visualizarse mediante:

```javascript
show collections
```

Debe aparecer:

```text
bitacora_pedidos
```

Para consultar los documentos:

```javascript
db.bitacora_pedidos.find().pretty()
```

La consulta permite comprobar que la bitácora contiene los eventos insertados mediante el seed.

Entre los eventos verificados se encuentran:

- `PEDIDO_CREADO`
- `PEDIDO_CONFIRMADO`
- `INVENTARIO_ACTUALIZADO`
- `PEDIDO_EN_PREPARACION`
- `REPARTIDOR_ASIGNADO`

Para salir de MongoDB:

```javascript
exit
```

---

## 12. Reproducibilidad del entorno

Una parte importante de la configuración consiste en garantizar que las bases de datos puedan reconstruirse desde un entorno vacío.

Para comprobarlo se eliminaron los contenedores y sus volúmenes mediante:

```bash
docker compose down -v
```

Posteriormente se reconstruyó el entorno mediante:

```bash
docker compose up -d
```

Finalmente se verificó el estado de los servicios:

```bash
docker compose ps
```

Después de la reconstrucción se comprobó nuevamente:

- La existencia de las nueve tablas de PostgreSQL.
- La ejecución de los datos seed de PostgreSQL.
- La existencia de la colección `bitacora_pedidos`.
- La ejecución del seed de MongoDB.
- El funcionamiento simultáneo de ambos contenedores.

Esto permite comprobar que el esquema y los datos iniciales pueden reconstruirse automáticamente desde un entorno vacío.

---

## 13. Integración continua

El proyecto utiliza GitHub Actions como mecanismo de integración continua.

Se mantienen jobs independientes para backend y frontend.

En el backend se ejecutan:

```bash
npm run lint
npm run test
npm run build
```

Las pruebas actuales permiten verificar funcionalidades del módulo de productos.

En el frontend se ejecutan:

```bash
npm run lint
npm run build
```

Esta configuración permite detectar problemas de calidad, pruebas o compilación antes de integrar cambios al proyecto.

---

## 14. Conclusión

La persistencia de Chorotega E-Market combina PostgreSQL y MongoDB de acuerdo con las características de la información almacenada.

PostgreSQL mantiene el núcleo relacional y transaccional del sistema, incluyendo usuarios, tiendas, categorías, productos, barrios, pedidos, detalles de pedidos, repartidores y entregas.

MongoDB complementa este modelo mediante una bitácora documental que registra los eventos asociados al ciclo de vida de los pedidos.

La utilización de restricciones, índices y relaciones permite proteger la integridad del modelo relacional, mientras que el uso de documentos incrustados en MongoDB facilita la consulta del historial de cada pedido.

Finalmente, las migraciones, los datos seed y la configuración mediante Docker Compose permiten reconstruir y verificar el entorno de persistencia de forma reproducible.