# Crear y confirmar un pedido

## Objetivo y alcance

`OrdersService.createAndConfirm(idCliente, input)` implementa el proceso 3.1 de
[la propuesta de dominio](../lab-02/propuesta-dominio.md): validar una compra,
calcular sus importes, guardar pedido y detalles, descontar inventario y terminar
en `CONFIRMADO`, como una única operación transaccional.

El servicio usa los repositorios del Lab 3. No agrega endpoints, autenticación,
versionado, OpenAPI, frontend, migraciones ni cambios de entidades. No implementa
cancelación, preparación ni entrega. La API existente de productos se conserva.

La guía del Lab 4, páginas PDF 2–3, exige servicios, reglas, DTOs, excepciones,
patrones justificados, unitarias, cobertura y rollback. La sesión 08, página PDF 8,
presenta el mapa de transiciones como implementación pequeña de State. La
adaptación utiliza NestJS, TypeORM, class-validator y Jest, ya instalados.

## Entrada y salida

El identificador del comprador se recibe por separado desde el contexto confiable
del llamador. Este bloque no autentica usuarios ni interpreta tokens.

```typescript
const input = {
  idBarrio: 2,
  direccionEntrega: "Nicoya, dirección específica",
  items: [
    { idProducto: 4, cantidad: 3 },
    { idProducto: 5, cantidad: 2 },
  ],
};
```

El servicio transforma y valida `CreateOrderDto`, incluyendo cada elemento de
`items`. Rechaza propiedades adicionales, tanto en el pedido como en sus líneas.
Precio, subtotal, tarifa, total, estado e identidad del comprador no se aceptan
en el DTO. La validación se ejecuta también al llamar directamente al servicio,
sin depender de un ValidationPipe HTTP.

`OrderResponseDto` contiene identificadores del pedido, comprador, tienda y barrio;
fecha, estado y dirección; subtotal, tarifa y total; y líneas con identificador,
producto, cantidad, precio unitario histórico y subtotal. `OrderMapper` construye
instancias propias de los DTOs con campos explícitos. Ninguna entidad ni relación
TypeORM forma parte de ese resultado.

## Reglas y excepciones

- Comprador existente y `ACTIVO`. No se exige rol `CLIENTE`: no se añade una
  restricción de autorización que la propuesta no especifica expresamente.
- Barrio existente y `ACTIVO`, con tarifa válida. La disponibilidad en Nicoya se
  representa mediante el catálogo de barrios; no se verifica geográficamente el
  texto de la dirección.
- Dirección con contenido y hasta 255 caracteres, conforme al esquema.
- Al menos una línea; identificadores y cantidades enteros positivos compatibles
  con las columnas `int` existentes.
- Productos sin repetir. Se lanza `DuplicateOrderProductException` en lugar de
  sumar cantidades silenciosamente.
- Productos existentes y `ACTIVO`; sus tiendas deben existir y estar `ACTIVA`.
- Una sola tienda por pedido. `MixedOrderStoresException` rechaza mezclar tiendas,
  en correspondencia con el único `idTienda` del pedido.
- Existencias suficientes: `InsufficientOrderStockException` impide sobreventa.
- Precio positivo; tarifa no negativa; importes compatibles con `numeric(10,2)`.

Las excepciones de `order.exceptions.ts` extienden `Error` mediante
`OrderBusinessException`, conservan nombres expresivos y no dependen de HTTP.
Los fallos de persistencia se propagan para que TypeORM revierta la transacción.

## Dinero y conservación de precios

Los importes permanecen como `string` en entidades y DTOs. Las utilidades
`toCents`, `fromCents` y `lineSubtotal` calculan mediante centavos enteros `bigint`:

```text
subtotalLinea = cantidad × precioUnitario
subtotalPedido = suma de subtotales de línea
total = subtotalPedido + tarifaEnvio
```

No se utiliza punto flotante para operaciones monetarias ni se redondean entradas
inválidas. El máximo permitido es `99999999.99`, correspondiente a `numeric(10,2)`.
Un desbordamiento se rechaza antes de guardar el pedido.

