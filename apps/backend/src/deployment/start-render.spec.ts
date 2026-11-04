import { randomBytes } from 'node:crypto';
import { startRender } from './start-render';

function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    PORT: '10000',
    DATABASE_URL: 'postgresql://localhost/test',
    DATABASE_SSL: 'true',
    MONGODB_URI: 'mongodb+srv://cluster.example.test/test',
    MONGODB_DATABASE: 'test',
    JWT_SECRET: randomBytes(32).toString('hex'),
    CORS_ORIGIN: 'https://frontend.example.test',
  };
}

describe('Arranque Render antes de aceptar tráfico', () => {
  let diagnostics: jest.SpyInstance<
    boolean,
    Parameters<typeof process.stdout.write>
  >;
  beforeEach(() => {
    diagnostics = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());
  it('valida, espera las migraciones y solo entonces arranca Nest', async () => {
    let finish!: (count: number) => void;
    const migrate = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    );
    const start = jest.fn().mockResolvedValue(undefined);
    const result = startRender(environment(), { migrate, start });
    expect(migrate).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    finish(3);
    await result;
    expect(start).toHaveBeenCalledTimes(1);
    expect(diagnostics).not.toHaveBeenCalled();
  });
  it('no conecta ni migra cuando falta configuración crítica', async () => {
    const migrate = jest.fn().mockResolvedValue(0);
    const start = jest.fn().mockResolvedValue(undefined);
    await expect(
      startRender({ NODE_ENV: 'production' }, { migrate, start }),
    ).rejects.toThrow('DATABASE_URL');
    expect(migrate).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(diagnostics).toHaveBeenCalledWith(
      expect.stringContaining('"stage":"validacion_variables"'),
    );
  });
  it('un fallo de migración impide arrancar HTTP', async () => {
    const migrate = jest.fn().mockRejectedValue(new Error('Migración fallida'));
    const start = jest.fn().mockResolvedValue(undefined);
    await expect(
      startRender(environment(), { migrate, start }),
    ).rejects.toThrow('Migración fallida');
    expect(start).not.toHaveBeenCalled();
    expect(diagnostics).toHaveBeenCalledWith(
      expect.stringContaining('"stage":"migraciones_postgresql"'),
    );
  });
  it('distingue un fallo de Nest de uno de migraciones y conserva el error para el código de salida', async () => {
    const migrate = jest.fn().mockResolvedValue(0);
    const original = Object.assign(
      new Error('mongodb+srv://user:private-password@private-host/database'),
      { name: 'MongoServerSelectionError', code: 'ENOTFOUND' },
    );
    const start = jest.fn().mockRejectedValue(original);
    await expect(startRender(environment(), { migrate, start })).rejects.toBe(
      original,
    );
    expect(JSON.parse(String(diagnostics.mock.calls[0][0]))).toMatchObject({
      stage: 'arranque_nestjs',
      type: 'MongoServerSelectionError',
      code: 'ENOTFOUND',
      message: 'Mensaje original omitido por seguridad.',
    });
  });
  it('cada reinicio comprueba pendientes, incluso cuando no hay nuevas migraciones', async () => {
    const migrate = jest.fn().mockResolvedValue(0);
    const start = jest.fn().mockResolvedValue(undefined);
    await startRender(environment(), { migrate, start });
    await startRender(environment(), { migrate, start });
    expect(migrate).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledTimes(2);
  });
});
