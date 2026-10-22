import { rootCertificates } from 'node:tls';
import { createDatabaseOptions } from './database.options';

const url = 'postgresql://localhost/config_test';
describe('Opciones PostgreSQL y TLS', () => {
  it('verifica certificado de producción con CA de confianza por defecto', () => {
    expect(
      createDatabaseOptions(url, 'true', { production: true }),
    ).toMatchObject({
      type: 'postgres',
      ssl: { rejectUnauthorized: true },
      synchronize: false,
      migrationsRun: false,
      migrationsTableName: 'typeorm_migrations',
    });
  });
  it('admite CA PEM explícita sin desactivar verificación', () =>
    expect(
      createDatabaseOptions(url, 'true', {
        production: true,
        ca: rootCertificates[0],
      }),
    ).toMatchObject({
      ssl: { rejectUnauthorized: true, ca: rootCertificates[0] },
    }));
  it('admite saltos de línea escapados en la CA', () =>
    expect(
      createDatabaseOptions(url, 'true', {
        production: true,
        ca: rootCertificates[0].replace(/\n/g, '\\n'),
      }),
    ).toMatchObject({ ssl: { ca: rootCertificates[0] } }));
  it('rechaza TLS desactivado en producción', () =>
    expect(() =>
      createDatabaseOptions(url, 'false', { production: true }),
    ).toThrow('DATABASE_SSL'));
  it('mantiene la firma previa usada por Testcontainers', () =>
    expect(createDatabaseOptions(url, 'false')).toMatchObject({
      ssl: false,
      synchronize: false,
      migrationsRun: false,
    }));
  it.each([
    'sslmode=disable',
    'sslmode=no-verify',
    'sslmode=require',
    'ssl=false',
    'sslrootcert=private-file',
    'uselibpqcompat=true',
  ])('impide sobrescritura TLS desde URL: %s', (query) =>
    expect(() =>
      createDatabaseOptions(`${url}?${query}`, 'true', { production: true }),
    ).toThrow('DATABASE_URL'),
  );
  it('permite parámetros ajenos a TLS', () =>
    expect(
      createDatabaseOptions(`${url}?application_name=config-test`, 'true', {
        production: true,
      }),
    ).toMatchObject({ ssl: { rejectUnauthorized: true } }));
  it('rechaza CA inválida sin revelar su contenido', () =>
    expect(() =>
      createDatabaseOptions(url, 'true', {
        production: true,
        ca: 'private-invalid-marker',
      }),
    ).toThrow('DATABASE_CA_CERT debe ser un certificado PEM válido.'));
  it('rechaza CA cuando TLS está desactivado', () =>
    expect(() =>
      createDatabaseOptions(url, 'false', { ca: rootCertificates[0] }),
    ).toThrow('DATABASE_CA_CERT'));
  it.each([undefined, 'not-a-url', 'https://private-marker.example.test'])(
    'rechaza URL inválida',
    (value) =>
      expect(() => createDatabaseOptions(value)).toThrow(/DATABASE_URL/),
  );
});
