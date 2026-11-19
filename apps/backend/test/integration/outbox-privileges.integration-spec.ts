import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, type MigrationInterface, type QueryRunner } from 'typeorm';
import { withPostgresTestDatabase } from '../support/postgres-test-database';
import { runProductionMigrations } from '../../src/database/production-migrations';

class FailAfterOutbox1890000000001 implements MigrationInterface {
  up(): Promise<void> {
    return Promise.reject(new Error('Failure after outbox, before commit'));
  }
  down(): Promise<void> {
    return Promise.resolve();
  }
}

const tables = ['pedido_audit_outbox', 'pedido_audit_sequence'];
function source(ds: DataSource, fail = false) {
  return new DataSource({
    ...ds.options,
    migrations: [
      ...ds.migrations.map(
        (m) => m.constructor as new () => MigrationInterface,
      ),
      ...(fail ? [FailAfterOutbox1890000000001] : []),
    ],
  });
}

async function expectPrivate(ds: DataSource, roles: string[]) {
  for (const table of tables) {
    const rows: { owner: string; rls: boolean; public_grants: number }[] =
      await ds.query(
        `SELECT pg_get_userbyid(relowner) AS owner, relrowsecurity AS rls,
          (SELECT count(*)::int FROM aclexplode(relacl) WHERE grantee = 0) AS public_grants
         FROM pg_class WHERE oid = $1::regclass`,
        [`public.${table}`],
      );
    expect(rows[0]).toMatchObject({
      owner: 'test',
      rls: true,
      public_grants: 0,
    });
    for (const role of roles) {
      for (const privilege of [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ]) {
        const access: { allowed: boolean }[] = await ds.query(
          'SELECT has_table_privilege($1, $2, $3) AS allowed',
          [role, `public.${table}`, privilege],
        );
        expect(access[0].allowed).toBe(false);
      }
    }
  }
  // The actual creating technical role retains read/write access under RLS.
  await ds.query('INSERT INTO public.pedido_audit_sequence VALUES (123, 1)');
  expect(
    await ds.query(
      'SELECT secuencia FROM public.pedido_audit_sequence WHERE pedido_id=123',
    ),
  ).toEqual([{ secuencia: 1 }]);
}

describe('Outbox privileges using the real transactional migration executor', () => {
  it('works without Supabase roles and leaves the technical owner operational', async () => {
    await withPostgresTestDatabase(async ({ dataSource: ds }) => {
      const roles = await ds.query<{ rolname: string }[]>(
        "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')",
      );
      expect(roles).toEqual([]);
      await expectPrivate(ds, []);
    });
  });

  it('revokes PUBLIC and Supabase default grants atomically, supports rollback and rerun', async () => {
    await withPostgresTestDatabase(async ({ dataSource: ds }) => {
      await ds.undoLastMigration();
      await ds.query('CREATE ROLE anon NOLOGIN');
      await ds.query('CREATE ROLE authenticated NOLOGIN');
      await ds.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC, anon, authenticated',
      );
      expect(await runProductionMigrations(source(ds))).toBe(1);
      await expectPrivate(ds, ['anon', 'authenticated']);
      const runner: QueryRunner = ds.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        await runner.query('SET LOCAL ROLE anon');
        await expect(
          runner.query('SELECT * FROM public.pedido_audit_sequence'),
        ).rejects.toThrow(/permission denied/);
        await runner.rollbackTransaction();
      } finally {
        await runner.release();
      }
      await ds.undoLastMigration();
      for (const table of tables) {
        expect(
          await ds.query('SELECT to_regclass($1) AS name', [`public.${table}`]),
        ).toEqual([{ name: null }]);
      }
      expect(await runProductionMigrations(source(ds))).toBe(1);
      await expectPrivate(ds, ['anon', 'authenticated']);
      expect(await runProductionMigrations(source(ds))).toBe(0);
    });
  });

  it('a later failure rolls back outbox DDL, ACL and migration history together', async () => {
    await withPostgresTestDatabase(async ({ dataSource: ds }) => {
      await ds.undoLastMigration();
      await expect(runProductionMigrations(source(ds, true))).rejects.toThrow(
        'No se completaron',
      );
      for (const table of tables) {
        expect(
          await ds.query('SELECT to_regclass($1) AS name', [`public.${table}`]),
        ).toEqual([{ name: null }]);
      }
      expect(
        await ds.query('SELECT count(*)::int AS count FROM typeorm_migrations'),
      ).toEqual([{ count: 5 }]);
      expect(await runProductionMigrations(source(ds))).toBe(1);
    });
  });
});

