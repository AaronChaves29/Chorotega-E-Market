# Evidencia y corrección del problema N+1

La evidencia original corresponde a un escenario de datos específico. La
[validación final](validacion-final.md) agrega una ejecución reproducida sobre
los seeds actuales en bases temporales, con SQL y resultados capturados.

## 1. Objetivo

El objetivo de esta evidencia es demostrar un problema de consultas N+1 al recuperar pedidos y sus respectivos detalles, así como la corrección aplicada mediante una consulta optimizada con `LEFT JOIN`.

La relación evaluada corresponde a:

- `Order` → `OrderDetail`
- Tabla `pedido` → tabla `detalle_pedido`

---

## 2. Escenario de prueba

Para realizar la prueba se utilizaron tres pedidos almacenados en PostgreSQL.

Cada pedido contiene un registro asociado en la tabla `detalle_pedido`.

El escenario utilizado fue:

```text
Pedido 1 -> 1 detalle
Pedido 2 -> 1 detalle
Pedido 3 -> 1 detalle
```

Este conjunto de datos permite observar claramente el comportamiento N+1 antes de aplicar la optimización.

---

## 3. Situación antes de la corrección

### 3.1 Recuperación inicial de los pedidos

Inicialmente se obtiene la lista completa de pedidos mediante el repositorio de pedidos:

```typescript
const orders = await ordersRepository.findAll();
```

Durante la prueba, TypeORM generó una consulta SQL para recuperar los pedidos:

```sql
SELECT
  "Order"."id_pedido" AS "Order_id_pedido",
  "Order"."id_cliente" AS "Order_id_cliente",
  "Order"."id_tienda" AS "Order_id_tienda",
  "Order"."id_barrio" AS "Order_id_barrio",
  "Order"."fecha_creacion" AS "Order_fecha_creacion",
  "Order"."estado" AS "Order_estado",
  "Order"."subtotal" AS "Order_subtotal",
  "Order"."tarifa_envio" AS "Order_tarifa_envio",
  "Order"."total" AS "Order_total",
  "Order"."direccion_entrega" AS "Order_direccion_entrega"
FROM "pedido" "Order";
```

El resultado obtenido fue:

```text
Pedidos encontrados: 3
```

---

### 3.2 Recuperación individual de los detalles

Para obtener los detalles asociados a un pedido se implementó el siguiente método en `OrderDetailsRepository`:

```typescript
findByOrderId(idPedido: number): Promise<OrderDetail[]> {
  return this.repository.find({
    where: { idPedido },
  });
}
```

El método permite recuperar los detalles pertenecientes a un pedido específico.

Para demostrar el problema N+1, después de obtener los tres pedidos se solicitaron sus detalles individualmente.

Conceptualmente, la operación realizada fue:

```typescript
const orders = await ordersRepository.findAll();

for (const order of orders) {
  const details =
    await orderDetailsRepository.findByOrderId(order.idPedido);
}
```

Esto provocó una consulta adicional por cada pedido recuperado.

---

### 3.3 Consulta para el pedido 1

TypeORM ejecutó:

```sql
SELECT
  "OrderDetail"."id_detalle" AS "OrderDetail_id_detalle",
  "OrderDetail"."id_pedido" AS "OrderDetail_id_pedido",
  "OrderDetail"."id_producto" AS "OrderDetail_id_producto",
  "OrderDetail"."cantidad" AS "OrderDetail_cantidad",
  "OrderDetail"."precio_unitario" AS "OrderDetail_precio_unitario",
  "OrderDetail"."subtotal" AS "OrderDetail_subtotal"
FROM "detalle_pedido" "OrderDetail"
WHERE (("OrderDetail"."id_pedido" = $1));
```

Parámetro utilizado:

```text
[1]
```

Resultado:

```text
Pedido 1 -> 1 detalle(s)
```

---

### 3.4 Consulta para el pedido 2

La misma consulta fue ejecutada nuevamente utilizando el parámetro:

```text
[2]
```

