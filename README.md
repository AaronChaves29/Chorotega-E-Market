# Chorotega E-Market

## Descripción

Chorotega E-Market es una plataforma web tipo marketplace diseñada para impulsar el comercio local de la región Chorotega. El sistema permite a los emprendedores registrar sus tiendas, publicar productos y gestionar pedidos, mientras que los clientes pueden explorar el catálogo, realizar compras y dar seguimiento a sus pedidos.

## Tecnologías

### Frontend

- Next.js
- TypeScript
- Tailwind CSS

### Backend

- NestJS
- TypeScript
- TypeORM

### Bases de datos

- PostgreSQL
- MongoDB
- Supabase

PostgreSQL almacena la información estructurada y transaccional del sistema.

MongoDB almacena la bitácora de eventos relacionados con los pedidos.

Supabase se utiliza como servicio de PostgreSQL y para la autenticación de usuarios.

### Autenticación

- Supabase Auth
- Google OAuth 2.0
- JSON Web Tokens (JWT)

### Herramientas

- Git
- GitHub
- Docker
- Docker Compose
- GitHub Actions

## Estructura del proyecto

- `apps/backend/`: aplicación NestJS.
  - `src/database/database.options.ts`: configuración compartida de PostgreSQL.
  - `src/database/data-source.ts`: DataSource para la CLI de TypeORM.
  - `src/database/migrations/`: migraciones administradas por TypeORM.
  - `src/modules/`: módulos del backend.
- `apps/frontend/`: aplicación Next.js.
- `database/postgres/migrations/`: SQL original del esquema, conservado como referencia.
- `database/postgres/seeds/`: datos de ejemplo de PostgreSQL.
- `database/mongodb/seeds/`: inicialización de la bitácora de pedidos.
- `docs/`: documentación técnica y diagramas.
- `.github/workflows/`: configuración de integración continua.
- `docker-compose.yml`: servicios locales de bases de datos.
- `README.md`: instrucciones generales del proyecto.

## Requisitos

Para ejecutar el proyecto se necesita:

- Node.js 22.22.0 o superior (CI del backend utiliza 22.22.0).
- npm.
- Docker.
- Docker Compose.
- Git.

Para utilizar los servicios configurados en Supabase se requiere acceso al proyecto correspondiente.

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/AaronChaves29/Chorotega-E-Market.git
cd Chorotega-E-Market
```

### 2. Instalar dependencias del backend

Desde la raíz del proyecto:

```bash
cd apps/backend
npm ci
```

### 3. Instalar dependencias del frontend

Desde la raíz del proyecto, en otra terminal:

```bash
cd apps/frontend
npm ci
```

## Variables de entorno

La configuración diferencia `development`, `test` y `production` mediante `NODE_ENV`, seleccionado en el entorno del proceso antes de arrancar. Sin selección se utiliza desarrollo. La aplicación valida la configuración antes de inicializar sus conexiones.

| Variable           | Propósito                                                            |
| ------------------ | -------------------------------------------------------------------- |
| `NODE_ENV`         | Seleccionar el ambiente.                                             |
| `PORT`             | Puerto de escucha del backend.                                       |
| `DATABASE_URL`     | Conexión PostgreSQL exclusiva del servidor.                          |
| `DATABASE_SSL`     | Controlar TLS; obligatorio habilitarlo en producción.                |
| `DATABASE_CA_CERT` | CA PEM opcional para validar el certificado PostgreSQL.              |
| `MONGODB_URI`      | Conexión MongoDB exclusiva del servidor; TLS validado en producción. |
| `MONGODB_DATABASE` | Base de datos MongoDB.                                               |
| `JWT_SECRET`       | Secreto de firma existente, exclusivo por ambiente.                  |
| `CORS_ORIGIN`      | Orígenes web exactos autorizados, separados por comas.               |

Desarrollo carga `apps/backend/.env.development` y luego `apps/backend/.env`, respetando la prioridad del entorno del proceso. Producción y pruebas no cargan archivos de entorno. La plantilla `apps/backend/.env.example` incluye únicamente valores locales no sensibles y campos para completar; nunca copiar credenciales al repositorio.

Producción requiere configuración completa, secreto JWT de al menos 32 caracteres, TLS con certificado PostgreSQL validado y orígenes HTTPS explícitos. El dominio definitivo del frontend se configura al conocerlo. No se permite introducir parámetros TLS en `DATABASE_URL` de producción que puedan sustituir la política del backend.

El backend y la CLI comparten `database.options.ts`. Se conservan `synchronize: false` y `migrationsRun: false`; este bloque no automatiza ni ejecuta migraciones. La CLI carga archivos locales únicamente en desarrollo y valida las opciones PostgreSQL sin exigir las variables HTTP, MongoDB o JWT.

Consulta las reglas, prioridades, pruebas y límites en [Configuración dev/prod](docs/laboratory/lab-06/configuracion-dev-prod.md).

La preparación de Render, los comandos de migración compilados y el procedimiento previo de Supabase/Atlas se describen en [Despliegue del backend](docs/laboratory/lab-06/despliegue-render.md). No se han creado servicios ni verificado conexiones remotas.

## Bases de datos con Docker

Desde la raíz del proyecto:

```bash
docker compose up -d
docker compose ps
```

Este comando levanta:

| Servicio   | Puerto |
| ---------- | ------ |
| PostgreSQL | 5432   |
| MongoDB    | 27017  |

Ambos servicios tienen healthchecks. Antes de continuar, comprueba que aparezcan como `healthy`.

PostgreSQL inicia sin ejecutar automáticamente el esquema ni los seeds. Las tablas se crean mediante TypeORM y los datos de ejemplo se cargan después.

MongoDB conserva su script de inicialización, que se ejecuta cuando su directorio de datos se inicializa por primera vez.

### Crear el esquema de PostgreSQL

Los siguientes comandos corresponden a una base local nueva, sin tablas creadas previamente por el SQL de inicialización.

Desde la raíz del proyecto:

```bash
cd apps/backend
```

Consulta las migraciones disponibles:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/chorotega_emarket' DATABASE_SSL=false npm run migration:show
```

