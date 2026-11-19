# Fase 12A — Presentación de fechas en Costa Rica

## Base y alcance

Rama: `fix/fechas-zona-horaria-costa-rica`.

Base: `ca123a1c8f58d2337967faa5205755a266392349`, con [CI aprobado de develop](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44459509715).

Esta fase modifica solamente la presentación de fechas y sus pruebas. No cambia instantes, entidades, migraciones, contratos REST, transacciones, estados ni datos históricos. No verifica ni publica cambios en producción.

## Diagnóstico confirmado

| Pantalla                                                             | Campo real                        | Comportamiento anterior                                     | Presentación aplicada                         |
| -------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Historial CLIENTE `/pedidos`                                         | `fechaCreacion`                   | `Intl.DateTimeFormat` sin `timeZone`: depende del navegador | `America/Costa_Rica`                          |
| Listado y detalle del emprendedor `/mi-negocio/tiendas/[id]/pedidos` | `fechaCreacion`                   | Costa Rica explícita en `orderDate`                         | Se conserva; reutiliza el formateador común   |
| Listado y detalle del repartidor `/mis-entregas`                     | `fechaAsignacion`, `fechaEntrega` | Costa Rica explícita en `deliveryDate`                      | Se conserva; reutiliza el formateador común   |
| MVC ADMIN `/admin/deliveries` y `/admin/deliveries/[id]`             | `fechaAsignacion`, `fechaEntrega` | `toISOString()` y etiquetas UTC                             | Costa Rica explícita y etiquetas «Costa Rica» |

No existe actualmente una ruta individual de detalle de pedidos del CLIENTE; su historial muestra tarjetas. El detalle de pedido disponible para el emprendedor utiliza `orderDate`.

La creación del pedido, la asignación al repartidor y la finalización de la entrega representan **eventos diferentes**. No se deben igualar sus horas para corregir una diferencia de presentación. `fechaEntrega = null` sigue mostrando «Pendiente» en MVC y no inventa una fecha en Next.js.

### Recorrido de las fechas

- [Order](../../apps/backend/src/modules/orders/entities/order.entity.ts) y [Delivery](../../apps/backend/src/modules/deliveries/entities/delivery.entity.ts) declaran columnas PostgreSQL `timestamp` sin zona. La migración inicial y los defaults existentes no se modifican.
- [OrderMapper](../../apps/backend/src/modules/orders/mappers/order.mapper.ts) y [DeliveryMapper](../../apps/backend/src/modules/deliveries/mappers/delivery.mapper.ts) entregan objetos `Date`; NestJS los serializa en JSON como ISO con `Z`. Los DTO OpenAPI los describen como `date-time`.
- Los intermediarios Next.js conservan esos valores. [date-time.ts](../../apps/frontend/lib/date-time.ts) aplica `Intl.DateTimeFormat('es-CR', …)` con `timeZone: 'America/Costa_Rica'`, sin sumar/restar horas al dato.
- `orderDate` y `deliveryDate` conservan sus interfaces y delegan en esa utilidad. El historial mantiene su comportamiento anterior ante valores inválidos: muestra el valor original.
- El MVC formatea en su controlador de presentación; los filtros de búsqueda **siguen aceptando ISO 8601 UTC** y sus valores/paginación no se convierten a hora local.

### Limitación de almacenamiento

`timestamp without time zone` no registra por sí solo un offset. La interpretación del driver depende del contexto horario del proceso y de cómo se escribieron los datos. Esta fase comprueba el recorrido con PostgreSQL temporal y los mismos procesos de escritura/lectura; **no demuestra la convención de todos los datos históricos de producción ni su comportamiento al cambiar la zona del servidor**. No se cambia `TZ`, la conexión, el driver ni el esquema. Una revisión de almacenamiento requeriría otra tarea y evidencia propia. **Verificar esta convención histórica será requisito de la preparación del despliegue final**, antes de autorizar producción.

La consistencia aquí comprobada corresponde a instantes recibidos por la API con `Z` u offset explícito, no a reinterpretar cadenas ambiguas sin zona.

