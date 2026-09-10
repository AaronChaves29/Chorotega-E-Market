# Infraestructura de integración con PostgreSQL

## Alcance y requisitos

Se incorpora `@testcontainers/postgresql` 12.1.0 como dependencia de desarrollo.
El paquete incluye `testcontainers` de forma transitiva; no hace falta instalar
otro cliente PostgreSQL porque TypeORM ya utiliza `pg`.

Esta versión requiere Node.js >=22.22 y un motor Docker accesible. El entorno
de auditoría utiliza Node 26.0.0 y el workflow fija Node 22.22.0. La ejecución
de integración ya está incorporada al CI.

La implementación sigue el [módulo PostgreSQL oficial de Testcontainers](https://node.testcontainers.org/modules/postgresql/).
Su `getConnectionUri()` proporciona la URL correspondiente al contenedor iniciado,
incluido el puerto asignado dinámicamente por Docker.

## Archivos y ejecución

- `test/support/postgres-test-database.ts`: inicio, migraciones, acceso a la base
  y limpieza reutilizables.
- `test/integration/postgres-infrastructure.integration-spec.ts`: comprobaciones
  del esquema y del cierre de recursos, también ante un fallo intencional.
- `test/jest-integration.json`: configuración separada para integración.
- `package.json`: script `test:integration` y dependencia de desarrollo.
- `package-lock.json`: versiones exactas resueltas.

Desde `apps/backend`, con Docker iniciado:

```bash
npm run test:integration
```

Jest ejecuta únicamente `test/integration/**/*.integration-spec.ts`, en serie
mediante `--runInBand`. El tiempo máximo por prueba o hook es de 180 segundos;
el arranque del contenedor dispone de 120 segundos. La primera ejecución puede
tardar más por la descarga de imágenes.

`npm test` mantiene su configuración unitaria bajo `src`; no descubre estas
pruebas. La prueba e2e preexistente tampoco forma parte del comando de integración.

## Ciclo de vida

1. Inicia un contenedor nuevo `postgres:16`, sin Compose, puertos fijos ni volúmenes
   persistentes compartidos. Genera una contraseña temporal dentro de la utilidad.
2. Construye un `DataSource` con la URL devuelta por ese contenedor y SSL desactivado.
   Reutiliza la función pura `createDatabaseOptions`, pero nunca importa
   `src/database/data-source.ts`, `AppModule` ni módulos de configuración que
   carguen `.env`. No toma `DATABASE_URL` ni `DATABASE_SSL` del entorno.
3. Registra explícitamente las nueve entidades y la clase real
   `CreateInitialSchema1788732000000`. No copia SQL ni utiliza archivos compilados
   descubiertos mediante un patrón de búsqueda.
4. Conserva `synchronize: false` y `migrationsRun: false`; después de
   `initialize()` llama explícitamente a `runMigrations()`.
5. Entrega el `DataSource` inicializado a las pruebas, sin cargar seeds globales.
6. Cierra primero TypeORM con `destroy()` y luego detiene y elimina el contenedor
   y sus volúmenes temporales con `stop()`. Se intenta detener el contenedor aunque
   falle `destroy()`. Si falla la inicialización o la migración, también se limpian
   los recursos obtenidos antes de propagar el error.

No se publica la URL ni la contraseña en mensajes. La base persistente de
desarrollo y cualquier conexión externa quedan fuera de esta configuración.

## Reutilización

Para una prueba aislada, `withPostgresTestDatabase` ejecuta el callback y limpia en
un bloque `finally`, tanto si termina correctamente como si falla:

```typescript
await withPostgresTestDatabase(async ({ dataSource }) => {
  const repository = dataSource.getRepository(Product);
  // Preparar aquí los datos específicos y realizar las comprobaciones.
});
```

Para compartir un contenedor entre pruebas de una misma suite, importar desde
`../support/postgres-test-database` y usar hooks de Jest:

```typescript
let database: PostgresTestDatabase | undefined;

beforeAll(async () => {
  database = await startPostgresTestDatabase();
});

afterAll(async () => {
  await database?.stop();
});
```

`stop()` admite llamadas repetidas y espera la misma limpieza si ya está en curso.
Cada invocación de inicio crea recursos propios; no existe un singleton ni estado
global que compartan archivos de pruebas. Las suites de catálogo y pedidos
reutilizan esta configuración para sus seis pruebas funcionales.

Las pruebas que compartan una base deben gestionar sus propios datos y limpieza
entre casos. La utilidad no trunca tablas ni abre transacciones automáticamente.
Al incorporar entidades o migraciones nuevas habrá que actualizar los registros
explícitos del helper y las expectativas del esquema cuando corresponda.

## Comprobaciones de infraestructura

La primera prueba verifica PostgreSQL 16, las nueve tablas del negocio,
`typeorm_migrations`, el registro de la migración inicial y la ausencia de
migraciones pendientes. Después comprueba que el `DataSource` está cerrado y que
ya no se pueden ejecutar comandos en el contenedor detenido.

La segunda provoca un error intencional dentro del callback y comprueba que el
error se propaga y los recursos se cierran igualmente. Son pruebas de
infraestructura; no cuentan como pruebas funcionales del catálogo.

Las seis pruebas funcionales gestionan sus datos mediante hooks de limpieza y
se ejecutan junto con estas dos comprobaciones en CI. Un cierre forzado del
proceso o del motor Docker no puede ejecutar `finally`; se conserva habilitada
la limpieza auxiliar de Testcontainers para recursos abandonados.

## Evidencia histórica de la infraestructura

Verificado el 9 de septiembre de 2026 con Node 26.0.0, Jest 30.4.2,
ts-jest 29.4.12, TypeORM 1.1.0 y TypeScript 5.9.3:

| Comprobación                                                   | Resultado                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Prettier y ESLint sobre los archivos nuevos                    | Correctos                                                        |
| `tsc --noEmit --incremental false -p tsconfig.json`            | Correcto                                                         |
| `npm run build`                                                | Correcto                                                         |
| `npm test -- --runInBand`                                      | 13 pruebas unitarias aprobadas, aproximadamente 0,6 s            |
| `npm run test:integration`                                     | 2 pruebas de infraestructura aprobadas, aproximadamente 94 s     |
| `docker ps` después de la ejecución                            | Solo permaneció el PostgreSQL de desarrollo que ya estaba activo |
| `docker ps -a --filter label=chorotega.test-suite=integration` | Sin resultados; contenedores de prueba eliminados                |

No quedaron contenedores temporales activos, incluido el auxiliar de limpieza.
No se modificó el contenedor de desarrollo. Las versiones de dependencias ya
presentes en el lockfile permanecieron iguales. La [validación final](validacion-final.md)
contiene el conteo actual y la confirmación del CI integrado con Node 22.22.0.
