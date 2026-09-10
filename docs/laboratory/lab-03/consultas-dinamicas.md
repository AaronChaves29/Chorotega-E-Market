# Consultas dinámicas de negocio

## Laboratorio 3 — Chorotega E-Market

Este documento presenta la evidencia de las consultas dinámicas de negocio implementadas para los dominios de **pedidos** y **entregas**.

Las consultas fueron desarrolladas utilizando `QueryBuilder` de TypeORM. Este mecanismo permite construir consultas de forma dinámica, agregando condiciones únicamente cuando los filtros correspondientes son proporcionados.

Como evidencia se documenta el SQL generado por TypeORM, los parámetros utilizados y los resultados obtenidos durante la verificación.

---

# 1. Consulta dinámica de pedidos

## 1.1. Repositorio

La consulta se encuentra implementada en:

```text
OrdersRepository
```

mediante el método:

```text
search(filters: OrderSearchFilters)
```

## 1.2. Objetivo

Permitir la búsqueda de pedidos utilizando diferentes criterios opcionales sin necesidad de crear un método de consulta independiente para cada posible combinación de filtros.

La consulta se construye mediante `QueryBuilder` y agrega las condiciones correspondientes solamente cuando el filtro fue proporcionado.

## 1.3. Filtros disponibles

La consulta permite utilizar los siguientes filtros:

| Filtro | Descripción |
|---|---|
| `estado` | Estado actual del pedido |
| `idCliente` | Identificador del cliente |
| `idTienda` | Identificador de la tienda |
| `idBarrio` | Identificador del barrio de entrega |
| `fechaDesde` | Fecha mínima de creación del pedido |
| `fechaHasta` | Fecha máxima de creación del pedido |

Los filtros son opcionales y pueden utilizarse individualmente o combinarse.

## 1.4. Relaciones cargadas

La consulta incluye las relaciones necesarias para obtener información asociada al pedido:

- cliente;
- tienda;
- barrio.

Estas relaciones se cargan utilizando `leftJoinAndSelect` de TypeORM.

La construcción base de la consulta incluye:

```typescript
const query = this.repository
  .createQueryBuilder('pedido')
  .leftJoinAndSelect('pedido.cliente', 'cliente')
  .leftJoinAndSelect('pedido.tienda', 'tienda')
  .leftJoinAndSelect('pedido.barrio', 'barrio')
  .orderBy('pedido.fechaCreacion', 'DESC')
  .addOrderBy('pedido.idPedido', 'DESC');
```

Posteriormente, cada condición se incorpora únicamente cuando el filtro correspondiente se encuentra definido.

Por ejemplo:

```typescript
if (filters.estado !== undefined) {
  query.andWhere('pedido.estado = :estado', {
    estado: filters.estado,
  });
}

if (filters.idBarrio !== undefined) {
  query.andWhere('pedido.idBarrio = :idBarrio', {
    idBarrio: filters.idBarrio,
  });
}
```

## 1.5. Escenario utilizado para la evidencia

Para verificar la construcción dinámica de la consulta se utilizaron simultáneamente los siguientes filtros:

```text
estado = ENTREGADO
idBarrio = 2
```

La llamada realizada corresponde conceptualmente a:

```typescript
search({
  estado: 'ENTREGADO',
  idBarrio: 2,
});
```

De esta manera se comprueba que `QueryBuilder` puede combinar más de un criterio dentro de la misma consulta.

## 1.6. SQL generado por TypeORM

El SQL generado durante la ejecución fue el siguiente:

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
    "cliente"."id_usuario" AS "cliente_id_usuario",
    "cliente"."auth_id" AS "cliente_auth_id",
    "cliente"."nombre" AS "cliente_nombre",
    "cliente"."apellido" AS "cliente_apellido",
    "cliente"."correo" AS "cliente_correo",
    "cliente"."telefono" AS "cliente_telefono",
    "cliente"."rol" AS "cliente_rol",
    "cliente"."estado" AS "cliente_estado",
    "cliente"."fecha_creacion" AS "cliente_fecha_creacion",
    "tienda"."id_tienda" AS "tienda_id_tienda",
    "tienda"."id_emprendedor" AS "tienda_id_emprendedor",
    "tienda"."nombre" AS "tienda_nombre",
    "tienda"."descripcion" AS "tienda_descripcion",
    "tienda"."direccion" AS "tienda_direccion",
    "tienda"."telefono" AS "tienda_telefono",
    "tienda"."horario" AS "tienda_horario",
    "tienda"."estado" AS "tienda_estado",
    "tienda"."fecha_creacion" AS "tienda_fecha_creacion",
    "barrio"."id_barrio" AS "barrio_id_barrio",
    "barrio"."nombre" AS "barrio_nombre",
    "barrio"."tarifa_envio" AS "barrio_tarifa_envio",
    "barrio"."estado" AS "barrio_estado"