describe('Existing production privilege proposal on isolated PostgreSQL only', () => {
  it('audits, preserves the technical role, revokes web privileges and generates executable recovery SQL', async () => {
    await withPostgresTestDatabase(async ({ dataSource: ds, container }) => {
      await ds.query('CREATE ROLE anon NOLOGIN');
      await ds.query('CREATE ROLE authenticated NOLOGIN');
      await ds.query('CREATE ROLE render_runtime NOLOGIN');
      await ds.query(
        'GRANT ALL ON ALL TABLES IN SCHEMA public TO render_runtime',
      );
      await ds.query(
        'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO render_runtime',
      );
      await ds.query(
        'GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC, anon, authenticated',
      );
      await ds.query(
        'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO PUBLIC, anon, authenticated',
      );
      const script = readFileSync(
        resolve(
          process.cwd(),
          '../../docs/laboratory/lab-07/sql/release-privileges.sql',
        ),
      );
      await container.copyContentToContainer([
        { content: script, target: '/tmp/release-privileges.sql' },
      ]);
      // A technical role relying only on PUBLIC would lose access: abort and
      // preserve the original ACL rather than silently breaking that runtime.
      await ds.query('CREATE ROLE fragile_runtime NOLOGIN');
      const refused = await container.exec([
        'psql',
        '-X',
        '-U',
        'test',
        '-d',
        'chorotega_test',
        '-v',
        'technical_role=fragile_runtime',
        '-v',
        'recovery_file=/tmp/refused-recovery.sql',
        '-f',
        '/tmp/release-privileges.sql',
      ]);
      expect(refused.exitCode).not.toBe(0);
      expect(
        await ds.query(
          "SELECT has_table_privilege('anon','public.typeorm_migrations','SELECT') AS allowed",
        ),
      ).toEqual([{ allowed: true }]);
      const result = await container.exec([
        'psql',
        '-X',
        '-U',
        'test',
        '-d',
        'chorotega_test',
        '-v',
        'technical_role=render_runtime',
        '-v',
        'recovery_file=/tmp/recovery.sql',
        '-f',
        '/tmp/release-privileges.sql',
      ]);
      expect(result.exitCode).toBe(0);
      for (const role of ['anon', 'authenticated']) {
        expect(
          await ds.query(
            "SELECT has_table_privilege($1,'public.typeorm_migrations','SELECT') AS allowed",
            [role],
          ),
        ).toEqual([{ allowed: false }]);
        expect(
          await ds.query(
            "SELECT has_table_privilege($1,'public.pedido','TRUNCATE') AS allowed",
            [role],
          ),
        ).toEqual([{ allowed: false }]);
      }
      expect(
        await ds.query('SELECT count(*)::int AS count FROM typeorm_migrations'),
      ).toEqual([{ count: 6 }]);
      const recovered = await container.exec([
        'psql',
        '-X',
        '-U',
        'test',
        '-d',
        'chorotega_test',
        '-v',
        'ON_ERROR_STOP=1',
        '--single-transaction',
        '-f',
        '/tmp/recovery.sql',
      ]);
      expect(recovered.exitCode).toBe(0);
      expect(
        await ds.query(
          "SELECT has_table_privilege('anon','public.typeorm_migrations','SELECT') AS allowed",
        ),
      ).toEqual([{ allowed: true }]);
      expect(
        await ds.query(
          "SELECT has_table_privilege('authenticated','public.pedido','TRUNCATE') AS allowed",
        ),
      ).toEqual([{ allowed: true }]);
    });
  });
});

describe('Unexpected inherited web permissions', () => {
  it('fails closed and rolls back instead of silently exposing the new tables', async () => {
    await withPostgresTestDatabase(async ({ dataSource: ds }) => {
      await ds.undoLastMigration();
      await ds.query('CREATE ROLE anon NOLOGIN');
      await ds.query('CREATE ROLE unexpected_parent NOLOGIN');
      await ds.query('GRANT unexpected_parent TO anon');
      await ds.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO unexpected_parent',
      );
      await expect(runProductionMigrations(source(ds))).rejects.toThrow(
        'No se completaron',
      );
      for (const table of tables) {
        expect(
          await ds.query('SELECT to_regclass($1) AS name', [`public.${table}`]),
        ).toEqual([{ name: null }]);
      }
      expect(
        await ds.query('SELECT count(*)::int AS count FROM typeorm_migrations'),
      ).toEqual([{ count: 5 }]);
    });
  });
});