Resultado:

```text
Pedido 2 -> 1 detalle(s)
```

---

### 3.5 Consulta para el pedido 3

La consulta volvió a ejecutarse utilizando el parámetro:

```text
[3]
```

Resultado:

```text
Pedido 3 -> 1 detalle(s)
```

---

## 4. Identificación del problema N+1

En el escenario anterior se ejecutaron:

```text
1 consulta para recuperar los pedidos
+
3 consultas para recuperar los detalles
=
4 consultas SQL
```

Esto representa el patrón:

```text
1 + N
```

donde `N` corresponde a la cantidad de pedidos recuperados.

En este caso:

```text
N = 3 pedidos
```

por lo que:

```text
1 + 3 = 4 consultas
```

El problema se vuelve más significativo conforme aumenta la cantidad de pedidos.

Por ejemplo, si se recuperaran 100 pedidos utilizando el mismo procedimiento:

```text
1 consulta para recuperar los pedidos
+
100 consultas para recuperar los detalles
=
101 consultas SQL
```

Por lo tanto, la cantidad de consultas aumenta proporcionalmente con la cantidad de pedidos obtenidos, generando accesos innecesarios a la base de datos y pudiendo afectar el rendimiento de la aplicación.

---

## 5. Corrección aplicada

Para evitar realizar una consulta adicional por cada pedido se implementó el método `findAllWithDetails()` dentro de `OrdersRepository`.

```typescript
findAllWithDetails(): Promise<Order[]> {
  return this.repository
    .createQueryBuilder('pedido')
    .leftJoinAndSelect('pedido.detalles', 'detalle')
    .orderBy('pedido.idPedido', 'ASC')
    .getMany();
}
```

La parte principal de la optimización corresponde a:

```typescript
.leftJoinAndSelect('pedido.detalles', 'detalle')
```

Mediante esta operación, TypeORM genera un `LEFT JOIN` entre las tablas `pedido` y `detalle_pedido`.

De esta manera, los pedidos y sus detalles asociados pueden recuperarse mediante una única consulta SQL.

---

## 6. Situación después de la corrección

Para comprobar la solución se utilizó:

```typescript
const orders = await ordersRepository.findAllWithDetails();
```

TypeORM generó la siguiente consulta SQL:

```sql
SELECT
  "pedido"."id_pedido" AS "pedido_id_pedido",
  "pedido"."id_cliente" AS "pedido_id_cliente",
  "pedido"."id_tienda" AS "pedido_id_tienda",
  "pedido"."id_barrio" AS "pedido_id_barrio",
  "pedido"."fecha_creacion" AS "pedido_fecha_creacion",
  "pedido"."estado" AS "pedido_estado",
  "pedido"."subtotal" AS "pedido_subtotal",
  "pedido"."tarifa_envio" AS "pedido_tarifa_envio",
  "pedido"."total" AS "pedido_total",
  "pedido"."direccion_entrega" AS "pedido_direccion_entrega",
  "detalle"."id_detalle" AS "detalle_id_detalle",
  "detalle"."id_pedido" AS "detalle_id_pedido",
  "detalle"."id_producto" AS "detalle_id_producto",
  "detalle"."cantidad" AS "detalle_cantidad",
  "detalle"."precio_unitario" AS "detalle_precio_unitario",
  "detalle"."subtotal" AS "detalle_subtotal"
FROM "pedido" "pedido"
LEFT JOIN "detalle_pedido" "detalle"
  ON "detalle"."id_pedido" = "pedido"."id_pedido"
ORDER BY "pedido"."id_pedido" ASC;
```

El resultado obtenido fue:

```text
Pedidos encontrados: 3

Pedido 1 -> 1 detalle(s)
Pedido 2 -> 1 detalle(s)
Pedido 3 -> 1 detalle(s)
```

Los mismos pedidos y detalles fueron recuperados correctamente, pero ya no fue necesario realizar una consulta adicional por cada pedido.

---

## 7. Comparación antes y después

