import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { withPostgresTestDatabase } from '../support/postgres-test-database';
import { User } from '../../src/modules/users/entities/user.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import {
  createProductionMigrationDataSource,
  runProductionMigrations,
} from '../../src/database/production-migrations';

describe('Store social contact additive migration on populated PostgreSQL', () => {
  it('preserves legacy data, adds nullable bounded columns, runs once and rolls back only those columns', async () => {
    await withPostgresTestDatabase(async ({ dataSource: ds, container }) => {
      const user = await ds.getRepository(User).save({
        authId: randomUUID(),
        nombre: 'Local',
        apellido: 'Prueba',
        correo: 'social-migration@example.test',
        rol: 'EMPRENDEDOR',
      });
      const store = await ds.getRepository(Store).save({
        idEmprendedor: user.idUsuario,
        nombre: 'Existente',
        direccion: 'Nicoya',
        telefono: '88888888',
      });
      await ds.undoLastMigration();
      const legacy = await ds.query<{ nombre: string; telefono: string }[]>(
        'SELECT nombre, telefono FROM tienda WHERE id_tienda = $1',
        [store.idTienda],
      );
      expect(legacy).toEqual([{ nombre: 'Existente', telefono: '88888888' }]);
      expect(
        await ds.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'tienda' AND column_name IN ('instagram_url', 'facebook_url', 'whatsapp_comercial')",
        ),
      ).toHaveLength(0);
      // Use the actual production registry/executor, connected ONLY to this container.
      const production = createProductionMigrationDataSource({
        NODE_ENV: 'production',
        DATABASE_URL: container.getConnectionUri(),
        DATABASE_SSL: 'true',
      });
      // The local PostgreSQL fixture does not provide TLS; production configuration
      // itself remains unchanged and is separately tested with validated TLS.
      if (production.options.type !== 'postgres')
        throw new Error('PostgreSQL required');
      const migrated = new DataSource({ ...production.options, ssl: false });
      expect(await runProductionMigrations(migrated)).toBe(1);
      const updated = await ds
        .getRepository(Store)
        .findOneByOrFail({ idTienda: store.idTienda });
      expect(updated).toMatchObject({
        idEmprendedor: user.idUsuario,
        nombre: 'Existente',
        telefono: '88888888',
        instagramUrl: null,
        facebookUrl: null,
        whatsappComercial: null,
      });
      const columns = await ds.query<
        {
          column_name: string;
          is_nullable: string;
          character_maximum_length: number;
        }[]
      >(
        "SELECT column_name, is_nullable, character_maximum_length FROM information_schema.columns WHERE table_name = 'tienda' AND column_name IN ('instagram_url', 'facebook_url', 'whatsapp_comercial') ORDER BY column_name",
      );
      expect(columns).toEqual([
        {
          column_name: 'facebook_url',
          is_nullable: 'YES',
          character_maximum_length: 500,
        },
        {
          column_name: 'instagram_url',
          is_nullable: 'YES',
          character_maximum_length: 500,
        },
        {
          column_name: 'whatsapp_comercial',
          is_nullable: 'YES',
          character_maximum_length: 16,
        },
      ]);
      expect(await ds.runMigrations()).toEqual([]);
      await ds.undoLastMigration();
      expect(await ds.query('SELECT id_tienda FROM tienda')).toEqual([
        { id_tienda: store.idTienda },
      ]);
      expect(await ds.getRepository(User).count()).toBe(1);
      expect((await ds.runMigrations()).map((m) => m.name)).toEqual([
        'AddStoreSocialContact1794772600000',
      ]);
    });
  });
});
