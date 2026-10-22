# Administración MVC en NestJS

La guía oficial del Laboratorio 6, páginas 2 y 3, exige dos casos de uso con vistas del servidor, listado paginado, formularios validados, Post/Redirect/Get y CSRF activo. Este módulo adapta esos comportamientos a NestJS y Handlebars. ADR-001 registra la autorización del stack; no registra una aprobación específica de la equivalencia Handlebars/Thymeleaf. Esa equivalencia académica debe confirmarse.

## Estado de despliegue y verificaciones

El módulo está integrado en `main` y disponible en [el acceso administrativo de Render](https://chorotega-e-market.onrender.com/admin/login). [GitHub Actions](https://github.com/AaronChaves29/Chorotega-E-Market/actions/runs/39828366237) terminó exitosamente para el commit `d45b97cf0caae338a86a8dc6c393573759308d47`, incluidos integración, artefacto y Chrome. La auditoría de solo lectura obtuvo HTML 200 con CSRF, Referrer-Policy: same-origin y Cache-Control: no-store en el acceso MVC.

El equipo reportó que las funcionalidades administrativas fueron probadas manualmente en producción. Se incorporó la [captura original del listado de productos](evidencias/mvc-productos.jpeg), sin editarla; no existe un acta individual de cada comprobación. El [inventario de capturas](evidencias/README.md) distingue adjuntos revisados de archivos incorporados. No se atribuyen esas interacciones manuales a quien realizó la auditoría documental.

| Comprobación de producción           | Evidencia disponible                                                                               | Evidencia manual por adjuntar                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Acceso ADMIN mediante `/admin/login` | Reporte general de funcionamiento administrativo; GET del formulario comprobado independientemente | Acceso autenticado y redirección al listado, sin credenciales visibles   |
| Listado de productos y tiendas       | Listado de productos incorporado; automatizadas comprueban listados y paginación                   | Listado de tiendas y cambio de página; productos ya incorporados         |
| Formularios y validaciones visibles  | Reporte general; Chrome y HTTP comprueban altas, errores y ausencia de escrituras inválidas        | Formularios válidos e inválidos, errores por campo y valores conservados |
| Post/Redirect/Get                    | HTTP y Chrome comprueban 303 y GET sin repetición de escritura                                     | Registro manual de red mostrando 303 → GET, sin cookies ni tokens        |
| Cierre de sesión                     | Automatizadas comprueban logout y pérdida de acceso                                                | Resultado manual individual y regreso al acceso                          |
| Acceso restringido y CSRF            | Automatizadas comprueban roles prohibidos, sesiones inválidas y CSRF ausente/alterado/ajeno        | Evidencia manual individual del rechazo, sin revelar tokens CSRF         |

Los resultados manuales individuales de PRG, logout, restricciones y CSRF no se deducen del reporte general. El registro de capturas y la trazabilidad de la rúbrica se centralizan en [entrega-final.md](entrega-final.md).

## Casos de uso y rutas

Las rutas pertenecen al backend, sin el prefijo REST `/api/v1`:

| Método | Ruta                  | Comportamiento                                                      |
| ------ | --------------------- | ------------------------------------------------------------------- |
| GET    | `/admin/login`        | Conserva ADMIN válido con 303; en otro caso muestra acceso con CSRF |
| POST   | `/admin/login`        | AuthService autentica; solo admite ADMIN; rota sesión y CSRF        |
| POST   | `/admin/logout`       | Comprueba sesión y CSRF, elimina la cookie y redirige al acceso     |
| GET    | `/admin`              | Redirige al listado de productos                                    |
| GET    | `/admin/products`     | Listado HTML paginado de productos                                  |
| GET    | `/admin/products/new` | Formulario de creación de productos                                 |
| POST   | `/admin/products`     | Valida y crea; éxito: 303 al listado                                |
| GET    | `/admin/stores`       | Listado HTML paginado de tiendas                                    |
| GET    | `/admin/stores/new`   | Formulario de creación de tiendas                                   |
| POST   | `/admin/stores`       | Valida y crea; éxito: 303 al listado                                |

Los listados reutilizan los DTOs de búsqueda y consultas SQL existentes, con page desde cero y size entre 1 y 100. Los enlaces conservan filtros y ordenamiento. No hay paginación en memoria. Las relaciones se introducen mediante identificadores existentes; el servicio valida su existencia y las condiciones del propietario. No se implementan edición ni eliminación mediante vistas.

## Reutilización, validación y PRG

Controlador MVC → ProductsService o StoresService → repositorios → PostgreSQL. Los módulos exportan los servicios existentes; no se vuelven a registrar sus providers ni se duplican reglas. Las vistas reciben DTOs y modelos explícitos, nunca entidades completas.

Los formularios convierten únicamente los campos numéricos conocidos y reutilizan CreateProductDto y CreateStoreDto. Los campos desconocidos se rechazan. CSRF se comprueba antes del DTO y se retira únicamente del objeto que se valida. Un fallo devuelve HTML 400 con errores por campo y valores conservados, escapados por Handlebars. Las contraseñas nunca se vuelven a renderizar. Las relaciones inválidas se presentan junto al campo correspondiente y mantienen el código HTTP conocido. Los fallos inesperados muestran un 500 genérico sin SQL ni detalles internos.

Tras guardar, se devuelve HTTP 303 con Location al listado: el navegador ejecuta GET. Recargar ese listado no repite la escritura. PRG no impide dos POST simultáneos ni convierte las altas en idempotentes.

## Autenticación y CSRF

El acceso reutiliza AuthService y JwtService sin cambiar `/api/v1/auth/login` ni los guards REST. El guard MVC verifica en cada petición el mismo JWT, valida su identidad y entrega el usuario al servicio. RolesGuard y `@Roles('ADMIN')` protegen las rutas. La sesión de Next.js no se comparte: su cookie pertenece al frontend, mientras que MVC usa una cookie del backend.

La cookie chorotega_admin tiene HttpOnly, SameSite=Strict y Path=/admin. Secure se activa en producción; permite HTTP solo en desarrollo/pruebas locales. Contiene una sesión autenticada y cifrada con AES-256-GCM, IV aleatorio y clave HKDF derivada del JWT_SECRET existente con propósito exclusivo. El JWT no está en claro. La sesión anónima dura 15 minutos; la autenticada, como máximo una hora; además se verifica la expiración del JWT en cada petición. No se usa memoria de sesión del proceso ni un almacén externo. Rotar el secreto invalida sesiones; reiniciar con la misma configuración no las invalida.

Cada sesión contiene un CSRF aleatorio de 256 bits, renderizado como campo oculto. Todo POST administrativo, incluido login y logout, requiere coincidencia en tiempo constante con el token de la sesión cifrada. Los tokens ajenos y de la sesión anónima anterior al login se rechazan. La sesión rota al autenticar. CORS y SameSite no sustituyen esta comprobación.

Los formularios del mismo origen no necesitan CORS por regla del navegador. Sin embargo, el middleware actual rechaza todo Origin que no figure en CORS_ORIGIN, incluso el del propio backend. Por eso, con este diseño, la lista debe incluir el origen HTTPS exacto del backend además del de la SPA. No se habilitan cookies entre orígenes, comodines ni Origin: null.

Las páginas usan Cache-Control: no-store, CSP sin scripts ni frames, form-action restringido al mismo origen, base-uri deshabilitado, nosniff y Referrer-Policy: same-origin. La política anterior no-referrer hacía que Chrome enviara Origin: null en formularios HTML y CORS devolviera 403; same-origin conserva el origen en los POST locales sin habilitar accesos externos. Handlebars escapa valores; no hay HTML dinámico sin escape. El motor añade el doctype HTML5. El filtro HTML se limita a MVC; REST conserva Problem Details.

Como en JWT existente, una copia robada de la cookie autenticada puede reutilizarse hasta expirar: logout elimina la cookie del navegador, sin agregar revocación global. No se incorpora un sistema nuevo de credenciales, recuperación de cuentas, control de intentos de login ni cambios de roles.

## Build y ejecución

Handlebars es dependencia de producción. nest build copia las seis plantillas de src/admin/views a dist/admin/views; la ruta se resuelve desde JavaScript compilado, sin depender del directorio de trabajo. Jest unitario transforma @nestjs/jwt igual que la configuración de integración existente para ejecutar JWT real, sin simular los guards.

```bash
cd apps/backend
npm ci
npm run start:dev
```

Con variables y bases locales, visitar http://localhost:3000/admin/login. Se requiere un ADMIN existente con contraseña local configurada; no se crean cuentas ni seeds automáticos.

Después de compilar, tanto npm run start como npm run start:render ejecutan dist/deployment/start-render.js: validan configuración y completan migraciones pendientes antes de abrir HTTP. El start original (nest start) depende de Nest CLI, que npm prune --omit=dev elimina; se conserva el start compilado por decisión explícita para Render y start:dev conserva recarga local. Este bloque no ejecuta migraciones remotas ni modifica el servicio de Render.

```bash
npm run build
npm run test:deployment
npm test -- --runInBand
npm run test:cov -- --runInBand
# Docker requerido; bases temporales con migraciones reales, sin .env ni seeds globales:
npm run test:integration
npm run test:e2e
# Chrome/Chromium local (CHROME_BIN opcional) y Docker; nueve escenarios reales de formulario:
npm run test:browser
```

## Procedimiento manual de comprobación en el despliegue existente

Abrir https://chorotega-e-market.onrender.com/admin/login y autenticar manualmente sin copiar credenciales ni tokens. Verificar ADMIN y rechazo de otros roles; cookies Secure/HttpOnly/Strict; paginación y páginas vacías; formulario inválido con valores conservados; POST exitoso → 303 → GET; rechazo CSRF ausente, alterado y ajeno; logout y sesión vencida. Las escrituras remotas requieren autorización y registros de prueba identificados.

Comprobar /docs, /docs-json, REST público y Next.js. Las rutas administrativas se excluyen de OpenAPI para conservar las 35 operaciones REST. No cambian Auth/JWT, entidades, migraciones ni reglas del catálogo.

## Pruebas incluidas

Las pruebas HTTP sin base usan Nest, Supertest, bcrypt/JWT reales y guards activos, simulando los servicios del catálogo. Comprueban presentación, validación, PRG, seguridad y ausencia de llamadas de escritura ante errores. Las pruebas de sesión comprueban cifrado, atributos de cookie, expiración, manipulación, reinicio y aislamiento CSRF. La prueba del artefacto renderiza las seis vistas desde dist.

admin-mvc.integration-spec.ts usa módulos reales y PostgreSQL temporal con Testcontainers para comprobar persistencia, paginación, ausencia de escrituras inválidas y compatibilidad REST. La suite fue ejecutada dentro de las 565 integraciones aprobadas del CI de cierre; esas bases desechables no son producción. Las suites existentes completan las regresiones de pedidos, transacciones y ownership.

La regresión de navegador usa un perfil temporal aislado, las vistas compiladas y PostgreSQL Testcontainers con las migraciones reales. No lee perfiles, cookies ni .env privados. Verifica el Origin real del navegador, las dos altas, errores visibles, conservación de valores, 303, sesión conservada al visitar login, CSRF, rechazo de Origin: null y logout. El workflow de GitHub Actions ejecutó test:deployment y test:browser además de las validaciones existentes y terminó correctamente en el run enlazado arriba. Chrome aprobó nueve escenarios: el contador TAP muestra diez pruebas al incluir el contenedor principal. No se confunden con interacciones manuales en Render.

## Revisión y evidencia de fallos intermitentes

Verificación local del 22 de octubre de 2026, Node.js 22.22.0, Docker y bases desechables. La distribución oficial de Node se ejecutó desde una carpeta temporal después de verificar su SHA-256; no se cambió la instalación global.

### 401 de Users

La auditoría anterior observó 401 al autenticar dentro de `protección de patch / rechaza rol REPARTIDOR`, antes de comprobar el 403 esperado del PATCH. No se reprodujo en esta investigación:

| Ejecución                                                   | Resultado                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| Caso exacto aislado, cinco ejecuciones, Node 22.22.0        | Una prueba aprobada y 73 omitidas por filtro en cada ejecución |
| Archivo Users completo, Node 22.22.0                        | 74/74                                                          |
| Integración completa, Node 22.22.0                          | 565/565, 20 suites                                             |
| E2E completo, Node 22.22.0                                  | 546/546, 12 suites                                             |
| Users del HEAD base sin MVC, Node 26.11.1, tres ejecuciones | 74/74 en cada ejecución                                        |

La comparación base usó una copia temporal del commit cbbc3540aa4b4b069432788a0f121c1b26c1ede3 y observación temporal que solo registraría booleanos sobre existencia del usuario y resultado de bcrypt ante un 401, nunca credenciales. No apareció ningún 401. Esa instrumentación no forma parte del repositorio.

La suite Users compone UsersHttpModule, AuthModule y UsersModule; no carga AdminModule. No cambiaron AuthService, guards REST, DTOs de Users ni sus expectativas. Los dos caminos explícitos de 401 en AuthService son usuario/hash ausentes y comparación de contraseña fallida, pero no existe evidencia para elegir uno como origen del incidente anterior.

**Causa raíz del 401: no demostrada.** No se atribuye a MVC, Node, datos ni un fallo preexistente. Los resultados verdes no significan que se haya corregido su causa. Si reaparece, conservar el caso y observar esas ramas sin registrar datos sensibles.

### Socket hang up en unitarias MVC

La primera ejecución completa con Node 22.22.0 registró socket hang up en `crea products, convierte números y aplica PRG sin repetir escritura en GET`: 454 aprobadas y una fallida. El caso exacto pasó cinco repeticiones aisladas; la repetición completa y cobertura aprobaron 455/455, sin modificar el fixture, agregar reintentos automáticos ni cambiar expectativas. No se demostró la causa de ese fallo de transporte y no se presenta como corregido.

Estas observaciones se conservan como evidencia histórica de la investigación. El CI posterior aprobó, pero no demostró la causa de esas intermitencias. Tampoco sustituye las comprobaciones manuales de producción ni la confirmación académica pendiente de Handlebars.