Ejecuta las migraciones pendientes:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/chorotega_emarket' DATABASE_SSL=false npm run migration:run
```

Comprueba su estado:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/chorotega_emarket' DATABASE_SSL=false npm run migration:show
```

Estas variables se aplican únicamente a cada comando y seleccionan explícitamente PostgreSQL local, aunque el `.env` apunte a Supabase.

TypeORM registra las migraciones aplicadas en `typeorm_migrations`. Las migraciones registradas no se vuelven a ejecutar al repetir `migration:run`.

### Bases existentes del mecanismo anterior

Si el volumen conserva tablas creadas mediante el antiguo SQL de `docker-entrypoint-initdb.d`, la migración inicial no debe ejecutarse directamente sobre ellas, porque intentaría crear tablas que ya existen.

Es necesario planificar la incorporación de esa base al historial de migraciones, revisando primero que su esquema coincida con la migración inicial.

No elimines el volumen para resolver esta situación si contiene datos que deban conservarse.

### Cargar los datos de ejemplo

Ejecuta este paso una sola vez sobre el esquema recién creado, antes de agregar otros datos.

Desde `apps/backend`:

```bash
docker compose -f ../../docker-compose.yml exec -T postgres \
  psql -X -U postgres -d chorotega_emarket \
  -v ON_ERROR_STOP=1 --single-transaction -f - \
  < ../../database/postgres/seeds/V1__seed_initial_data.sql
```

La carga se ejecuta en una transacción y se detiene si ocurre un error. El cliente `psql` utilizado pertenece al contenedor PostgreSQL.

El seed utiliza identificadores iniciales y actualiza existencias. No es idempotente: no debe repetirse sobre una base poblada. Si falla, revisa la causa antes de reintentarlo.

La carga inicial genera:

| Tabla            | Registros |
| ---------------- | --------: |
| `usuario`        |         3 |
| `tienda`         |         1 |
| `categoria`      |         2 |
| `barrio`         |         2 |
| `producto`       |         2 |
| `repartidor`     |         1 |
| `pedido`         |         4 |
| `detalle_pedido` |         5 |
| `entrega`        |         2 |

Después de aplicar los movimientos del seed, las existencias quedan en 17 unidades de Cafe Chorotega y 8 unidades de Artesania de madera.
El seed MongoDB contiene cuatro bitácoras, correspondientes a los pedidos 1 a 4.

### Detener los servicios

Desde la raíz del proyecto:

```bash
docker compose down
```

Este comando conserva los volúmenes y sus datos.

## Migraciones TypeORM

Las migraciones administradas por TypeORM se encuentran en:

```text
apps/backend/src/database/migrations/
```

La migración inicial contiene las nueve tablas del negocio, sus restricciones y sus índices.

El SQL ubicado en `database/postgres/migrations/` se conserva como referencia del esquema original y ya no se monta como script de inicialización de PostgreSQL.

Los siguientes comandos están disponibles desde `apps/backend`:

