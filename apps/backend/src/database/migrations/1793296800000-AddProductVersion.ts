import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductVersion1793296800000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // DEFAULT rellena los productos existentes sin eliminar ni recrear registros.
    await runner.query(
      'ALTER TABLE "producto" ADD COLUMN "version" integer NOT NULL DEFAULT 1',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE "producto" DROP COLUMN "version"');
  }
}
