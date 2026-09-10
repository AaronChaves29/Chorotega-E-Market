# Consultas dinámicas de negocio

## Laboratorio 3 — Chorotega E-Market

Se implementaron dos consultas dinámicas de negocio utilizando `QueryBuilder` de TypeORM para los dominios de **pedidos** y **entregas**.

Las consultas agregan condiciones al SQL únicamente cuando los filtros correspondientes son proporcionados.

---

# 1. Consulta dinámica de pedidos

## Objetivo

Permitir la búsqueda de pedidos utilizando diferentes criterios opcionales mediante el método:

`OrdersRepository.search(filters: OrderSearchFilters)`

Los filtros disponibles son:

| Filtro | Descripción |
| --- | --- |
| `estado` | Estado del pedido |
| `idCliente` | Identificador del cliente |
| `idTienda` | Identificador de la tienda |
| `idBarrio` | Identificador del barrio |
| `fechaDesde` | Fecha mínima de creación |
| `fechaHasta` | Fecha máxima de creación |

Los filtros pueden utilizarse individualmente o combinarse.

## Implementación

La consulta se construye mediante `QueryBuilder` y recupera también las relaciones con cliente, tienda y barrio.

```typescript
const query = this.repository
  .createQueryBuilder('pedido')
  .leftJoinAndSelect('pedido.cliente', 'cliente')
  .leftJoinAndSelect('pedido.tienda', 'tienda')
  .leftJoinAndSelect('pedido.barrio', 'barrio')
  .orderBy('pedido.fechaCreacion', 'DESC')
  .addOrderBy('pedido.idPedido', 'DESC');

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

## Evidencia de ejecución

Para verificar la consulta se utilizaron simultáneamente:

```text
estado = ENTREGADO
idBarrio = 2
```

TypeORM generó una consulta con las relaciones requeridas y las siguientes condiciones:

```sql
SELECT
    "pedido"."id_pedido",
    "pedido"."id_cliente",
    "pedido"."id_tienda",
    "pedido"."id_barrio",
    "pedido"."fecha_creacion",
    "pedido"."estado",
    "pedido"."subtotal",
    "pedido"."tarifa_envio",
    "pedido"."total",
    "pedido"."direccion_entrega"
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

Parámetros utilizados:

```text
$1 = ENTREGADO
$2 = 2
```

Resultado obtenido:

```text
idPedido: 2
estado: ENTREGADO
cliente: maria.cliente@test.com
tienda: Sabores de Nicoya
barrio: San Martín
```

El resultado cumple ambos filtros y confirma que las condiciones fueron incorporadas dinámicamente al `WHERE`.

---

# 2. Consulta dinámica de entregas

## Objetivo

Permitir la búsqueda de entregas mediante:

`DeliveriesRepository.search(filters: DeliverySearchFilters)`

Los filtros disponibles son:

| Filtro | Descripción |
| --- | --- |
| `estado` | Estado de la entrega |
| `idPedido` | Identificador del pedido |
| `idRepartidor` | Identificador del repartidor |
| `fechaDesde` | Fecha mínima de asignación |
| `fechaHasta` | Fecha máxima de asignación |

## Implementación

La consulta utiliza `QueryBuilder` y recupera las relaciones con pedido y repartidor.

```typescript
const query = this.repository
  .createQueryBuilder('entrega')
  .leftJoinAndSelect('entrega.pedido', 'pedido')
  .leftJoinAndSelect('entrega.repartidor', 'repartidor')
  .orderBy('entrega.fechaAsignacion', 'DESC')
  .addOrderBy('entrega.idEntrega', 'DESC');

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

## Evidencia de ejecución

Para verificar la consulta se utilizaron:

```text
estado = ENTREGADA
idRepartidor = 1
```

TypeORM generó una consulta con las relaciones requeridas y las siguientes condiciones:

```sql
SELECT
    "entrega"."id_entrega",
    "entrega"."id_pedido",
    "entrega"."id_repartidor",
    "entrega"."estado",
    "entrega"."fecha_asignacion",
    "entrega"."fecha_entrega"
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

Parámetros utilizados:

```text
$1 = ENTREGADA
$2 = 1
```

Resultado obtenido:

```text
idEntrega: 2
estado: ENTREGADA
idPedido: 2
idRepartidor: 1

idEntrega: 1
estado: ENTREGADA
idPedido: 2
idRepartidor: 1
```

Los dos registros cumplen con los filtros utilizados.

También se verificó una búsqueda utilizando un identificador de repartidor sin coincidencias, obteniendo una colección vacía.

---

# 3. Conclusión

Se verificaron las dos consultas dinámicas implementadas con `QueryBuilder` de TypeORM.

Las evidencias obtenidas confirman que:

- los filtros son opcionales y pueden combinarse;
- solamente los filtros proporcionados se incorporan al `WHERE`;
- las relaciones necesarias se recuperan mediante `LEFT JOIN`;
- TypeORM utiliza parámetros para los valores de los filtros;
- los resultados obtenidos corresponden con los criterios enviados.

El SQL generado fue capturado durante la ejecución de ambas consultas como evidencia de su funcionamiento.