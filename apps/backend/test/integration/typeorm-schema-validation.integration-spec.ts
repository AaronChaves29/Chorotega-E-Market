import { describe, expect, it } from '@jest/globals';
import { withPostgresTestDatabase } from '../support/postgres-test-database';

describe('Validación del esquema migrado contra los metadatos TypeORM', () => {
  it('no propone cambios para las nueve entidades después de aplicar las migraciones', async () => {
    await withPostgresTestDatabase(async ({ dataSource }) => {
      expect(dataSource.options.synchronize).toBe(false);
      expect(dataSource.entityMetadatas).toHaveLength(9);
      expect(
        dataSource.entityMetadatas.every((metadata) => metadata.synchronize),
      ).toBe(true);

      // log obtiene el DDL propuesto en memoria; no lo ejecuta.
      const { upQueries } = await dataSource.driver.createSchemaBuilder().log();

      if (upQueries.length > 0) {
        throw new Error(
          `El esquema migrado difiere de los metadatos TypeORM: ${upQueries.length} operaciones propuestas.\n` +
            upQueries
              .map(
                ({ query, parameters }) =>
                  `${query}\nParámetros: ${JSON.stringify(parameters ?? [])}`,
              )
              .join('\n'),
        );
      }

      expect(upQueries).toHaveLength(0);
    });
  });
});
