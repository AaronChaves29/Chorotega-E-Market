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

El backend utiliza variables de entorno para configurar la aplicación.

El archivo `apps/backend/.env.example` sirve como referencia para crear `apps/backend/.env`.

### PostgreSQL local

Ejemplo para utilizar PostgreSQL de Docker:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/chorotega_emarket
DATABASE_SSL=false
```

### PostgreSQL de Supabase

Configura la URL de conexión del proyecto correspondiente y habilita SSL:

```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_SSL=true
```

Completa también las demás variables que requieran las funcionalidades de Supabase, tomando como referencia `.env.example`.

El backend y la CLI de TypeORM comparten las opciones de conexión mediante `database.options.ts`.

La configuración mantiene:

- `synchronize: false`: desactiva la modificación automática del esquema a partir de las entidades.
- `migrationsRun: false`: las migraciones se ejecutan mediante comandos explícitos.

Los comandos de migración deben ejecutarse desde `apps/backend`. El DataSource de la CLI carga el `.env` de esa carpeta y respeta las variables ya definidas en el entorno del proceso.

El archivo `.env` contiene información sensible y no debe subirse al repositorio.

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
db.bitacora_pedidos.find().pretty()
```

La colección `bitacora_pedidos` almacena los eventos importantes asociados al ciclo de vida de los pedidos.

Para salir:

```javascript
exit
```

## Ejecutar el backend

Comprueba primero que la base seleccionada en el `.env` esté disponible y tenga el esquema correspondiente.

Desde `apps/backend`:

```bash
npm run start:dev
```

Por defecto, el backend utiliza el puerto `3000` o el valor definido mediante `PORT`.

Si el `.env` apunta a Supabase, el backend se conectará a Supabase. Las variables temporales utilizadas en los comandos de migración local no modifican ese archivo.

## Ejecutar el frontend

Desde `apps/frontend`:

```bash
npm run dev
```

Utiliza la dirección y el puerto que indique la terminal.

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
