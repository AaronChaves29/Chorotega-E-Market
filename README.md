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

PostgreSQL se utiliza para almacenar la información estructurada y transaccional del sistema.

MongoDB se utiliza para almacenar la bitácora de eventos relacionados con los pedidos.

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

## Estructura del proyecto

```text
Chorotega-E-Market/
│
├── apps/
│   ├── backend/
│   └── frontend/
│
├── database/
│   ├── postgres/
│   │   ├── migrations/
│   │   └── seeds/
│   └── mongodb/
│       └── seeds/
│
├── docs/
├── .github/
├── docker-compose.yml
└── README.md
```

## Requisitos

Para ejecutar el proyecto se necesita:

- Node.js 22
- npm
- Docker
- Docker Compose
- Git

Para utilizar los servicios configurados en Supabase se requiere acceso al proyecto correspondiente.

## Instalación

### 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPOSITORIO>
cd Chorotega-E-Market
```

### 2. Instalar dependencias del backend

```bash
cd apps/backend
npm install
```

### 3. Instalar dependencias del frontend

Desde la raíz del proyecto:

```bash
cd apps/frontend
npm install
```

## Variables de entorno

El backend utiliza variables de entorno para configurar la aplicación.

Dentro de:

```text
apps/backend/
```

se incluye el archivo:

```text
.env.example
```

Este archivo sirve como referencia para crear el archivo `.env`.

Ejemplo:

```env
PORT=3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

Se debe crear un archivo `.env` dentro de `apps/backend` y completar los valores correspondientes.

El archivo `.env` contiene información sensible y no debe subirse al repositorio.

## Bases de datos con Docker

El proyecto utiliza Docker Compose para levantar PostgreSQL y MongoDB de forma local.

Desde la raíz del proyecto ejecutar:

```bash
docker compose up -d
```

Este comando levanta:

| Servicio | Puerto |
| --- | --- |
| PostgreSQL | 5432 |
| MongoDB | 27017 |

Durante la creación inicial de los contenedores también se ejecutan automáticamente las migraciones y los datos seed configurados para ambas bases de datos.

Para verificar los servicios:

```bash
docker compose ps
```

Para detenerlos:

```bash
docker compose down
```

Para detenerlos y eliminar los volúmenes:

```bash
docker compose down -v
```

> `docker compose down -v` elimina los datos almacenados localmente en los volúmenes de Docker.

## Verificar PostgreSQL

Para acceder a PostgreSQL:

```bash
docker exec -it chorotega-postgres psql -U postgres -d chorotega_emarket
```

Dentro de PostgreSQL se pueden listar las tablas con:

```sql
\dt
```

La base contiene las siguientes tablas:

- usuario
- tienda
- categoria
- producto
- barrio
- pedido
- detalle_pedido
- repartidor
- entrega

Para salir:

```sql
\q
```

## Verificar MongoDB

Para acceder a MongoDB:

```bash
docker exec -it chorotega-mongodb mongosh
```

Seleccionar la base:

```javascript
use chorotega_emarket
```

Listar las colecciones:

```javascript
show collections
```

Consultar la bitácora de pedidos:

```javascript
db.bitacora_pedidos.find().pretty()
```

La colección `bitacora_pedidos` almacena los eventos importantes asociados al ciclo de vida de los pedidos.

Para salir:

```javascript
exit
```

## Ejecutar el backend

Desde:

```text
apps/backend/
```

ejecutar:

```bash
npm run start:dev
```

Por defecto, el backend utiliza el puerto:

```text
3000
```

o el valor definido mediante la variable de entorno `PORT`.

## Ejecutar el frontend

Desde:

```text
apps/frontend/
```

ejecutar:

```bash
npm run dev
```

## Verificación del backend

Con el backend en ejecución se puede utilizar el endpoint de health check configurado en el proyecto para comprobar la conexión con la base de datos.

```text
GET http://localhost:3000/api/database/health
```

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

## Integración continua

El proyecto utiliza GitHub Actions para verificar automáticamente la calidad del código.

El pipeline ejecuta comprobaciones independientes para frontend y backend, incluyendo compilación y análisis de código.

Las pruebas automáticas del backend también forman parte del proceso de integración continua una vez configuradas en el pipeline.

## Integrantes

- Sofía Sánchez Jiménez
- Aaron Chaves Baltodano