El servicio toma el precio del producto bloqueado y la tarifa del barrio
consultado dentro de la transacción. Guarda copias en `detalle_pedido.precio_unitario`
y `pedido.tarifa_envio`. Cambiar después el catálogo no recalcula pedidos
confirmados. No se añade una regla para cambiar automáticamente el estado del
producto cuando sus existencias llegan a cero.

## Transacción y control de inventario

`OrderTransaction` ejecuta `DataSource.transaction()`. Construye los seis
repositorios necesarios con `manager.getRepository(...)`, utilizando el mismo
EntityManager transaccional para lecturas y escrituras. No modifica la base
genérica ni expone su Repository interno.

El flujo es:

1. Validar formato y duplicados antes de abrir la transacción.
2. Dentro de ella, comprobar comprador y barrio.
3. Leer los productos solicitados con parámetros, `ORDER BY id_producto ASC` y
   `FOR UPDATE`; comprobar existencia, actividad, tienda e inventario.
4. Calcular los importes con los precios y tarifa obtenidos del servidor.
5. Guardar un pedido `PENDIENTE` y sus detalles con precios históricos.
6. Descontar las cantidades de los productos bloqueados.
7. Aplicar State para pasar a `CONFIRMADO` y guardar el pedido.
8. Construir el DTO. La promesa del servicio solo se resuelve cuando la
   transacción confirma correctamente.

`ProductsRepository.findByIdsForUpdate` requiere una transacción activa. Los
bloqueos duran hasta commit o rollback. Otra compra del mismo producto debe
esperar y después verifica las existencias actualizadas. El orden por identificador
reduce bloqueos cruzados entre pedidos con varios productos. Las consultas fijas
anteriores permanecen intactas.

## State

**Señal:** el dominio define operaciones permitidas según el estado, transiciones
prohibidas y una condición adicional para cancelar un confirmado.

**Justificación:** usamos State para centralizar las transiciones permitidas del
pedido y rechazar cambios incompatibles con su estado actual.

`order-state.ts` contiene el tipo de estado y un mapa de transiciones:

| Origen     | Destinos documentados                          |
| ---------- | ---------------------------------------------- |
| PENDIENTE  | CONFIRMADO, CANCELADO                          |
| CONFIRMADO | PREPARANDO, CANCELADO con evaluación adicional |
| PREPARANDO | EN_CAMINO                                      |
| EN_CAMINO  | ENTREGADO                                      |
| ENTREGADO  | Ninguno                                        |
| CANCELADO  | Ninguno                                        |

Este proceso solo ejecuta `PENDIENTE → CONFIRMADO`. La función rechaza por defecto
`CONFIRMADO → CANCELADO`; un futuro caso de uso debe evaluar la condición de
cancelación antes de autorizarla explícitamente. La función no consulta entregas
ni implementa esa operación. No existe `PREPARANDO → CANCELADO`.

