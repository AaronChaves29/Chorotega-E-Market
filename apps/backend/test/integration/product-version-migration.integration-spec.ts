import { randomUUID } from 'node:crypto';
import { withPostgresTestDatabase } from '../support/postgres-test-database';
import { Product } from '../../src/modules/products/entities/product.entity';
import { User } from '../../src/modules/users/entities/user.entity';
import { Store } from '../../src/modules/stores/entities/store.entity';
import { Category } from '../../src/modules/categories/entities/category.entity';

describe('Migración incremental de versión de productos', () => {
  it('actualiza datos existentes de tres migraciones, conserva IDs y stock, y no se repite', async () => {
    await withPostgresTestDatabase(async ({ dataSource: ds }) => {
      const user = await ds.getRepository(User).save({
        authId: randomUUID(),
        nombre: 'Prueba',
        apellido: 'Prueba',
        correo: 'migration@example.test',
        rol: 'EMPRENDEDOR',
      });
      const store = await ds.getRepository(Store).save({
        idEmprendedor: user.idUsuario,
        nombre: 'Prueba',
        direccion: 'Prueba',
      });
      const category = await ds
        .getRepository(Category)
        .save({ nombre: 'Prueba' });
      const product = await ds.getRepository(Product).save({
        idTienda: store.idTienda,
        idCategoria: category.idCategoria,
        nombre: 'Existente',
        precio: '12.50',
        cantidadDisponible: 7,
      });
      // Recrea el estado anterior con historial y datos reales; solo en el contenedor.
      await ds.undoLastMigration();
      const columns = await ds.query<{ column_name: string }[]>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'producto' AND column_name = 'version'",
      );
      expect(columns).toHaveLength(0);
      const migrations = await ds.runMigrations();
      expect(migrations.map((m) => m.name)).toEqual([
        'AddProductVersion1793296800000',
      ]);
      expect(
        await ds
          .getRepository(Product)
          .findOneByOrFail({ idProducto: product.idProducto }),
      ).toMatchObject({
        nombre: 'Existente',
        precio: '12.50',
        cantidadDisponible: 7,
        version: 1,
        idTienda: store.idTienda,
      });
      expect(await ds.runMigrations()).toEqual([]);
      expect(await ds.getRepository(Product).count()).toBe(1);
      const [column] = await ds.query<
        { is_nullable: string; column_default: string }[]
      >(
        "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'producto' AND column_name = 'version'",
      );
      expect(column).toMatchObject({ is_nullable: 'NO', column_default: '1' });
    });
  });
});