| Comando                                                              | Función                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run migration:create -- src/database/migrations/NombreCambio`   | Crear una migración vacía para escribir sus operaciones.                |
| `npm run migration:generate -- src/database/migrations/NombreCambio` | Generar una migración comparando las entidades con la base configurada. |
| `npm run migration:run`                                              | Aplicar las migraciones pendientes.                                     |
| `npm run migration:show`                                             | Mostrar el estado de las migraciones.                                   |
| `npm run migration:revert`                                           | Revertir la última migración aplicada mediante su método `down`.        |

Los comandos que se conectan a una base utilizan la configuración de entorno del backend. Confirma el destino antes de ejecutarlos.

Antes de generar una migración automáticamente, verifica que los mapeos de entidades estén completos y revisa el SQL generado.

La reversión de la migración inicial elimina las nueve tablas del negocio y sus datos. Debe comprobarse en una base de prueba antes de utilizarla en otros entornos.

## Verificar PostgreSQL

Desde la raíz del proyecto:

```bash
docker compose exec postgres psql -U postgres -d chorotega_emarket
```

Dentro de PostgreSQL, lista las tablas:

```sql
\dt
```

Después de ejecutar la migración inicial, la base contiene:

- `usuario`
- `tienda`
- `categoria`
- `producto`
- `barrio`
- `pedido`
- `detalle_pedido`
- `repartidor`
- `entrega`

Además, `typeorm_migrations` almacena el historial de migraciones aplicadas:

```sql
SELECT id, timestamp, name
FROM typeorm_migrations
ORDER BY id;
```

El esquema inicial del negocio contiene:

| Elemento                       | Cantidad |
| ------------------------------ | -------: |
| Claves primarias               |        9 |
| Claves foráneas                |       11 |
| Restricciones `UNIQUE`         |        6 |
| Restricciones `CHECK`          |       20 |
| Índices explícitos adicionales |        8 |

Entre las reglas protegidas por la base se encuentran:

- El total del pedido debe ser igual a `subtotal + tarifa_envio`.
- El subtotal del detalle debe ser igual a `cantidad * precio_unitario`.
- Un producto no puede repetirse dentro del mismo pedido.

Para salir:

```sql
\q
```

## Verificar MongoDB

Desde la raíz del proyecto:

```bash
docker compose exec mongodb mongosh
```

Selecciona la base:

```javascript
use chorotega_emarket
```

Lista las colecciones:

```javascript
show collections
```

Consulta la bitácora de pedidos:

```javascript
db.bitacora_pedidos.find().pretty();
```

La colección `bitacora_pedidos` almacena los eventos importantes asociados al ciclo de vida de los pedidos.

Para salir:

```javascript
exit;
```

## Ejecutar el backend

Comprueba primero que la base seleccionada en el `.env` esté disponible y tenga el esquema correspondiente.

Desde `apps/backend`:

```bash
npm run start:dev
```

Por defecto, el backend utiliza el puerto `3000` o el valor definido mediante `PORT`.

En desarrollo, si el `.env` apunta a Supabase, el backend intentará conectarse a Supabase; este archivo no se carga en producción ni en pruebas. Las variables temporales utilizadas en los comandos de migración local no modifican ese archivo.

## Swagger/OpenAPI y colección HTTP

Con el backend en ejecución en el puerto 3000:

- Swagger UI: <http://localhost:3000/docs>.
- Especificación JSON: <http://localhost:3000/docs-json>.
- Colección de las 35 operaciones: [api.http](docs/laboratory/lab-05/api.http).

Los endpoints protegidos permiten utilizar **Authorize** con un JWT obtenido
mediante `/api/v1/auth/login`. La documentación refleja los permisos actuales;
los endpoints públicos conservan su acceso público. La colección requiere
cuentas y datos locales de pruebas preparados; sus variables y el orden de
peticiones se explican en [Swagger y OpenAPI](docs/laboratory/lab-05/swagger-openapi.md).

Para verificar el contrato y ejecutar la colección contra PostgreSQL temporal,
desde `apps/backend` y con Docker activo:

```bash
npm run test:integration -- --testPathPatterns=test/integration/http/openapi.integration-spec.ts
```

## Ejecutar el frontend

Desde `apps/frontend`:

```bash
npm run dev
```

Utiliza la dirección y el puerto que indique la terminal.

### Administración MVC — Laboratorio 6

El backend incorpora vistas Handlebars en `/admin/login`, `/admin/products` y `/admin/stores`, con acceso exclusivo ADMIN, listados paginados, formularios de creación, validación por campo, Post/Redirect/Get y CSRF vinculado a la sesión.

En desarrollo utilizar `npm run start:dev`. Después del build de producción, `npm run start` y `npm run start:render` ejecutan el mismo arranque compilado con validación y migraciones previas a HTTP. No se crean cuentas ni datos de ejemplo automáticamente.

Consultar [el flujo MVC, seguridad, pruebas y verificación en Render](docs/laboratory/lab-06/admin-mvc.md). La API REST y su documento OpenAPI conservan sus 35 operaciones. La regresión de formularios con Chrome/Chromium y PostgreSQL temporal se ejecuta con `npm run test:browser`, después del build y con Docker disponible.

### Frontend — SPA en React y Next.js

El frontend de Chorotega E-Market está desarrollado con Next.js, React y TypeScript. Se encuentra en `apps/frontend/` dentro del monorepositorio y consume la API REST de NestJS.

**Funcionalidades implementadas:**

- Inicio y cierre de sesión mediante JWT.
- Almacenamiento del token en una cookie HttpOnly.
- Consulta paginada de pedidos con estados de carga, datos, error y lista vacía.
- Creación de pedidos mediante selección de tienda, productos, cantidades, barrio y dirección de entrega.
- Validación de datos y presentación de mensajes de error.
- Cliente HTTP compartido en `apps/frontend/lib/api-client.ts`, encargado de centralizar las solicitudes al backend y detectar respuestas HTTP 401.

**Variables de entorno del frontend:**

| Variable              | Propósito                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`             | Dirección base de la API NestJS, utilizada exclusivamente por las rutas del servidor de Next.js.                           |
| `NEXT_PUBLIC_API_URL` | Variable pública disponible para el navegador. La implementación actual no la necesita para las solicitudes centralizadas. |

