# Prueba integral del marketplace con cuatro roles

## Objetivo

Seguir el mismo pedido desde la selección de un producto en `/mercado` hasta que el cliente lo ve como **Entregado** en `/pedidos`. La prueba comprueba el resultado en la interfaz y en PostgreSQL.

## Arquitectura y datos

Chrome headless usa la aplicación Next.js compilada, su BFF y la autenticación habitual. El panel administrativo se abre directamente en el origen MVC de NestJS y establece su propia sesión. NestJS se ejecuta con los módulos funcionales y las vistas reales. `createHttpTestApp` arranca PostgreSQL 16 con Testcontainers y aplica las migraciones mediante `postgres-test-database.ts`. El lanzador y la conexión a Chrome se reutilizan desde `test/browser/support.mjs`.

Los fixtures crean seis usuarios de `example.test`, una tienda activa, una categoría, un producto con 10 unidades, un barrio con tarifa de 1,25 y dos repartidores disponibles. Se generan la contraseña y el secreto JWT para cada ejecución. La dirección es ficticia. Las operaciones principales se realizan mediante controles y formularios reales. La lectura directa de PostgreSQL comprueba el estado guardado. Todo el flujo utiliza servicios locales y una base temporal.

## Recorrido y persistencia

| Rol           | Interacción en Chrome                                                                                                                                   | Comprobación                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cliente       | Inicia sesión, abre la tienda desde el mercado, agrega dos unidades, selecciona el barrio y confirma con doble clic.                                    | Un único pedido `CONFIRMADO`, dos unidades a 10,25, subtotal de 20,50, tarifa de 1,25, total de 21,75 e inventario de 10 a 8.                                                   |
| Emprendedor   | Inicia sesión como propietario, abre el pedido desde su tienda y confirma la preparación.                                                               | El pedido original queda `PREPARANDO`. Otro emprendedor recibe 404 al consultar o intentar preparar ese pedido.                                                                 |
| Administrador | Inicia una sesión MVC, abre Entregas y envía el formulario con el pedido y el repartidor. Se prueba primero un CSRF inválido y después el token válido. | El formulario inválido devuelve 403 y preserva los datos. El válido crea una única entrega `ASIGNADA` y el repartidor pasa a `OCUPADO`.                                         |
| Repartidor    | Abre el listado y el detalle, consulta el destino, inicia y completa la entrega.                                                                        | El destino corresponde al pedido y sigue visible en `EN_CAMINO`. Al finalizar, la entrega queda `ENTREGADA`, el pedido queda `ENTREGADO` y el repartidor vuelve a `DISPONIBLE`. |
| Cliente       | Vuelve a iniciar sesión y abre su historial.                                                                                                            | La única tarjeta muestra el mismo ID y dirección con estado **Entregado**. La base conserva un pedido y una entrega.                                                            |

## Autorización y rechazos

El recorrido compara los registros de pedidos, líneas, inventario, entregas y repartidores antes y después de cada rechazo. Comprueba asignación por un cliente, consulta y preparación por un emprendedor ajeno, JWT inválido y vencido, CSRF inválido, destino ajeno, ID inválido, asignación de un pedido aún confirmado, finalización antes del inicio y duplicados de asignación, inicio y finalización. Tras la entrega comprueba que el REST y el BFF respondan 404 sin incluir la dirección.

Dos casos usan las regresiones existentes. El formulario MVC prueba asignar un pedido distinto a un repartidor ocupado. La prueba de carrito deja que el POST real devuelva 201 y simula que se pierde la respuesta antes de que llegue a la interfaz. Comprueba que una recarga conserve la compra bloqueada y el mismo número de pedidos.

## Reproducción

Se requieren Node.js 24, las dependencias de ambos proyectos, Docker con contenedores Linux y Chrome o Chromium. Si Chrome se encuentra en una ubicación distinta a las detectadas por el repositorio, se puede indicar con `CHROME_BIN`.

Desde la raíz del repositorio, en PowerShell:

```powershell
npm.cmd --prefix apps/backend ci
npm.cmd --prefix apps/frontend ci
npm.cmd --prefix apps/frontend run build
npm.cmd --prefix apps/backend run build
Push-Location apps/frontend
node --test test/browser/marketplace-four-roles.test.mjs
node --test --test-concurrency=1 test/browser/cart.test.mjs test/browser/managed-orders.test.mjs test/browser/courier-deliveries.test.mjs
Pop-Location
npm.cmd --prefix apps/frontend test
npm.cmd --prefix apps/backend test -- --runInBand
npm.cmd --prefix apps/backend run test:integration
npm.cmd --prefix apps/backend run test:integration -- --testPathPatterns=admin-
npm.cmd --prefix apps/backend run test:browser
npm.cmd --prefix apps/frontend run lint
npm.cmd --prefix apps/backend run lint
Push-Location apps/frontend
node node_modules/typescript/bin/tsc --noEmit
Pop-Location
Push-Location apps/backend
node node_modules/typescript/bin/tsc --noEmit --incremental false
Pop-Location
node apps/backend/node_modules/prettier/bin/prettier.cjs --check apps/frontend/test/browser/marketplace-four-roles.test.mjs apps/frontend/test/browser/cart.test.mjs apps/frontend/test/browser/support.mjs docs/testing/flujo-integral-cuatro-roles.md
git diff --check
```

La prueba imprime la carpeta temporal donde guarda los PNG. Cada etapa se captura a 390 y 1280 píxeles y comprueba que la página no desborde horizontalmente. Las capturas verifican dos anchos en Chrome de escritorio. La prueba de sesión vencida usa un JWT sintético ya expirado en lugar de esperar al final de una sesión de navegador.

## Resultados locales

La rama `test/flujo-integral-cuatro-roles` parte de `develop` en `d2752b6f25f973ac8da890d6c6b66f119d7c0c90`. El CI posterior al PR #149 completó los trabajos de frontend y backend con éxito y omitió el despliegue. [GitHub Actions](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/44433622627)

| Verificación                      | Resultado                                            |
| --------------------------------- | ---------------------------------------------------- |
| Flujo integral aislado            | 1/1                                                  |
| Carrito en Chrome                 | 20/20                                                |
| Pedidos del emprendedor en Chrome | 28/28                                                |
| Entregas del repartidor en Chrome | 29/29                                                |
| HTTP administrativo               | 42/42, 2 suites                                      |
| Integración completa de backend   | 831/831, 33 suites                                   |
| Chrome MVC                        | 28/28                                                |
| Unitarias frontend                | 341/341                                              |
| Unitarias backend                 | 722/722, 48 suites                                   |
| Builds, ESLint y TypeScript       | Aprobados en frontend y backend                      |
| Prettier                          | Aprobado en los cuatro archivos de texto del cambio. |
| `git diff --check`                | Aprobado                                             |

En la revisión final, la prueba integral y las tres regresiones de Chrome se ejecutaron juntas con la espera actual y aprobaron 78 de 78. La espera comprueba el cambio observable de tipo del campo de contraseña mediante su control de visibilidad. El campo vuelve a quedar oculto antes de ingresar credenciales. También se repitieron ESLint en los tres archivos de prueba, Prettier y la comprobación del diff. Los demás resultados de la tabla corresponden a la ejecución original y se conservan como evidencia del mismo código de aplicación.

## Capturas

Chrome resta los 15 píxeles de la barra de desplazamiento vertical al PNG de página completa del pedido preparando. Esa página se probó con los mismos anchos de ventana.

Las 16 capturas proceden de la ejecución integral aprobada de Fase 11. En las dos vistas de entrega asignada el destino ya estaba cargado al capturar, por lo que ambas muestran el mismo estado. En la confirmación móvil el encabezado abrevia el nombre sintético con puntos suspensivos. El contenido del pedido y sus controles se ven completos.