## Pruebas

Ejecutadas con Node.js **22.22.0** y Chrome **158.0.8127.36**, exclusivamente en local:

- Frontend unitarias: **347/347**, incluidas seis nuevas pruebas de límites de fecha, offsets equivalentes y procesos con `TZ=UTC`, `America/Costa_Rica` y `Asia/Tokyo`.
- Backend unitarias: **724/724**, 48 suites; incluyen **68/68** casos HTTP MVC afectados y dos casos nuevos de medianoche. Mantienen autorización, CSRF, PRG y filtros existentes.
- Nueva integración de navegador: **6/6** (un escenario padre y cinco subpruebas) en [date-time.test.mjs](../../apps/frontend/test/browser/date-time.test.mjs). Chrome → Next compilado → NestJS → PostgreSQL temporal, sin mockear las respuestas HTTP.
- Los instantes `2026-11-19T05:59:00.000Z` y `2026-11-19T06:00:00.000Z` deben mostrarse como **18 nov 2026, 11:59 p. m.** y **19 nov 2026, 12:00 a. m.**, respectivamente.
- El navegador cambia su zona mediante CDP y comprueba texto visible, atributos `datetime` existentes y fechas devueltas por REST. La entrega utiliza un instante posterior distinto y se comprueba que no sustituye a la asignación. Al terminar se releen las fechas persistidas para verificar que las consultas no las cambiaron.
- Esta nueva prueba prepara cuentas sintéticas y JWT válidos mediante el soporte local; no pretende probar por sí sola el formulario de login. Las regresiones existentes cubren la autenticación y el flujo de los cuatro roles.
- Regresiones existentes de navegador, ejecutadas secuencialmente: **58/58**, sin fallos. Incluyen el panel del repartidor, pedidos del emprendedor y el escenario integral CLIENTE → EMPRENDEDOR → ADMIN MVC → REPARTIDOR → CLIENTE. No se modificaron estos tests ni se repitieron para obtener un resultado verde.
- ESLint, TypeScript y builds de frontend y backend: aprobados. Prettier, seis enlaces locales del documento y `git diff --check`: aprobados.
- La primera tentativa de navegador no pudo iniciar PostgreSQL porque Docker Desktop estaba detenido; se inició Docker y se ejecutó la prueba correctamente. No se cambiaron timeouts ni se añadieron reintentos al test.

### Validación adicional previa a publicación

Además de los resultados anteriores, que se conservan como ejecuciones independientes, se ejecutaron con Node.js 22.22.0:

- **Integración completa del backend: 831/831, 33/33 suites**, en 148,251 segundos. Comando: `npm run test:integration`.
- **Batería completa de navegador frontend: 233/233, 12 archivos**, en 80,542 segundos. Comando: `npm run test:browser -- --test-concurrency=1`; archivos secuenciales, sin alterar la configuración ni los timeouts de las pruebas.
- Ambas ejecuciones finalizaron con código 0, sin reintentos, usando bases PostgreSQL temporales. Los registros se conservaron fuera del repositorio y no se incluyen capturas ni datos de esas ejecuciones en el commit.

No se ejecutaron pruebas contra proveedores de producción ni una suite E2E adicional separada de estas ejecuciones. Los incidentes históricos de timeout, transporte HTTP y Chrome no se consideran corregidos por estos resultados.

### Comandos reproducibles

Usar Node.js 22.22.0, dependencias ya instaladas y Docker Desktop activo. El soporte de pruebas crea y elimina PostgreSQL efímero, sin leer conexiones productivas.

```sh
cd apps/frontend
npm test
npm run lint
npx --no-install tsc --noEmit
npm run build
node --test test/browser/date-time.test.mjs
node --test --test-concurrency=1 test/browser/managed-orders.test.mjs test/browser/courier-deliveries.test.mjs test/browser/marketplace-four-roles.test.mjs
```

```sh
cd apps/backend
npm test -- --runInBand
npm run lint
npx --no-install tsc --noEmit
npm run build
```

No ejecutar el comando de arranque productivo ni migraciones remotas para validar esta corrección.
