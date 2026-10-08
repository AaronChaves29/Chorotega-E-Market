# API administrativa de usuarios

## Alcance aprobado

Base: `develop` en `7c6cf4a084fb466ec39e50a879723c2f91e90454`, con Stores y
seguridad JWT integrados. Rama: `feat/users-rest-api`.

Se implementan exclusivamente lectura administrativa y actualización de perfil.
No existe registro público ni autoservicio. La propuesta de dominio atribuye la
gestión de usuarios al administrador; este bloque concreta el acceso exclusivo
por ADMIN a los tres endpoints autorizados.

| Método y ruta           | Acceso      | Respuesta                       |
| ----------------------- | ----------- | ------------------------------- |
| GET /api/v1/users       | JWT + ADMIN | 200, colección paginada de DTOs |
| GET /api/v1/users/:id   | JWT + ADMIN | 200, DTO individual             |
| PATCH /api/v1/users/:id | JWT + ADMIN | 200, DTO actualizado            |

`@Controller('users')` reutiliza el prefijo global. El controller aplica
`@UseGuards(JwtAuthGuard, RolesGuard)` y cada método declara `@Roles('ADMIN')`,
como los endpoints administrativos existentes. No se desactivan guards ni se
introduce un mecanismo de autenticación alternativo.

## Arquitectura e inyección

HTTP → `UsersController` → `UsersService` → `UsersRepository` → PostgreSQL.
El controller no consulta TypeORM. El servicio valida IDs, coordina las operaciones
y transforma resultados mediante `UserMapper`.

`UsersHttpModule` importa `UsersModule` y `AuthModule`; registra controller y
servicio. `AppModule` incorpora esta composición. `UsersModule` conserva la
persistencia y no importa Auth: así se evita el ciclo de módulos, dado que
`AuthModule` ya depende de `UsersModule`. No se modifica Auth ni su configuración.

`UsersRepository` conserva `findByEmail` y todas las firmas heredadas de la base.
Solo añade búsqueda paginada y actualización tipada de perfil. Stores y la
transacción de Orders pueden seguir consumiendo `findById` sin cambios.

## DTOs y protección de datos

`UserResponseDto` y `UserMapper` seleccionan explícitamente:

- `idUsuario`, `nombre`, `apellido`, `correo`, `telefono`.
- `rol`, `estado`, `fechaCreacion` (fecha ISO al serializar HTTP).

Correo y teléfono solo se entregan en estos endpoints a ADMIN. Nunca se exponen
`authId`, `claveHash`, `clave_hash`, tiendas, pedidos, repartidor ni entidades
completas. El mismo mapper se usa para listado, detalle y respuesta de PATCH.

`UpdateUserDto` permite únicamente:

| Campo    | Validación                       | Omitido     | null      |
| -------- | -------------------------------- | ----------- | --------- |
| nombre   | String con contenido, máximo 100 | Se conserva | Rechazado |
| apellido | String con contenido, máximo 100 | Se conserva | Rechazado |
| telefono | String, máximo 20                | Se conserva | Permitido |

PATCH vacío devuelve el perfil actual. La selección explícita del servicio
impide copiar propiedades internas; el repositorio usa UPDATE de los campos
presentes y no reinserta usuarios desaparecidos concurrentemente.

`idUsuario`, `authId`, `correo`, `rol`, `estado`, `claveHash`, `clave_hash`,
`fechaCreacion`, contraseñas y cualquier propiedad adicional producen 400 por
la ValidationPipe global (`whitelist` y `forbidNonWhitelisted`). El ID de ruta
debe ser un entero positivo de 32 bits.

## Paginación, filtros y ordenamiento

Se reutilizan sin cambios `PaginationQueryDto` y `PaginationResult`:

```json
{ "content": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

Página desde cero, tamaño 20 por defecto y rango de 1 a 100. QueryBuilder aplica
`skip/take` y `getManyAndCount` en PostgreSQL, sin paginación en memoria.

`UserSearchQueryDto` admite filtros combinables:

- `nombre`, `apellido`, `correo`: coincidencia parcial ILIKE parametrizada,
  escapando `%`, `_` y `\` del cliente para tratarlos literalmente.
- `rol`: ADMIN, CLIENTE, EMPRENDEDOR o REPARTIDOR.
- `estado`: ACTIVO o INACTIVO.

`sortBy` permite solo `idUsuario`, `nombre`, `apellido`, `correo`, `rol` y `estado`.
Un mapa explícito traduce estos valores a columnas. `sortDirection` admite ASC/DESC;
el default es `idUsuario ASC`. Los demás órdenes se desempatan por `idUsuario`
en la misma dirección. Nunca se ordena por hashes ni `authId`.

## Errores

Se reutiliza el filtro global Problem Details:

- 400: ID, DTO o query inválidos, incluidas propiedades no autorizadas.
- 401: JWT ausente, inválido o expirado según el guard existente.
- 403: usuario autenticado con rol distinto de ADMIN.
- 404: usuario inexistente.
- 500: error inesperado, con mensaje seguro sin SQL ni detalles internos.

No se fabrican reglas 422 ni traducciones genéricas a 409. Los campos UNIQUE
no son modificables en este bloque. POST y DELETE no tienen rutas registradas,
por lo que una solicitud a esos métodos obtiene 404 de ruta, incluso con ADMIN.

## Compatibilidad con Auth

Login conserva correo + `bcrypt.compare` y el JWT con `sub` (correo), `idUsuario`
y `rol`, con duración de 3600 segundos. Los guards y `request.user` no cambian.
El PATCH no modifica credenciales, identidad, correo, rol, estado ni relaciones.
El ownership de Deliveries continúa buscando al repartidor por `idUsuario`.

La entidad mantiene `claveHash` nullable. No se modifica su selección en TypeORM,
pues `findByEmail` necesita el hash para autenticar. La frontera pública queda
protegida mediante el mapper explícito y la autorización de los endpoints.

## Operaciones pendientes y motivos

**POST pendiente:** `auth_id` es UUID obligatorio y UNIQUE
(`usuario_auth_id_key`), pero no está definido cómo se origina entre Supabase Auth
y autenticación local. No se generan UUID de cuentas desde esta API ni se añade
un flujo de credenciales. Los UUID de las fixtures pertenecen únicamente a las
bases temporales de pruebas.

**DELETE pendiente:** la eliminación está restringida por
`fk_tienda_emprendedor`, `fk_pedido_cliente` y `fk_repartidor_usuario`, sin cascadas.
Entregas se relaciona indirectamente a través de pedido y repartidor. Además,
eliminar una cuenta no revoca los JWT ya emitidos con el mecanismo actual.
No se alteran migraciones ni relaciones para facilitar la eliminación.

**Campos sensibles pendientes:** cambios de correo, rol, estado o contraseña
requieren definir sus efectos sobre autenticación y sesiones. Auth actualmente
no valida `estado` al hacer login y los guards no recargan el usuario desde la
base de datos; tokens ya emitidos conservan sus datos hasta expirar. Este bloque
no cambia esos comportamientos ni presenta la desactivación como implementada.

La unicidad de correo (`usuario_correo_key`), los CHECK de rol/estado y el esquema
permanecen intactos. No se añaden Swagger, cambios de frontend, MongoDB ni nuevas
dependencias.

## Pruebas y verificaciones

Las unitarias nuevas comprueban mapper, privacidad incluso con relaciones
cargadas, paginación delegada, selección de campos, PATCH parcial, nulabilidad,
404, IDs inválidos y propagación de errores inesperados.

Las HTTP usan Nest real, Supertest, `configureHttp`, PostgreSQL 16 temporal y las
migraciones reales. Obtienen JWT mediante el login real, sin mocks funcionales ni
guards desactivados. Comprueban 401 y 403 en cada endpoint, contratos exactos,
campos protegidos, persistencia del PATCH, login posterior, filtros, paginación,
orden y ausencia de rutas POST/DELETE. No ejecutan seeds globales ni conectan a
Supabase. El helper cierra aplicación, DataSource y contenedor; se restaura el
valor previo de JWT_SECRET al finalizar la suite.

Resultados locales:

| Comprobación                                   | Resultado                        |
| ---------------------------------------------- | -------------------------------- |
| Prettier de archivos del bloque                | Aprobado                         |
| ESLint completo, sin autofix global            | Aprobado                         |
| TypeScript `--noEmit --incremental false`      | Aprobado                         |
| Build                                          | Aprobado                         |
| Unitarias completas                            | 229 pruebas, 23 suites; 1,885 s  |
| Unitarias nuevas de Usuarios                   | 14 pruebas                       |
| Cobertura existente                            | 229 pruebas aprobadas; 1,826 s   |
| Integración completa                           | 274 pruebas, 13 suites; 30,982 s |
| HTTP nuevas de Usuarios, ejecución focalizada  | 74 pruebas; 10,035 s             |
| Seguridad HTTP existente, ejecución específica | 5 pruebas; 2,576 s               |
| `npm run test:e2e`                             | 259 pruebas, 6 suites; 19,943 s  |
| `git diff --check`                             | Sin errores                      |

La cobertura configurada sigue midiendo Orders y Deliveries: statements **95,85%**,
branches **87,22%**, functions **87,50%**, lines **96,20%**. Los cuatro indicadores
superan el umbral existente del 70%. No se modifican umbrales ni exclusiones y
estos porcentajes no se presentan como cobertura de Usuarios.

Las cuatro unitarias existentes de Auth y las cinco HTTP de seguridad siguen
pasando, junto con las regresiones de Stores, Products, Orders y Deliveries.
Las nuevas HTTP demuestran además que el login sigue funcionando después de un
PATCH permitido y que permanecen intactos todos los campos ajenos al perfil.
Los totales de integración, seguridad y e2e se solapan y no deben sumarse.

Al finalizar todas las pruebas, `docker ps` no mostró contenedores activos.
