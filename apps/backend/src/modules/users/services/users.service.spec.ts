import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UsersService } from './users.service';
import { UsersRepository } from '../repositories/users.repository';
import { User } from '../entities/user.entity';
import { UserSearchQueryDto } from '../dtos/user-search-query.dto';

describe('UsersService', () => {
  const repository = {
    findById: jest.fn(),
    search: jest.fn(),
    updateById: jest.fn(),
  };
  const service = new UsersService(repository as unknown as UsersRepository);
  const publicUser = {
    idUsuario: 3,
    nombre: 'Ana',
    apellido: 'Prueba',
    correo: 'ana@example.test',
    telefono: '88888888',
    rol: 'CLIENTE',
    estado: 'ACTIVO',
    fechaCreacion: new Date('2026-01-01T00:00:00Z'),
  };
  const entity = Object.assign(new User(), {
    ...publicUser,
    authId: 'uuid-interno',
    claveHash: 'hash-privado',
    clave_hash: 'hash-privado',
    tiendas: [],
    pedidos: [],
    repartidor: {},
  });
  beforeEach(() => {
    jest.resetAllMocks();
    repository.findById.mockResolvedValue(entity);
    repository.updateById.mockResolvedValue(entity);
  });
  it('devuelve solo el contrato administrativo, aunque la entidad tenga relaciones y hashes', async () => {
    const result = await service.findById(3);
    expect(result).toEqual(publicUser);
    expect(result).not.toBeInstanceOf(User);
    expect(repository.findById).toHaveBeenCalledWith(3);
  });
  it('delega filtros y mapea toda la página sin datos internos', async () => {
    const query = Object.assign(new UserSearchQueryDto(), { rol: 'CLIENTE' });
    repository.search.mockResolvedValue({
      content: [entity],
      page: 1,
      size: 1,
      totalElements: 2,
      totalPages: 2,
    });
    expect(await service.search(query)).toEqual({
      content: [publicUser],
      page: 1,
      size: 1,
      totalElements: 2,
      totalPages: 2,
    });
    expect(repository.search).toHaveBeenCalledWith(query);
  });
  it('PATCH modifica solo el nombre enviado y devuelve DTO', async () => {
    repository.updateById.mockResolvedValue({ ...entity, nombre: 'Nuevo' });
    expect(await service.update(3, { nombre: 'Nuevo' })).toEqual({
      ...publicUser,
      nombre: 'Nuevo',
    });
    expect(repository.updateById).toHaveBeenCalledWith(3, { nombre: 'Nuevo' });
  });
  it('PATCH conserva null explícito en teléfono y permite apellido', async () => {
    await service.update(3, { apellido: 'Otro', telefono: null });
    expect(repository.updateById).toHaveBeenCalledWith(3, {
      apellido: 'Otro',
      telefono: null,
    });
  });
  it('PATCH vacío no fabrica campos para actualizar', async () => {
    expect(await service.update(3, {})).toEqual(publicUser);
    expect(repository.updateById).toHaveBeenCalledWith(3, {});
  });
  it('selecciona campos explícitamente incluso fuera del límite HTTP', async () => {
    await service.update(
      3,
      Object.assign(
        { nombre: 'Nuevo' },
        {
          rol: 'ADMIN',
          claveHash: 'otro',
          correo: 'otro@example.test',
          authId: 'otro',
          estado: 'INACTIVO',
          idUsuario: 5,
          fechaCreacion: new Date(),
        },
      ),
    );
    expect(repository.updateById).toHaveBeenCalledWith(3, { nombre: 'Nuevo' });
  });
  it.each(['findById', 'update'] as const)(
    '%s devuelve 404 si no existe',
    async (method) => {
      repository.findById.mockResolvedValue(null);
      repository.updateById.mockResolvedValue(null);
      await expect(
        method === 'update'
          ? service.update(999, { nombre: 'Nuevo' })
          : service.findById(999),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );
  it.each([0, -1, 1.5, 2147483648])(
    'rechaza id inválido %s antes de consultar o escribir',
    async (id) => {
      await expect(service.findById(id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.update(id, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.updateById).not.toHaveBeenCalled();
    },
  );
  it.each([
    new Error('detalle privado'),
    new QueryFailedError(
      'SQL privado',
      [],
      Object.assign(new Error('detalle privado'), {
        code: '23505',
        constraint: 'desconocida',
      }),
    ),
  ])(
    'propaga fallos inesperados al filtro global sin convertirlos a 404 o 409',
    async (error) => {
      repository.updateById.mockRejectedValue(error);
      await expect(service.update(3, { nombre: 'Nuevo' })).rejects.toBe(error);
    },
  );
});
