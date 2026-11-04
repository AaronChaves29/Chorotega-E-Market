import { JsonLogger } from './json-logger';

describe('Logger JSON seguro en stdout', () => {
  let stdout: jest.SpyInstance<
    boolean,
    Parameters<typeof process.stdout.write>
  >;
  let stderr: jest.SpyInstance<
    boolean,
    Parameters<typeof process.stderr.write>
  >;
  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as const)(
    '%s produce una sola línea JSON y omite parámetros arbitrarios',
    (level) => {
      const logger = new JsonLogger();
      const privateData = {
        password: 'password-marker',
        token: 'jwt-marker',
        cookie: 'cookie-marker',
        query: 'SELECT private',
        address: 'address-marker',
      };
      logger[level](
        privateData,
        'stack-private-marker',
        'unknown-private-context',
      );
      expect(stdout).toHaveBeenCalledTimes(1);
      const text = String(stdout.mock.calls[0][0]);
      expect(text.split('\n')).toHaveLength(2);
      const record: unknown = JSON.parse(text);
      expect(record).toEqual({
        timestamp: expect.any(String) as unknown,
        level,
        event: ['error', 'fatal'].includes(level)
          ? 'framework_error'
          : 'framework_message',
        context: 'Application',
        reason: 'framework_details_omitted',
        ...(['error', 'fatal'].includes(level) ? { type: 'Error' } : {}),
      });
      expect(text).not.toMatch(/marker|SELECT|password|cookie/);
      expect(stderr).not.toHaveBeenCalled();
    },
  );
  it('no serializa Error, stack ni causas cíclicas', () => {
    const error = new Error('password-private');
    error.cause = error;
    new JsonLogger().error(error, 'JWT=private\n at private', 'Bootstrap');
    expect(String(stdout.mock.calls[0][0])).not.toContain('private');
    expect(stderr).not.toHaveBeenCalled();
  });
  it('emite eventos operativos con razón fija y conteo numérico', () => {
    new JsonLogger().operational('migrations_completed', 'log', 3);
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({
      event: 'migrations_completed',
      context: 'Migrations',
      reason: 'pending_migrations_applied',
      count: 3,
    });
  });
  it('respeta niveles deshabilitados', () => {
    const logger = new JsonLogger();
    logger.setLogLevels([]);
    logger.error('private');
    logger.operational('startup_aborted', 'error');
    expect(stdout).not.toHaveBeenCalled();
  });
  it('conserva tipo y código permitidos para diagnóstico sin mensaje ni stack', () => {
    const error = Object.assign(new Error('SQL SELECT password=private'), {
      name: 'QueryFailedError',
      code: '40P01',
      query: 'private-query',
    });
    new JsonLogger().error(error, 'private-stack', 'Bootstrap');
    const text = String(stdout.mock.calls[0][0]);
    expect(JSON.parse(text)).toMatchObject({
      event: 'framework_error',
      type: 'QueryFailedError',
      code: '40P01',
    });
    expect(text).not.toMatch(/SQL|password|private|SELECT/);
  });
});
