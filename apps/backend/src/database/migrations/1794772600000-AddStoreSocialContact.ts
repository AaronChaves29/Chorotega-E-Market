import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreSocialContact1794772600000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "tienda"
      ADD COLUMN "instagram_url" varchar(500) NULL,
      ADD COLUMN "facebook_url" varchar(500) NULL,
      ADD COLUMN "whatsapp_comercial" varchar(16) NULL`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "tienda"
      DROP COLUMN "whatsapp_comercial",
      DROP COLUMN "facebook_url",
      DROP COLUMN "instagram_url"`);
  }
}
