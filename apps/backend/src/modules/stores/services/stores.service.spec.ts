import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { StoresService } from './stores.service';
import { StoresRepository } from '../repositories/stores.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import { Store } from '../entities/store.entity';
import { StoreSearchQueryDto } from '../dtos/store-search-query.dto';

describe('StoresService', () => {
  const repository = {
    findById: jest.fn(),
    search: jest.fn(),
    save: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
    createEntity: jest.fn(),
  };
  const users = { findById: jest.fn() };
  const service = new StoresService(
    repository as unknown as StoresRepository,
    users as unknown as UsersRepository,
  );
  const dto = { idEmprendedor: 3, nombre: 'Tienda', direccion: 'Nicoya' };
  const publicStore = {
    ...dto,
    idTienda: 1,
    descripcion: null,
    telefono: null,
    horario: null,
    estado: 'ACTIVA',
    fechaCreacion: new Date('2026-01-01T00:00:00Z'),
  };
  const store = Object.assign(new Store(), {
    ...publicStore,
    emprendedor: {
      claveHash: 'hash-no-publicar',
      correo: 'privado@example.test',
    },
    productos: [],
    pedidos: [],
  });
  beforeEach(() => {
    jest.resetAllMocks();
    repository.findById.mockResolvedValue(store);
    users.findById.mockResolvedValue({ idUsuario: 3 });
    repository.createEntity.mockReturnValue(store);
    repository.save.mockResolvedValue(store);
  });
  it('mapea detalle a contrato exacto sin entidad, relaciones ni datos privados', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(publicStore);
    expect(result).not.toBeInstanceOf(Store);
  });
  it('delega búsqueda y mapea contenido conservando metadatos', async () => {
    const query = Object.assign(new StoreSearchQueryDto(), {
      idEmprendedor: 3,
    });
    const page = {
      content: [store],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    };
    repository.search.mockResolvedValue(page);
    expect(await service.search(query)).toEqual({
      ...page,
      content: [publicStore],
    });
    expect(repository.search).toHaveBeenCalledWith(query);
  });
  it('valida usuario, aplica defaults y persiste creación tipada', async () => {
    expect(await service.create(dto)).toEqual(publicStore);
    expect(users.findById).toHaveBeenCalledWith(3);
    expect(repository.createEntity).toHaveBeenCalledWith({
      ...dto,
      descripcion: null,
      telefono: null,
      horario: null,
      estado: 'ACTIVA',
    });
    expect(repository.save).toHaveBeenCalledWith(store);
  });
  it('rechaza creación con usuario inexistente sin escribir', async () => {
    users.findById.mockResolvedValue(null);
    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('PATCH envía únicamente campos presentes y conserva null explícito', async () => {
    repository.updateById.mockResolvedValue(store);
    await service.update(1, { descripcion: null, telefono: null });
    expect(repository.updateById).toHaveBeenCalledWith(1, {
      descripcion: null,
      telefono: null,
    });
    expect(users.findById).not.toHaveBeenCalled();
  });
  it('PATCH valida y cambia únicamente la relación enviada', async () => {
    repository.updateById.mockResolvedValue({ ...store, idEmprendedor: 4 });
    expect(await service.update(1, { idEmprendedor: 4 })).toEqual({
      ...publicStore,
      idEmprendedor: 4,
    });
    expect(users.findById).toHaveBeenCalledWith(4);
    expect(repository.updateById).toHaveBeenCalledWith(1, { idEmprendedor: 4 });
  });
  it('PATCH rechaza usuario inexistente sin escribir', async () => {
    users.findById.mockResolvedValue(null);
    await expect(
      service.update(1, { idEmprendedor: 4 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.updateById).not.toHaveBeenCalled();
  });
  it.each(['findById', 'update', 'remove'] as const)(
    '%s devuelve 404 si falta la tienda',
    async (method) => {
      repository.findById.mockResolvedValue(null);
      repository.deleteById.mockResolvedValue(false);
      await expect(
        method === 'update' ? service.update(1, {}) : service[method](1),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );
  it('detecta eliminación concurrente durante PATCH sin reinsertar', async () => {
    repository.updateById.mockResolvedValue(null);
    await expect(service.update(1, { nombre: 'Nuevo' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('DELETE retorna void tras borrar', async () => {
    repository.deleteById.mockResolvedValue(true);
    expect(await service.remove(1)).toBeUndefined();
    expect(repository.deleteById).toHaveBeenCalledWith(1);
  });
  it.each([0, -1, 1.5, 2147483648])(
    'rechaza id fuera del dominio %s antes de consultar',
    async (id) => {
      await expect(service.findById(id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.findById).not.toHaveBeenCalled();
    },
  );
  function failure(code: string, constraint: string) {
    return new QueryFailedError(
      'SQL privado',
      [],
      Object.assign(new Error('detalle privado'), { code, constraint }),
    );
  }
  it.each(['create', 'update'] as const)(
    '%s traduce desaparición concurrente del usuario a 404',
    async (method) => {
      const error = failure('23503', 'fk_tienda_emprendedor');
      repository.save.mockRejectedValue(error);
      repository.updateById.mockRejectedValue(error);
      await expect(
        method === 'create'
          ? service.create(dto)
          : service.update(1, { idEmprendedor: 3 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );
  it.each(['fk_producto_tienda', 'fk_pedido_tienda'])(
    'DELETE traduce únicamente FK conocida %s a 409',
    async (constraint) => {
      repository.deleteById.mockRejectedValue(failure('23503', constraint));
      await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it.each([
    failure('23505', 'tienda_nombre_key'),
    failure('23503', 'otra_fk'),
    failure('23514', 'fk_producto_tienda'),
    new Error('inesperado'),
  ])('propaga errores no reconocidos al filtro global', async (error) => {
    repository.save.mockRejectedValue(error);
    repository.updateById.mockRejectedValue(error);
    repository.deleteById.mockRejectedValue(error);
    await expect(service.create(dto)).rejects.toBe(error);
    await expect(service.update(1, { nombre: 'Nuevo' })).rejects.toBe(error);
    await expect(service.remove(1)).rejects.toBe(error);
  });
});
