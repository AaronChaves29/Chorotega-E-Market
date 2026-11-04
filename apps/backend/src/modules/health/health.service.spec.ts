import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import type { DataSource } from 'typeorm';

describe('HealthService: contrato mínimo', () => {
  const query = jest.fn();
  const service = new HealthService({ query } as unknown as DataSource);
  beforeEach(() => query.mockReset());
  it('consulta SELECT 1 y no devuelve metadata aunque el driver la proporcione', async () => {
    query.mockResolvedValue([
      { database: 'private-db', password: 'private-password' },
    ]);
    await expect(service.checkConnection()).resolves.toEqual({
      status: 'connected',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('falla con 503 sin propagar detalles del driver', async () => {
    query.mockRejectedValue(
      new Error('postgresql://private:password@host/db SELECT private'),
    );
    const error = await service
      .checkConnection()
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect(
      JSON.stringify((error as ServiceUnavailableException).getResponse()),
    ).not.toMatch(/postgresql|password|SELECT/);
  });
});
