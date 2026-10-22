import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordHashToUser1791352458237 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuario
      ADD COLUMN clave_hash VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE usuario
      DROP COLUMN clave_hash
    `);
  }
}