En desarrollo, las variables locales pueden configurarse mediante `apps/frontend/.env.local`, archivo que no debe incluirse en el repositorio.

**Despliegue previsto en Vercel:**

El frontend se desplegará desde el repositorio original, utilizando `apps/frontend` como directorio raíz y Next.js como framework.

La variable `API_URL` deberá configurarse en Vercel con la dirección HTTPS real de la API publicada en Render. No se deben utilizar direcciones `localhost` en producción.

El despliegue y las pruebas de integración en producción se encuentran pendientes hasta que estén disponibles los servicios públicos.

## Verificación del backend

Con el backend en ejecución, utiliza el endpoint de health check para comprobar la conexión con la base configurada:

```text
GET http://localhost:3000/api/database/health
```

Si cambiaste `PORT`, ajusta la dirección.

## Calidad del código

### Backend

Desde `apps/backend`:

```bash
npm run lint
npm run test
npm run build
```

### Frontend

Desde `apps/frontend`:

```bash
npm run lint
npm run build
```

### Pruebas de integración del backend

Desde `apps/backend`, con Docker activo:

```bash
npm test -- --runInBand
npm run test:integration
```

`npm test` ejecuta las pruebas unitarias sin requerir Docker.
`npm run test:integration` descubre `test/integration/**/*.integration-spec.ts`
y utiliza PostgreSQL 16 temporal con puertos dinámicos mediante Testcontainers.
El helper ejecuta las migraciones reales con `synchronize: false`, sin cargar
`.env`, usar Supabase, Docker Compose ni la base de desarrollo o sus seeds.
Al finalizar, incluso si falla una prueba, se cierra TypeORM y se elimina el
contenedor temporal. La primera ejecución puede tardar más al descargar imágenes.

Actualmente hay 13 pruebas unitarias, seis funcionales de integración
(tres del catálogo y tres de pedidos) y tres de infraestructura: nueve de
integración en total. La validación automática exige que el schema builder de
TypeORM no proponga cambios después de aplicar las migraciones reales.
Los casos y la evidencia se describen en
[Pruebas de integración del catálogo](docs/laboratory/lab-03/catalog-integration-tests.md)
y [Validación final del Laboratorio 3](docs/laboratory/lab-03/validacion-final.md).

## Integración continua

GitHub Actions ejecuta jobs independientes para backend y frontend.

El job del backend:

1. Inicia PostgreSQL 16 con una base vacía y espera su healthcheck.
2. Instala dependencias, ejecuta el linter y compila.
3. Ejecuta las migraciones TypeORM y muestra su estado.
4. Carga los seeds por separado en una transacción.
5. Ejecuta las pruebas unitarias del backend.
6. Ejecuta la suite de integración con Testcontainers, que crea sus propios
   contenedores y no utiliza el servicio PostgreSQL de las validaciones anteriores.

El backend fija Node.js 22.22.0, compatible con la versión de Testcontainers
instalada. Un fallo de integración hace fallar el job. El patrón de Jest descubre
automáticamente nuevas pruebas de integración cuando se incorporen.

La conexión del CI utiliza su propio PostgreSQL y no depende de Supabase.

El job del frontend instala dependencias, ejecuta el linter y compila.

El workflow se activa con pushes a `main`, `develop`, `feature/**` y `feat/**`, y con pull requests hacia `main` o `develop`.
