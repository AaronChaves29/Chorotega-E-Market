import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignTimestampDefaults1788998400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // now() conserva la semántica de CURRENT_TIMESTAMP y coincide con TypeORM.
    await queryRunner.query(`
      ALTER TABLE pedido ALTER COLUMN fecha_creacion SET DEFAULT now();
      ALTER TABLE entrega ALTER COLUMN fecha_asignacion SET DEFAULT now();
      ALTER TABLE usuario ALTER COLUMN fecha_creacion SET DEFAULT now();
      ALTER TABLE tienda ALTER COLUMN fecha_creacion SET DEFAULT now();
      ALTER TABLE producto ALTER COLUMN fecha_publicacion SET DEFAULT now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pedido ALTER COLUMN fecha_creacion SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE entrega ALTER COLUMN fecha_asignacion SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE usuario ALTER COLUMN fecha_creacion SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE tienda ALTER COLUMN fecha_creacion SET DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE producto ALTER COLUMN fecha_publicacion SET DEFAULT CURRENT_TIMESTAMP;
    `);
  }
}
