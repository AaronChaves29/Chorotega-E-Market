# Recursos de la landing pública

Origen visual: [Figma oficial, landing 2023:51756](https://www.figma.com/design/Ogxj2qKjAbnS2jf94si9Os/Chorotega-E-Market?node-id=2023-51756).

Las cuatro fotografías/emblemas y los veinte SVG se verificaron contra el contexto
original de ese frame mediante Figma MCP. Emblema y cerámica coinciden byte a byte
(SHA-256) con los recursos existentes en `../registration/`, que se reutilizan sin
modificarlos ni duplicarlos. Se conservan los archivos originales,
incluidas las dimensiones raíz de los iconos. Las variantes numeradas corresponden
a tamaños y colores diferentes del diseño, no a recursos de muestra adicionales.

| Archivo                                                                      | Capa original            | Uso                                                |
| ---------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------- |
| ../registration/chorotega-emblem.png                                         | 2023:51759 y 2023:51957  | Marca en navegación y footer, con recorte original |
| manos-artesanas.png                                                          | 2023:51787               | Fotografía principal                               |
| ../registration/local-crafts.png                                             | 2023:51806               | Cerámica en categorías                             |
| nicoya-original.png                                                          | 2023:51919               | Nuestra tierra, con recorte original               |
| continuar.svg / continuar1.svg                                               | 2023:51778 / 2023:51925  | Acciones principal y editorial                     |
| arrow-up-right.svg / arrow-up-right1.svg                                     | 2023:53795 / 2023:53801  | Pie editorial y categorías                         |
| sprout.svg                                                                   | 2023:53792               | Origen local                                       |
| utensils.svg, palette.svg, wrench.svg, shirt.svg, house.svg, gift.svg        | Directorio de categorías | Iconos informativos de categorías                  |
| shopping-bag.svg, store.svg, truck.svg                                       | Roles                    | Cliente, emprendedor y repartidor                  |
| store1.svg, package.svg, heart.svg, shopping-bag1.svg, truck1.svg, users.svg | Beneficios               | Dos beneficios por rol                             |

Las tipografías DM Serif Display, Inter (400/600) y Work Sans provienen de Google
Fonts y se sirven localmente desde `fonts/`. Sus licencias SIL Open Font License
se incluyen junto con los archivos. No se necesitan solicitudes externas de
fuentes ni URLs temporales de Figma durante el build o la navegación.

Estos recursos editoriales no representan imágenes obtenidas del catálogo privado.
