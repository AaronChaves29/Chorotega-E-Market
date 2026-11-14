# Explorar emprendimientos

## Alcance y referencia visual

Ruta privada: `/mercado`. Referencia: [Figma, frame 2023:52310](https://www.figma.com/design/Ogxj2qKjAbnS2jf94si9Os/Chorotega-E-Market?node-id=2023-52310).

Se implementó a partir de la exportación PNG «Chorotega 2.0 · Explorar emprendimientos» proporcionada para esta tarea. Figma MCP no entregó contexto del frame por su cuota del plan Starter y no se volvió a consultar. No se utilizó la captura como imagen de la aplicación.

Se conserva la composición de escritorio: encabezado autenticado, presentación, recuadro de región, buscador, ordenamiento, filtros laterales y tres tarjetas por fila a 1440 px. Se reutilizan el emblema, las fuentes locales DM Serif Display, Inter y Work Sans, sus licencias y el icono de tienda ya incorporados en la landing. Los estilos están aislados en un CSS Module. No se modificó la landing ni sus recursos.

Colores: crema `#f7f3ea`, verde `#244f3e`, títulos `#203b30` y vino `#702b3d`. El indicador de ubicación es un SVG basado en la captura; no se obtuvo el vector original del frame.

## Datos y navegación

- El listado utiliza `Store` y `PaginatedResponse` existentes. Los nombres, descripciones, direcciones y conteos provienen de NestJS y PostgreSQL.
- No se agregan datos de muestra a la aplicación. Los registros de las pruebas automatizadas se crean exclusivamente en PostgreSQL temporal.
- Todas las tiendas carecen de fotografía en el contrato actual; las tarjetas muestran una ilustración con el texto **Sin fotografía**, sin asociar imágenes genéricas a negocios reales.
- No existen páginas individuales de tienda en este bloque. Para CLIENTE, **Crear un pedido** lleva a `/pedidos/nuevo`; se aclara que la selección de tienda y productos ocurre en ese formulario. No preselecciona automáticamente la tarjeta.
- Se agrega **Explorar emprendimientos** al menú del cliente, conservando **Mis pedidos** como primer enlace y su navegación por teclado.
- Otros roles autenticados pueden consultar tiendas conforme al backend existente, pero no reciben la acción de compra reservada a CLIENTE.

## Consultas y compatibilidad

El navegador consulta `/api/stores`; únicamente el intermediario servidor utiliza `API_URL` y la cookie HttpOnly para enviar el JWT al backend. Las consultas no se realizan directamente desde el navegador a NestJS.

| Parámetro del intermediario | Comportamiento                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| `nombre`                    | Búsqueda por nombre; máximo 150 caracteres. Se recortan espacios exteriores.   |
| `page`                      | Entero no negativo, desde cero.                                                |
| `size`                      | Entero entre 1 y 100. El explorador utiliza 6.                                 |
| `sortBy`                    | Whitelist: `nombre` o `idTienda`.                                              |
| `sortDirection`             | `ASC` o `DESC`.                                                                |
| `estado`                    | Fijado a `ACTIVA` en el intermediario; no se acepta otro estado del navegador. |

Los parámetros reconocidos repetidos o inválidos producen 400 antes de consultar NestJS. Otros parámetros no se reenvían, incluido `idEmprendedor`. La búsqueda se codifica mediante `URLSearchParams`; el repositorio existente parametriza el SQL y escapa `%`, `_` y `\` para búsqueda literal. No se agregan consultas ni cambios al backend.

La paginación, el conteo y el ordenamiento ocurren en PostgreSQL. El backend conserva su desempate por `idTienda`. Cambiar la búsqueda o el orden reinicia la primera página. El cliente cancela consultas anteriores y evita que respuestas atrasadas reemplacen resultados recientes.

Sin parámetros nuevos, `/api/stores` conserva `page=0`, `size=20`, `estado=ACTIVA`, `sortBy=nombre`, `sortDirection=ASC`. `CreateOrderForm` sigue utilizando ese contrato sin modificaciones.

## Sesión, errores y estados

`/mercado` reutiliza `requireCurrentUser()` y `SessionBoundary`: verifica identidad en el servidor y revalida al recuperar una pestaña o sesión. Sin sesión se utiliza el flujo existente `/api/auth/session` → `/login`.

El intermediario devuelve 401 y elimina la cookie ante una sesión ausente o rechazada. Durante la consulta, un 401 dirige al login. No se envían JWT a componentes, HTML, localStorage ni parámetros de URL.

Se muestran estados de carga, página vacía, ausencia de coincidencias y error con reintento. Los errores HTTP/de red no muestran mensajes internos ni borran una sesión por indisponibilidad. Se valida la estructura necesaria de la respuesta antes de renderizar. React trata los campos de las tiendas como texto; no se usa HTML sin escapar.

## Diferencias funcionales respecto al PNG

- Se omiten filtros por categoría y ubicación: el backend no clasifica tiendas por actividad ni tiene una ubicación estructurada utilizable como filtro. La dirección libre no se presenta como una clasificación geográfica.
- La barra lateral muestra el alcance real **Tiendas activas**, la búsqueda aplicada y limpieza de filtros.
- No se incluyen favoritos, notificaciones ni carrito inexistentes. Se conserva el menú de cuenta existente con la identidad autenticada.
- El buscador incorpora un botón explícito **Buscar**, y admite envío con Enter.
- Las tarjetas muestran datos reales, estado activo y dirección; no las seis copias editoriales del ejemplo ni una categoría no respaldada por datos.
- Se incorpora paginación real. La altura de las tarjetas depende de sus textos, y las variantes móviles son adaptaciones del PNG de escritorio. No se afirma equivalencia píxel a píxel.

Para incorporar categorías comerciales posteriormente se recomienda acordar una taxonomía propia de tiendas, su relación y validación en backend, índices, filtro SQL y contrato documentado. No debe inferirse del nombre del negocio ni de las categorías de sus productos. Las fotografías requieren primero un campo/contrato y un flujo seguro de almacenamiento. Ninguno de estos cambios forma parte de este bloque.

## Verificación local — 14 de noviembre de 2026

Entorno: Node.js 24.21.0, Chrome local y PostgreSQL 16 temporal mediante Testcontainers. No se conectó a Supabase, Atlas ni servicios de producción.

| Comprobación                              | Resultado                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                | 50/50; 27 existentes y 23 nuevas, contando el grupo de parámetros inválidos.                                                                |
| `npm run test:browser`                    | 44/44: 18 escenarios nuevos del explorador, 11 existentes con NestJS/PostgreSQL y 12 de landing con API sintética; incluye 3 pruebas padre. |
| ESLint                                    | Aprobado.                                                                                                                                   |
| TypeScript `--noEmit --incremental false` | Aprobado.                                                                                                                                   |
| `npm run build`                           | Aprobado con Turbopack; `/mercado` dinámico y `/` estático.                                                                                 |
| Responsive                                | 320, 390, 768, 1280 y 1440 px; sin desbordamiento horizontal, fuentes e imágenes cargadas.                                                  |
| Prettier y `git diff --check`             | Aprobados sobre los cambios de este bloque.                                                                                                 |

Los escenarios nuevos cubren consultas SQL reales con 14 tiendas activas y una inactiva, búsqueda combinada con páginas, orden ASC/DESC, desempate, valores literales `%/_`, texto XSS escapado, vacío, limpieza, carga y respuesta anterior cancelada, error 500 seguro y reintento, 400, 401, JWT inválido/vencido, revocación de la cuenta, otros roles y logout. Los fallos se provocan únicamente en la instancia aislada de prueba; no se desactivan guards.

La regresión completa también comprueba registros, recuperación/cambio de sesión, landing pública y creación real de un pedido con NestJS y PostgreSQL temporal. No se ejecutó toda la suite de integración independiente del backend, cuyo código permanece intacto.

En la preparación se corrigió una expectativa de la nueva prueba: buscar `error` también encontraba el texto `onerror` del registro XSS, por lo que no correspondía esperar una página vacía. Se utiliza una búsqueda sin coincidencias y se espera explícitamente el resultado del reintento. También se conservó el orden anterior del menú al comprobar su prueba de teclado. No se atribuyen estas incidencias a fallos de autenticación.

Las pruebas generan capturas y geometría en `chorotega-marketplace-evidence` dentro del directorio temporal del sistema (`mercado-320.png` a `mercado-1440.png`). Se revisaron contra el PNG original. Las capturas contienen solo fixtures locales y no se incorporan como assets. La conexión y los contenedores temporales se cierran al finalizar.

Desde `apps/frontend`, con frontend y backend instalados, Docker y Chrome disponibles:

```bash
npm test
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
npm run test:browser
```

Para ejecutar únicamente la integración nueva, después del build:

```bash
node --test test/browser/marketplace.test.mjs
```

Para una revisión interactiva local, usar la configuración de desarrollo existente con PostgreSQL/MongoDB locales y `API_URL` apuntando al backend local; iniciar backend y `npm run dev` del frontend. Ingresar con una cuenta local y abrir `/mercado`. No cambiar variables para apuntar a producción ni cargar seeds sobre bases existentes.
