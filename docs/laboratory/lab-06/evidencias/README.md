# Inventario de capturas del Laboratorio 6

Se inspeccionaron visualmente los cinco originales de la carpeta local proporcionada, sin acceder a sesiones ni servicios remotos. Se copiaron tres archivos JPEG sin edición ni conversión; se verificó igualdad byte a byte con sus originales. No se reconstruyen imágenes, no se generan capturas y no se usan nombres PNG para archivos JPEG.

## Archivos incorporados

| Archivo                                              | Criterio y observación verificable                                                                                               | Límites y fecha                                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [mvc-productos.jpeg](mvc-productos.jpeg)             | MVC, 2,5 puntos: listado con tres productos, total y página 1. Botones de creación, navegación y logout visibles.                | No muestra URL, rol autenticado, cambio de página, alta, validación, PRG ni CSRF. Producción es procedencia reportada. Nombre original fechado 22 de octubre de 2026; fecha exacta de la interacción no comprobada.   |
| [render-deploy.jpeg](render-deploy.jpeg)             | Despliegue, 2,5 puntos: servicio Live, backend público HTTPS, rama `main` y d45b97c, concordante con el código auditado y su CI. | Estado en el momento de la captura; no muestra migraciones ni fecha de captura. Identificador de servicio no es una credencial.                                                                                       |
| [supabase-postgresql.jpeg](supabase-postgresql.jpeg) | Despliegue, 2,5 puntos: proyecto Healthy y base primaria PostgreSQL.                                                             | No muestra el historial TypeORM, tablas ni TLS del cliente. «No migrations» no consulta `typeorm_migrations`; «No backups» no demuestra respaldo. Los gráficos muestran 22 de octubre, no la fecha exacta de captura. |

En estas tres imágenes no se observaron contraseñas, JWT, cookies, claves API, cadenas de conexión con credenciales ni datos personales innecesarios. La URL pública de proyecto que aparece en Supabase no es una cadena de conexión PostgreSQL ni una clave API. Las imágenes se insertan una sola vez, por criterio, en [entrega-final.md](../entrega-final.md).

## Archivos revisados y excluidos

| Original local                               | Motivo de exclusión                                                                                                                                                                                                            | Acción necesaria                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WhatsApp Image 2026-10-22 at 12.47.36.jpeg` | **Contiene Set-Cookie con JWT y direcciones de entrega.** No se copió al repositorio ni se reproduce o utiliza el token.                                                                                                       | Proporcionar una copia corregida con toda la cookie/tokens y datos personales ocultos. El listado y login 200 visibles no demostrarían por sí solos un 401 ni creación.     |
| `MongoAtlas.jpeg`                            | El encabezado de organización incluye un nombre personal innecesario para demostrar el cluster. No contiene credenciales visibles, pero se mantiene fuera conforme a la política de no publicar datos personales innecesarios. | Proporcionar copia con ese encabezado oculto o recortado. El cluster activo y sus métricas no demuestran que NestJS esté conectado ni los índices/validador de la bitácora. |

No se editaron originales ni se incorporaron versiones sensibles provisionalmente. El ocultamiento debe aplicarse en una copia corregida antes de su incorporación.

## GitHub Actions y originales faltantes

La captura de GitHub Actions fue visible en el mensaje, pero su original no está entre los cinco archivos de la carpeta. Muestra run #228, `main`, d45b97c y dos jobs verdes; no muestra contadores individuales. No se recrea ni se enlaza a una imagen inexistente. El [run aprobado verificado](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/39828366237), del 22 de octubre de 2026, y sus contadores sí están documentados.

Todavía faltan evidencias individuales de:

- Login de la SPA sin credenciales visibles; creación y listado posterior de pedido, estados de carga/error y manejo de 401.
- Listado MVC de tiendas y cambio de página; formularios, validaciones y creación de ambos recursos.
- PRG 303 → GET, logout y rechazo no ADMIN/CSRF, sin cookies ni tokens.
- Migraciones remotas y comprobación específica de Atlas/índices/validador.
- Confirmación privada de secretos distintos entre ambientes, únicamente fecha y resultado, sin valores.

La guía pide evidenciar funcionalidades; las capturas son una forma de hacerlo. No se exige fabricar una imagen por cada nombre sugerido. Las pruebas automatizadas se documentan por separado y no se presentan como interacciones manuales en producción.

## Validación antes de publicar

Revisar cada original a resolución nativa, rechazar secretos y datos personales innecesarios, registrar los límites y la fecha solo cuando sea conocida, evitar duplicados y comprobar las rutas relativas. Las imágenes JPEG y PNG incorporadas usan formatos compatibles con Markdown de GitHub. Revisar la página remota final en los archivos del PR después de publicar. El push de documentación no autoriza merge ni operaciones en producción.
