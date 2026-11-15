# Implementación 3: navegación del cliente y detalle de tienda

## Alcance y referencia

Se implementaron la navegación del cliente y `/tiendas/[id]` en `feature/detalle-tienda-figma`, desde `948f253fb61e20e3941850288e1b10d74c92d6cb`, con PR #137 integrado y [CI de la base aprobado](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/43652492341). Esto no implica aprobación remota de estos cambios locales.

Referencia: exportación PNG original «Chorotega 2.0 · Artesanías Chorotega», [frame 2023:52163](https://www.figma.com/design/Ogxj2qKjAbnS2jf94si9Os/Chorotega-E-Market?node-id=2023-52163). Se inspeccionó la imagen local proporcionada; no se consultó Figma MCP ni se utilizó la captura como asset.

## Navegación conservada

- `accountDestination` envía CLIENTE a `/mercado`; ADMIN, EMPRENDEDOR y REPARTIDOR permanecen en `/cuenta`.
- Se conserva `/login` → `/acceso` → identidad vigente → destino por rol. `/api/auth/session` reutiliza esa función para recuperar la sesión.
- `MarketplaceHeader` comparte el encabezado entre mercado y tienda. La navegación principal contiene **Explorar** y el menú de cuenta; **Mis pedidos** permanece únicamente en el dropdown del cliente.
- `AccountMenu` mantiene teclado, Escape, cierre al seleccionar, identidad y logout. No necesitó modificaciones.
- Las tarjetas de `/mercado` ofrecen **Ver tienda** para su ID real. Se mantienen búsqueda, ordenamiento y paginación existentes.
- El breadcrumb de la tienda permite volver a `/mercado`.

El destino de CLIENTE sustituye el descrito en las implementaciones anteriores; sus verificaciones históricas no cambian.

## Datos reales y contratos

La página utiliza `requireCurrentUser()` y `SessionBoundary`, sin cambios en JWT, cookies HttpOnly o permisos del backend.

| Ruta Next.js                    | Consulta NestJS                                                | Comportamiento                                               |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /api/stores/[id]`          | `GET /api/v1/stores/:id`                                       | ID positivo de PostgreSQL, sesión requerida y tienda activa. |
| `GET /api/stores/[id]/products` | `GET /api/v1/stores/:id` y `GET /api/v1/products?idTienda=...` | Revalida tienda activa antes de consultar sus productos.     |

React consulta los intermediarios del mismo origen. Solo el servidor lee la cookie y envía Bearer a NestJS. Las respuestas seleccionan explícitamente los campos necesarios y no reenvían relaciones, credenciales o errores internos. Todas usan `Cache-Control: no-store`.

Los estados HTTP del intermediario incluyen 400 para identificadores/parámetros inválidos, 401 para sesión ausente/rechazada, 404 para tienda inexistente/inactiva y errores seguros ante indisponibilidad o contrato inesperado. Un 401 elimina la cookie y dirige al login. La página muestra esos estados sin productos privados; los errores transitorios permiten reintentar sin cerrar sesión. La ruta de página sirve el contenedor autenticado y los estados de recurso proceden del intermediario.

Se muestran nombre, descripción, dirección, estado activo y teléfono/horario cuando existen. Si la tienda deja de estar disponible durante la visita, el 404 de la siguiente consulta retira su presentación y productos. Estas lecturas son instantáneas del estado consultado; no constituyen una transacción distribuida entre endpoints.

## Productos y disponibilidad

La consulta está fijada por el ID de la ruta y `estado=ACTIVO`. No muestra productos de otras tiendas, INACTIVO ni AGOTADO. Los productos ACTIVO con cantidad cero se muestran como **Sin existencias**, sin acción de compra.

| Parámetro         | Valores                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `page`            | Entero no negativo desde cero.                                                           |
| `size`            | 1–100; la página utiliza 6.                                                              |
| `sortBy`          | `nombre`, `precio`, `idProducto`.                                                        |
| `sortDirection`   | `ASC`, `DESC`; conserva el desempate del backend por ID.                                 |
| `soloDisponibles` | `true` envía `disponible=true`; `false` omite ese filtro para incluir activos sin stock. |

Valores predeterminados: página 0, tamaño 6, nombre ASC, todos los productos ACTIVO. Se rechazan parámetros desconocidos o repetidos; el cliente no puede cambiar `idTienda` ni `estado` mediante query. El backend realiza filtrado, conteo, ordenamiento y paginación en PostgreSQL, sin filtrar ni ordenar páginas en memoria.

`precio` permanece como string. La presentación usa partes monetarias de `Intl` y conserva los céntimos sin convertir el importe decimal a coma flotante. El stock proviene de `cantidadDisponible` y no garantiza disponibilidad futura: la compra vuelve a validarlo en el proceso transaccional existente.

Las consultas anteriores se cancelan y no sustituyen resultados nuevos. Se implementan carga, vacío, error, reintento y regreso a la primera página cuando corresponde.

## Compra y compatibilidad

CLIENTE dispone de **Continuar al pedido** para productos con existencias. Lleva a `/pedidos/nuevo`; el texto aclara que allí se eligen tienda y productos y que no se agregan automáticamente.

No se implementó preselección por URL. El formulario administra selección, paginación de tiendas y cantidades conjuntamente; introducir una tienda externa a su página requeriría validar y reconciliar ese estado. Se conserva el flujo aprobado como permite el alcance, sin presentar la URL como autorización.

No se modifican `CreateOrderForm`, `/api/products`, `/api/orders`, reglas monetarias, inventario o validación final del backend. El intermediario nuevo evita alterar los defaults usados para comprar: tamaño 20, productos ACTIVO con existencias, nombre ASC.

## Correspondencia visual y diferencias

Se conserva encabezado, breadcrumb, presentación verde con título serif, grilla de tres productos a 1440 px, tarjetas blancas, área visual crema y botones verdes. Se reutilizan emblema, fuentes locales DM Serif Display/Inter/Work Sans y SVG de tienda/paquete existentes. No se descargaron ni duplicaron assets.

Diferencias intencionales:

- No se asignan las fotografías de cerámica del ejemplo a tiendas/productos reales: ambos contratos carecen de imágenes. Las alternativas están identificadas como **Sin fotografía**.
- Nombre, descripción, precio, cantidad, dirección, teléfono, horario y conteos proceden de datos; no se fija «Artesanías Chorotega», una categoría comercial ni seis productos.
- Se omiten redes sociales, favoritos, notificaciones y carrito sin soporte funcional. El botón continúa al pedido; no simula agregar al carrito.
- No hay búsqueda de productos por nombre ni orden «Novedades»: `ProductSearchQueryDto` no ofrece nombre como filtro ni fecha como columna de orden. Se ofrece el filtro real de existencias y órdenes admitidos, sin búsqueda parcial en memoria.
- Se agrega información de contacto y disponibilidad que aporta el backend. La altura depende de los textos reales.
- Móvil/tablet son adaptaciones del PNG de escritorio. No se afirma igualdad automática píxel a píxel.

## Verificación local — 14 de noviembre de 2026

Entorno: Node.js 24.21.0, Chrome y PostgreSQL 16 temporal mediante Testcontainers. No se utilizaron bases existentes ni conexiones remotas. Los datos y migraciones de pruebas se ejecutan únicamente dentro de contenedores temporales.

| Comprobación              | Resultado                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitarias frontend        | 82/82; incluye validación de IDs, parámetros, sesión, proyección de respuestas, errores y precios.                                                                           |
| Navegador completo        | 66/66: 12 escenarios de cuenta/compra, 18 de mercado, 20 de detalle con NestJS/PostgreSQL temporal y 12 de landing con API sintética; incluye cuatro pruebas padre.          |
| Navegación aprobada       | Login y recuperación CLIENTE → mercado; demás roles → cuenta; pedidos en dropdown; teclado y logout.                                                                         |
| Detalle e integración     | Tienda real, productos propios, stock cero, contactos opcionales, vacío, 400/401/404, tienda inactiva, desactivación durante visita, errores/reintento y texto XSS escapado. |
| Consultas                 | Páginas de 6/2 productos, órdenes por nombre/precio/ID, desempate y filtro SQL de existencias; respuesta anterior cancelada no sobrescribe resultados.                       |
| Compra real               | Desde detalle al formulario, selección explícita, pedido confirmado por 4500.24 y stock del producto de 10 a 8 en PostgreSQL temporal.                                       |
| Responsive                | 320, 390, 768, 1280, 1440 px; sin scroll horizontal ni recursos rotos.                                                                                                       |
| ESLint, TypeScript, build | Aprobados; build estándar con Turbopack.                                                                                                                                     |
| Formato y diff            | Prettier sobre cambios y archivos nuevos; se conserva el formato histórico fuera de cambios en pruebas antiguas. `git diff --check` sin errores.                             |

La etapa inicial de navegación había aprobado 50 unitarias y 45 pruebas de navegador; los resultados anteriores corresponden a la implementación completa. No se ejecutó toda la suite independiente del backend, cuyo código no se modificó.

Durante la preparación se ajustó la prueba nueva para reutilizar un login ya cargado, comprobar el texto del estado sin depender de la transformación visual a mayúsculas y mantener variables de evaluación dentro de funciones. No se cambiaron Auth ni expectativas de autenticación para conseguir resultados verdes. El servidor local de cuenta utiliza `localhost`, como los otros soportes, para conservar el host de las cookies al seguir redirects absolutos locales.

Las pruebas guardan capturas y geometría en `chorotega-store-detail-evidence` y `chorotega-marketplace-evidence` dentro del directorio temporal del sistema. Se revisaron las capturas contra el PNG original; contienen exclusivamente fixtures locales. Los contenedores, Next.js y Chrome se cierran al terminar.

Desde `apps/frontend`, con dependencias de frontend/backend, Docker y Chrome disponibles:

```bash
npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
npm run test:browser
```

Solo la integración del detalle, después del build:

```bash
node --test test/browser/store-detail.test.mjs
```

Para una revisión interactiva, iniciar backend y frontend con configuración explícita local, autenticar una cuenta local y abrir `/mercado` → **Ver tienda**. No apuntar `API_URL` a producción ni cargar seeds sobre bases existentes.