| Escenario                | Consulta de pedidos | Consultas adicionales de detalles | Total |
| ------------------------ | ------------------: | --------------------------------: | ----: |
| Antes de la corrección   |                   1 |                                 3 |     4 |
| Después de la corrección |   1 con `LEFT JOIN` |                                 0 |     1 |

### Antes

```text
SELECT pedido
    |
    +--> SELECT detalle_pedido WHERE id_pedido = 1
    |
    +--> SELECT detalle_pedido WHERE id_pedido = 2
    |
    +--> SELECT detalle_pedido WHERE id_pedido = 3

Total: 4 consultas
```

### Después

```text
SELECT pedido
LEFT JOIN detalle_pedido

Total: 1 consulta
```

La optimización reduce el número de consultas necesarias para este escenario de cuatro a una.

---

## 8. Decisión de diseño sobre `findByOrderId()`

El método:

```typescript
findByOrderId(idPedido: number): Promise<OrderDetail[]> {
  return this.repository.find({
    where: { idPedido },
  });
}
```

se mantiene en `OrderDetailsRepository`.

Este método no representa por sí mismo un problema N+1, ya que es útil cuando la aplicación necesita recuperar únicamente los detalles de un pedido específico.

Por ejemplo:

```typescript
orderDetailsRepository.findByOrderId(1);
```

El problema N+1 aparece cuando este método se ejecuta repetidamente para cada elemento de una colección de pedidos.

Por lo tanto, se mantienen ambos métodos con responsabilidades diferentes:

### `OrderDetailsRepository.findByOrderId()`

Se utiliza cuando se conocen los datos de un pedido específico y solamente se necesitan sus detalles.

```text
Un pedido
    |
    v
findByOrderId(idPedido)
    |
    v
Detalles de ese pedido
```

### `OrdersRepository.findAllWithDetails()`

Se utiliza cuando se necesita recuperar una colección de pedidos junto con sus detalles asociados.

```text
Varios pedidos
    |
    v
findAllWithDetails()
    |
    v
Pedido + detalles mediante LEFT JOIN
```

Esta separación permite utilizar la estrategia de consulta apropiada según el caso de uso.

---

## 9. Resultado final

La prueba permitió comprobar el siguiente comportamiento:

```text
ANTES
--------------------------------
Pedidos recuperados:          3
Consulta inicial:             1
Consultas adicionales:        3
Total de consultas:           4


DESPUÉS
--------------------------------
Pedidos recuperados:          3
Consulta con LEFT JOIN:       1
Consultas adicionales:        0
Total de consultas:           1
```

La cantidad de información recuperada se mantuvo:

```text
Pedido 1 -> 1 detalle
Pedido 2 -> 1 detalle
Pedido 3 -> 1 detalle
```

pero la estrategia de acceso a datos fue optimizada.

---

## 10. Conclusión

Se identificó un problema N+1 al recuperar inicialmente una colección de pedidos y posteriormente realizar una consulta individual para obtener los detalles asociados a cada pedido.

En el escenario utilizado, tres pedidos provocaban cuatro consultas SQL: una consulta inicial para recuperar los pedidos y tres consultas adicionales para recuperar sus detalles.

Para corregir el problema se implementó `findAllWithDetails()` en `OrdersRepository` mediante `QueryBuilder` y `leftJoinAndSelect`.

La solución permite realizar un `LEFT JOIN` entre `pedido` y `detalle_pedido`, recuperando los pedidos y sus detalles asociados mediante una única consulta SQL.

Como resultado, el escenario pasó de cuatro consultas SQL a una sola consulta, evitando que la cantidad de consultas aumente proporcionalmente con la cantidad de pedidos recuperados.

El método `findByOrderId()` se mantiene en `OrderDetailsRepository` para aquellos casos donde únicamente se requieran los detalles de un pedido específico, mientras que `findAllWithDetails()` se utiliza cuando se necesita recuperar múltiples pedidos junto con sus detalles.