| Etapa                    | 390 px                                                                           | 1280 px                                                                                |
| ------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Pedido confirmado        | [Móvil](evidencias/flujo-integral-cuatro-roles/01-pedido-confirmado-390.png)     | [Escritorio](evidencias/flujo-integral-cuatro-roles/01-pedido-confirmado-1280.png)     |
| Pedido preparando        | [Móvil](evidencias/flujo-integral-cuatro-roles/02-pedido-preparando-390.png)     | [Escritorio](evidencias/flujo-integral-cuatro-roles/02-pedido-preparando-1280.png)     |
| Formulario de asignación | [Móvil](evidencias/flujo-integral-cuatro-roles/03-formulario-asignacion-390.png) | [Escritorio](evidencias/flujo-integral-cuatro-roles/03-formulario-asignacion-1280.png) |
| Entrega asignada         | [Móvil](evidencias/flujo-integral-cuatro-roles/04-entrega-asignada-390.png)      | [Escritorio](evidencias/flujo-integral-cuatro-roles/04-entrega-asignada-1280.png)      |
| Destino autorizado       | [Móvil](evidencias/flujo-integral-cuatro-roles/05-destino-autorizado-390.png)    | [Escritorio](evidencias/flujo-integral-cuatro-roles/05-destino-autorizado-1280.png)    |
| Entrega en camino        | [Móvil](evidencias/flujo-integral-cuatro-roles/06-entrega-en-camino-390.png)     | [Escritorio](evidencias/flujo-integral-cuatro-roles/06-entrega-en-camino-1280.png)     |
| Entrega finalizada       | [Móvil](evidencias/flujo-integral-cuatro-roles/07-entrega-entregada-390.png)     | [Escritorio](evidencias/flujo-integral-cuatro-roles/07-entrega-entregada-1280.png)     |
| Historial del cliente    | [Móvil](evidencias/flujo-integral-cuatro-roles/08-historial-cliente-390.png)     | [Escritorio](evidencias/flujo-integral-cuatro-roles/08-historial-cliente-1280.png)     |

## Incidencias

El primer intento de acceso de cliente agotó la espera. La ejecución conjunta inicial registró 60 de 77 aprobadas, con los 17 fallos en la suite de carrito tras el problema de acceso. La prueba integral y la regresión de carrito ahora esperan a que React conecte el formulario antes de escribir y enviar. Carrito aprobó 20 de 20 en aislamiento y la repetición conjunta aprobó 77 de 77 con las expectativas y tiempos existentes.

Los antecedentes de 401 en Users y `socket hang up` en MVC siguen registrados con causa sin demostrar. La investigación de Fase 9B también documenta errores de transporte intermitentes. [Informe MVC](../laboratory/lab-06/admin-mvc.md#revisión-y-evidencia-de-fallos-intermitentes) · [Investigación de transporte](../backend/administracion-entregas.md)

## Zona horaria pendiente

`apps/frontend/components/orders-list.tsx` formatea la creación del pedido con la zona predeterminada del navegador. `apps/frontend/lib/courier-deliveries.ts` fija `America/Costa_Rica` para las fechas del reparto y `apps/frontend/lib/managed-orders.ts` ya fija esa misma zona para la gestión del emprendedor. Las capturas muestran la creación y la asignación en días distintos. Son eventos diferentes y la gestión del emprendedor también muestra la fecha de creación del historial. Las capturas por sí solas no demuestran que la configuración del navegador explique toda la diferencia. [Historial](evidencias/flujo-integral-cuatro-roles/08-historial-cliente-1280.png) · [Preparación](evidencias/flujo-integral-cuatro-roles/02-pedido-preparando-1280.png) · [Detalle de entrega](evidencias/flujo-integral-cuatro-roles/05-destino-autorizado-390.png)

En una rama independiente, agregar `timeZone: "America/Costa_Rica"` al formateador del historial del cliente, con la misma configuración regional y el mismo comportamiento ante valores inválidos. Un mismo instante debe producir la misma fecha y hora local en todas las vistas, con independencia de la zona del navegador. Antes de atribuir la diferencia al formato, comparar los ISO que entrega la API con la hora de cada transición y comprobar la interpretación de las columnas `TIMESTAMP` al pasar de PostgreSQL a Node.js.

Probar `2026-11-19T05:59:00Z` y `2026-11-19T06:00:00Z`. En Costa Rica corresponden a las 23:59 del 18 y a las 00:00 del 19. Usar la misma entrada en las vistas bajo zonas de navegador distintas, por ejemplo UTC y America/Costa_Rica. Añadir un caso que cree y asigne un pedido a ambos lados de medianoche y compruebe que la API y las pantallas preserven la secuencia de los instantes.
