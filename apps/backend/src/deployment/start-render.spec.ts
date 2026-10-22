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
  });
  it('no conecta ni migra cuando falta configuración crítica', async () => {
    const migrate = jest.fn().mockResolvedValue(0);
    const start = jest.fn().mockResolvedValue(undefined);
    await expect(
      startRender({ NODE_ENV: 'production' }, { migrate, start }),
    ).rejects.toThrow('DATABASE_URL');
    expect(migrate).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
  it('un fallo de migración impide arrancar HTTP', async () => {
    const migrate = jest.fn().mockRejectedValue(new Error('Migración fallida'));
    const start = jest.fn().mockResolvedValue(undefined);
    await expect(
      startRender(environment(), { migrate, start }),
    ).rejects.toThrow('Migración fallida');
    expect(start).not.toHaveBeenCalled();
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
