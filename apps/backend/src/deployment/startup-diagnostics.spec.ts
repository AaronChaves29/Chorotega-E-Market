import { reportStartupFailure } from './startup-diagnostics';

describe('Diagnósticos seguros de arranque', () => {
  let output: jest.SpyInstance;
  beforeEach(() => {
    output = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());
  function line(): string {
    return output.mock.calls.flat().join(' ');
  }

  it('muestra la variable faltante sin imprimir configuración ni stack', () => {
    const error = new Error('La variable MONGODB_DATABASE es obligatoria.');
    error.stack = 'STACK_PRIVATE_MARKER';
    reportStartupFailure('validacion_variables', error);
    expect(JSON.parse(line())).toMatchObject({
      event: 'startup_failure',
      stage: 'validacion_variables',
      type: 'Error',
      message: 'La variable MONGODB_DATABASE es obligatoria.',
    });
    expect(line()).not.toContain('STACK_PRIVATE_MARKER');
  });
  it('conserva el mensaje original conocido de TLS', () => {
    reportStartupFailure(
      'migraciones_postgresql',
      new Error('self-signed certificate in certificate chain'),
    );
    expect(line()).toContain('self-signed certificate in certificate chain');
  });
  it('recupera el tipo y código original desde las causas internas sin imprimir SQL', () => {
    const original = Object.assign(new Error('SQL_PRIVATE_MARKER'), {
      name: 'QueryFailedError',
      code: '42P07',
      query: 'SQL_QUERY_PRIVATE_MARKER',
      parameters: ['PARAMETER_PRIVATE_MARKER'],
    });
    reportStartupFailure(
      'migraciones_postgresql',
      new Error('Wrapper', { cause: original }),
    );
    expect(JSON.parse(line())).toMatchObject({
      type: 'QueryFailedError',
      code: '42P07',
    });
    expect(line()).toContain('Mensaje original omitido por seguridad.');
    expect(line()).not.toMatch(
      /SQL_PRIVATE|SQL_QUERY_PRIVATE|PARAMETER_PRIVATE/,
    );
  });
  it.each([
    'postgresql://private-user:password-marker@private-host/db',
    'mongodb+srv://private-user:password-marker@private-host/db',
    'JWT_SECRET=jwt-private-marker',
    'DATABASE_CA_CERT=-----BEGIN CERTIFICATE-----\nprivate-certificate-marker\n-----END CERTIFICATE-----',
    'password authentication failed for user "private-user"',
    'La variable JWT_SECRET es obligatoria.\nJWT_SECRET=jwt-private-marker',
    'getaddrinfo ENOTFOUND private-host',
  ])(
    'omite mensajes arbitrarios que pueden contener datos privados: caso %#',
    (message) => {
      reportStartupFailure(
        'arranque_nestjs',
        Object.assign(new Error(message), { code: 'ENOTFOUND' }),
      );
      expect(JSON.parse(line())).toMatchObject({
        stage: 'arranque_nestjs',
        type: 'Error',
        code: 'ENOTFOUND',
        message: 'Mensaje original omitido por seguridad.',
      });
    },
  );
  it('no permite filtrar secretos mediante nombre o código del error', () => {
    reportStartupFailure(
      'arranque_nestjs',
      Object.assign(new Error('private-message'), {
        name: 'private-name',
        code: 'private-code',
      }),
    );
    expect(line()).not.toContain('private');
  });
  it.each([
    null,
    'secret-primitive-marker',
    { message: 'secret-object-marker', token: 'secret-token-marker' },
  ])(
    'no serializa valores lanzados que no sean Error: caso %#',
    (error: unknown) => {
      reportStartupFailure('arranque_nestjs', error);
      expect(JSON.parse(line())).toMatchObject({
        stage: 'arranque_nestjs',
        type: 'Error',
        message: 'Mensaje original omitido por seguridad.',
      });
    },
  );
  it('tolera causas cíclicas sin serializarlas', () => {
    const error = new Error('secret-cycle-marker');
    error.cause = error;
    reportStartupFailure('arranque_nestjs', error);
    expect(line()).not.toContain('secret-cycle-marker');
  });
});