El patrón se mantiene como mapa y función, sin jerarquías de clases. El segundo
patrón, Specification, se implementa y justifica en
[el proceso de entregas](proceso-entregas.md#segundo-patrón-specification).

## Pruebas

Las unitarias simulan los repositorios y la frontera transaccional. Cubren compra
con varias líneas, DTOs inválidos y campos adicionales, duplicados, recursos
inexistentes/inactivos, inventario insuficiente, tiendas mezcladas, importes
exactos y desbordamiento, precios y tarifa del servidor, conservación histórica,
transiciones válidas/inválidas y salida mediante DTOs. Verifican también el SQL
parametrizado y `FOR UPDATE` del repositorio sin abrir una conexión.

`orders-business.integration-spec.ts` utiliza la infraestructura existente de
PostgreSQL 16 con Testcontainers, nueve entidades, dos migraciones reales y
`synchronize: false`. Resuelve los proveedores de `OrdersModule` con el DataSource
temporal, sin importar AppModule ni cargar `.env`. Contiene tres casos:

1. Confirma la compra, verifica inventario y comprueba que cambios posteriores en
   precio y tarifa no alteran los importes históricos.
2. Instala un trigger exclusivo de la base temporal que falla al confirmar el
   pedido. Antes de fallar, el propio trigger verifica que ya existen detalles y
   que el inventario fue descontado. Tras el rollback no hay pedido ni detalles y
   las existencias originales siguen disponibles.
3. Ejecuta dos compras concurrentes de la última unidad: una confirma y la otra
   recibe la excepción de inventario insuficiente. Queda un único pedido.

El rollback de entregas ya existía y sigue intacto; esta nueva prueba verifica el
proceso de pedidos, no se presenta como necesaria para añadir un segundo rollback
a la rúbrica. La concurrencia comprueba una regla explícita de la propuesta y el
bloqueo introducido.

La limpieza elimina el trigger y su función, vacía solo tablas del contenedor,
cierra el módulo de pruebas y detiene la base mediante el helper existente. No
se ejecutan seeds globales ni se utilizan bases externas.

## Cobertura y verificación real

Validación local del 22 de septiembre de 2026, en `feat/order-business-process`:

| Comprobación                                            | Resultado                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| Prettier sobre archivos del cambio                      | Aprobado                                                          |
| ESLint del backend, sin autofix global                  | Aprobado                                                          |
| `npx tsc --noEmit --incremental false -p tsconfig.json` | Aprobado                                                          |
| `npm run build`                                         | Aprobado                                                          |
| `npm test -- --runInBand`                               | 90 pruebas, 6 suites aprobadas                                    |
| `npm run test:cov -- --runInBand`                       | 90 pruebas, 6 suites aprobadas                                    |
| `npm run test:integration`                              | 13 pruebas, 6 suites aprobadas; unos 10 segundos                  |
| `git diff --check`                                      | Aprobado                                                          |
| Docker después de integración                           | Sin contenedores activos ni contenedores de integración restantes |

Se reutiliza la configuración Jest de `package.json` y el script `test:cov`.
No se crea `jest-business.json`. Se incluyen servicios, DTOs, mappers, excepciones,
dominio y adaptador transaccional de **pedidos y entregas**, incluso archivos sin
cobertura. Se excluyen entidades, repositorios, interfaces, módulos y pruebas,
porque el porcentaje solicitado corresponde a la capa de negocio.

| Métrica conjunta | Resultado         |
| ---------------- | ----------------- |
| Sentencias       | 93,61 % (293/313) |
| Ramas            | 87,82 % (101/115) |
| Funciones        | 89,58 % (43/48)   |
| Líneas           | 93,39 % (283/303) |

El umbral global es 70 % para las cuatro métricas. El adaptador transaccional se
simula en las unitarias y se ejecuta realmente en integración; no se mezclan ambas
ejecuciones para calcular esta cobertura. El reporte conserva las partes no
cubiertas, incluidos DTOs y caminos del proceso de entregas.

CI usa ahora `npm run test:cov -- --runInBand` en el paso unitario: ejecuta todas
las unitarias, imprime el reporte y falla si no cumple el umbral. Conserva
integración y los demás pasos/jobs. Los reportes HTML, LCOV y JSON quedan en
`apps/backend/coverage/`, ignorado por Git. Los resultados anteriores corresponden
a la validación local original. El [CI de develop](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/35816057244)
del commit `556eed10d0215e52215d964bbb14e5c7e13d8402` terminó con `success`,
incluyendo cobertura e integración. La evidencia local actualizada del cierre de
entregas está en [proceso-entregas.md](proceso-entregas.md#verificación-local-y-cobertura);
el CI de esa corrección sigue pendiente de publicación.

## Límites y continuación

Quedan fuera del bloque autenticación y autorización HTTP, operaciones posteriores
a `CONFIRMADO`, restitución de inventario por cancelación y adopción del mapa de
estados en otros servicios. No se modifica el proceso de entregas. La frontera DTO
se garantiza para este nuevo servicio; no se transforma la API histórica de
productos. La revisión conjunta de los dos patrones y de la rúbrica se documenta
en [proceso-entregas.md](proceso-entregas.md#evidencia-de-ci-y-revisión-de-rúbrica).