FROM "pedido" "pedido"
LEFT JOIN "usuario" "cliente"
    ON "cliente"."id_usuario" = "pedido"."id_cliente"
LEFT JOIN "tienda" "tienda"
    ON "tienda"."id_tienda" = "pedido"."id_tienda"
LEFT JOIN "barrio" "barrio"
    ON "barrio"."id_barrio" = "pedido"."id_barrio"
WHERE "pedido"."estado" = $1
  AND "pedido"."id_barrio" = $2
ORDER BY
    "pedido"."fecha_creacion" DESC,
    "pedido"."id_pedido" DESC;
```

## 1.7. Parámetros utilizados

TypeORM utilizó parámetros en lugar de concatenar directamente los valores dentro del SQL.

Los parámetros obtenidos fueron:

```text
$1 = ENTREGADO
$2 = 2
```

Equivalentemente, TypeORM reportó:

```text
[ 'ENTREGADO', 2 ]
```

La parte dinámica del SQL quedó construida como:

```sql
WHERE "pedido"."estado" = $1
  AND "pedido"."id_barrio" = $2
```

Esto demuestra que ambos filtros fueron incorporados correctamente a la consulta.

## 1.8. Resultado obtenido

La consulta devolvió el siguiente pedido:

```text
idPedido: 2
estado: ENTREGADO
cliente: maria.cliente@test.com
tienda: Sabores de Nicoya
barrio: San Martín
```

El resultado corresponde con los criterios utilizados:

- el pedido se encuentra en estado `ENTREGADO`;
- pertenece al barrio con identificador `2`.

## 1.9. Interpretación

La consulta demuestra que `OrdersRepository` puede construir búsquedas utilizando diferentes combinaciones de filtros.

Si un filtro no es proporcionado, su condición no se incorpora al `WHERE`. Por lo tanto, no es necesario crear métodos diferentes para buscar por estado, cliente, tienda, barrio o fechas.

Además, las relaciones con cliente, tienda y barrio se recuperan dentro de la consulta mediante `LEFT JOIN`.

---

# 2. Consulta dinámica de entregas

## 2.1. Repositorio

La segunda consulta dinámica se encuentra implementada en:

```text
DeliveriesRepository
```

mediante el método:

```text
search(filters: DeliverySearchFilters)
```

## 2.2. Objetivo

Permitir la búsqueda de entregas utilizando diferentes criterios opcionales relacionados con el estado de la entrega, pedido, repartidor y fechas de asignación.

Al igual que en la consulta de pedidos, las condiciones se agregan dinámicamente según los filtros recibidos.

## 2.3. Filtros disponibles

La consulta permite utilizar:

| Filtro | Descripción |
|---|---|
| `estado` | Estado actual de la entrega |
| `idPedido` | Identificador del pedido |
| `idRepartidor` | Identificador del repartidor |
| `fechaDesde` | Fecha mínima de asignación |
| `fechaHasta` | Fecha máxima de asignación |

Los filtros pueden utilizarse individualmente o combinarse.

## 2.4. Relaciones cargadas

La consulta recupera también las relaciones:

- pedido;
- repartidor.

La construcción base utiliza:

```typescript
const query = this.repository
  .createQueryBuilder('entrega')
  .leftJoinAndSelect('entrega.pedido', 'pedido')
  .leftJoinAndSelect('entrega.repartidor', 'repartidor')
  .orderBy('entrega.fechaAsignacion', 'DESC')
  .addOrderBy('entrega.idEntrega', 'DESC');
```

Las condiciones son agregadas posteriormente de acuerdo con los filtros recibidos.

Por ejemplo:

```typescript
if (filters.estado !== undefined) {
  query.andWhere('entrega.estado = :estado', {
    estado: filters.estado,
  });
}

if (filters.idRepartidor !== undefined) {
  query.andWhere('entrega.idRepartidor = :idRepartidor', {
    idRepartidor: filters.idRepartidor,
  });
}
```

## 2.5. Escenario utilizado para la evidencia

Para comprobar la construcción dinámica se utilizaron los siguientes filtros:

```text
estado = ENTREGADA
idRepartidor = 1
```

La llamada realizada corresponde conceptualmente a:

```typescript
search({
  estado: 'ENTREGADA',
  idRepartidor: 1,
});
```

## 2.6. SQL generado por TypeORM

Durante la ejecución, TypeORM generó el siguiente SQL:

```sql
SELECT
    "entrega"."id_entrega" AS "entrega_id_entrega",
    "entrega"."id_pedido" AS "entrega_id_pedido",
    "entrega"."id_repartidor" AS "entrega_id_repartidor",
    "entrega"."estado" AS "entrega_estado",
    "entrega"."fecha_asignacion" AS "entrega_fecha_asignacion",
    "entrega"."fecha_entrega" AS "entrega_fecha_entrega",
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
    "repartidor"."id_repartidor" AS "repartidor_id_repartidor",
    "repartidor"."id_usuario" AS "repartidor_id_usuario",
    "repartidor"."medio_transporte" AS "repartidor_medio_transporte",
    "repartidor"."disponibilidad" AS "repartidor_disponibilidad"
