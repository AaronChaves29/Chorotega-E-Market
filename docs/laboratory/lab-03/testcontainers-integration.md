# Pruebas de integración con Testcontainers

## Objetivo

Validar la capa de persistencia del dominio de pedidos mediante pruebas de integración ejecutadas contra una instancia real y temporal de PostgreSQL 16 utilizando Testcontainers.

Las pruebas se encuentran en:

`apps/backend/test/integration/orders.integration-spec.ts`

---

## Pruebas implementadas

Se implementaron tres pruebas de integración para el dominio de pedidos.

### 1. Persistencia y recuperación de pedidos

Se verifica que un pedido pueda almacenarse correctamente en PostgreSQL y posteriormente recuperarse mediante su identificador.

La prueba valida los principales datos del pedido:

- Cliente.
- Tienda.
- Barrio.
- Estado.
- Subtotal.
- Tarifa de envío.
- Total.
- Dirección de entrega.

Esto permite comprobar el funcionamiento de la persistencia y las relaciones necesarias para registrar un pedido válido.

### 2. Consulta dinámica de pedidos

Se valida el método:

`OrdersRepository.search()`

La prueba crea pedidos con diferentes estados y ejecuta una búsqueda utilizando los filtros de estado y barrio.

```typescript
const results = await ordersRepository.search({
  estado: 'ENTREGADO',
  idBarrio: neighborhood.idBarrio,
});
```

Se comprueba que únicamente se recupere el pedido que cumple los filtros y que las relaciones `cliente`, `tienda` y `barrio` sean cargadas correctamente.

### 3. Recuperación de pedidos con detalles

Se valida el método:

`OrdersRepository.findAllWithDetails()`

La prueba crea un pedido con un detalle asociado y posteriormente ejecuta:

```typescript
const results = await ordersRepository.findAllWithDetails();
```

Se comprueba que el pedido sea recuperado junto con su detalle:

```typescript
expect(foundOrder).toBeDefined();
expect(foundOrder?.detalles).toHaveLength(1);
```

Esta prueba también valida funcionalmente la consulta optimizada implementada para evitar el patrón N+1.

---

## Uso de Testcontainers

Las pruebas utilizan la infraestructura compartida ubicada en:

`apps/backend/test/support/postgres-test-database.ts`

Testcontainers levanta una instancia temporal de PostgreSQL 16, ejecuta las migraciones del proyecto y permite realizar las pruebas contra una base de datos real y aislada.

Al finalizar la ejecución, el contenedor es eliminado.

---

## Resultado

Las pruebas se ejecutaron mediante:

```text
npm run test:integration
```

Resultado obtenido:

```text
PASS  test/integration/postgres-infrastructure.integration-spec.ts
PASS  test/integration/orders.integration-spec.ts

Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
Snapshots:   0 total
```

Las tres pruebas de integración correspondientes al dominio de pedidos finalizaron correctamente.

El total mostrado por Jest incluye también las pruebas existentes de la infraestructura compartida.

---

## Conclusión

Las pruebas realizadas verifican correctamente la persistencia de pedidos, la consulta dinámica mediante filtros y la recuperación optimizada de pedidos con sus detalles utilizando PostgreSQL real mediante Testcontainers.

Estas tres pruebas forman parte del mínimo de seis pruebas de integración requerido para el Laboratorio 3.