FROM "entrega" "entrega"
LEFT JOIN "pedido" "pedido"
    ON "pedido"."id_pedido" = "entrega"."id_pedido"
LEFT JOIN "repartidor" "repartidor"
    ON "repartidor"."id_repartidor" = "entrega"."id_repartidor"
WHERE "entrega"."estado" = $1
  AND "entrega"."id_repartidor" = $2
ORDER BY
    "entrega"."fecha_asignacion" DESC,
    "entrega"."id_entrega" DESC;
```

## 2.7. Parámetros utilizados

Los parámetros utilizados por TypeORM fueron:

```text
$1 = ENTREGADA
$2 = 1
```

Equivalentemente:

```text
[ 'ENTREGADA', 1 ]
```

La sección dinámica del SQL quedó:

```sql
WHERE "entrega"."estado" = $1
  AND "entrega"."id_repartidor" = $2
```

Esto confirma que se aplicaron simultáneamente el filtro por estado y el filtro por repartidor.

## 2.8. Resultado obtenido

La consulta devolvió dos registros:

```text
idEntrega: 2
estado: ENTREGADA
idPedido: 2
idRepartidor: 1
```

y:

```text
idEntrega: 1
estado: ENTREGADA
idPedido: 2
idRepartidor: 1
```

Ambos registros cumplen con los filtros utilizados:

```text
estado = ENTREGADA
idRepartidor = 1
```

También se realizó una comprobación utilizando un identificador de repartidor sin coincidencias, obteniendo una lista vacía. Esto permitió verificar que el filtro se aplica correctamente y que no es ignorado por la consulta.

## 2.9. Interpretación

`DeliveriesRepository` construye la consulta según los filtros proporcionados.

Por ejemplo, al recibir `estado` e `idRepartidor`, TypeORM agregó ambas condiciones al `WHERE`. Otros filtros, como `idPedido`, `fechaDesde` o `fechaHasta`, no fueron incluidos porque no formaban parte del escenario evaluado.

Esto permite reutilizar un único método `search()` para diferentes necesidades de búsqueda.

---

# 3. Comparación de las consultas verificadas

| Consulta | Filtros utilizados en la evidencia | Relaciones cargadas | Resultado |
|---|---|---|---|
| Pedidos | `estado`, `idBarrio` | cliente, tienda, barrio | 1 pedido |
| Entregas | `estado`, `idRepartidor` | pedido, repartidor | 2 entregas |

En ambos casos se comprobó que TypeORM construye el SQL utilizando únicamente los filtros proporcionados.

---

# 4. Parametrización de las consultas

Las dos consultas utilizan parámetros generados por TypeORM.

Por ejemplo:

```sql
WHERE "pedido"."estado" = $1
  AND "pedido"."id_barrio" = $2
```

y:

```sql
WHERE "entrega"."estado" = $1
  AND "entrega"."id_repartidor" = $2
```

Los valores reales se proporcionan de manera separada:

```text
[ 'ENTREGADO', 2 ]
```

y:

```text
[ 'ENTREGADA', 1 ]
```

Por lo tanto, los valores de los filtros no son concatenados directamente dentro de las cadenas SQL.

---

# 5. Conclusión

Se implementaron y verificaron dos consultas dinámicas de negocio utilizando `QueryBuilder` de TypeORM:

1. búsqueda dinámica de pedidos mediante `OrdersRepository`;
2. búsqueda dinámica de entregas mediante `DeliveriesRepository`.

Las verificaciones realizadas permitieron comprobar que:

- los filtros son opcionales;
- pueden combinarse varios filtros en una misma búsqueda;
- únicamente se agregan al SQL las condiciones correspondientes a los filtros proporcionados;
- las relaciones requeridas se recuperan mediante `LEFT JOIN`;
- las consultas utilizan parámetros;
- los registros obtenidos corresponden con los criterios enviados;
- una combinación de filtros sin coincidencias devuelve una colección vacía.

El SQL generado por TypeORM fue capturado durante la ejecución de ambas consultas y se documentó como evidencia de su funcionamiento.