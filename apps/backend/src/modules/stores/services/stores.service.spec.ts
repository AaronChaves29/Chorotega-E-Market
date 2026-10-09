const actor = { sub: 'admin@example.test', idUsuario: 9, rol: 'ADMIN' };
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
    updateForActor: jest.fn(),
    deleteForActor: jest.fn(),
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
    users.findById.mockResolvedValue({
      idUsuario: 3,
      rol: 'EMPRENDEDOR',
      estado: 'ACTIVO',
    });
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
    expect(await service.create(dto, actor)).toEqual(publicStore);
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
    await expect(service.create(dto, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('PATCH envía únicamente campos presentes y conserva null explícito', async () => {
    repository.updateForActor.mockResolvedValue(store);
    await service.update(1, { descripcion: null, telefono: null }, actor);
    expect(repository.updateForActor).toHaveBeenCalledWith(
      1,
      {
        descripcion: null,
        telefono: null,
      },
      actor,
    );
    expect(users.findById).not.toHaveBeenCalled();
  });
  it('PATCH admite el propietario actual sin escribir la propiedad', async () => {
    repository.updateForActor.mockResolvedValue(store);
    await service.update(1, { idEmprendedor: 3 }, actor);
    expect(repository.updateForActor).toHaveBeenCalledWith(1, {}, actor);
    expect(users.findById).not.toHaveBeenCalled();
  });
  it('PATCH rechaza transferencias sin escrituras parciales incluso para ADMIN', async () => {
    await expect(
      service.update(1, { idEmprendedor: 4, nombre: 'Cambio' }, actor),
    ).rejects.toThrow('No se permite transferir');
    expect(repository.updateForActor).not.toHaveBeenCalled();
  });
  it.each(['findById', 'update', 'remove'] as const)(
    '%s devuelve 404 si falta la tienda',
    async (method) => {
      repository.findById.mockResolvedValue(null);
      repository.deleteForActor.mockResolvedValue(false);
      await expect(
        method === 'update'
          ? service.update(1, {}, actor)
          : method === 'findById'
            ? service.findById(1)
            : service.remove(1, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );
  it('detecta eliminación concurrente durante PATCH sin reinsertar', async () => {
    repository.updateForActor.mockResolvedValue(null);
    await expect(
      service.update(1, { nombre: 'Nuevo' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it('DELETE retorna void tras borrar', async () => {
    repository.deleteForActor.mockResolvedValue(true);
    expect(await service.remove(1, actor)).toBeUndefined();
    expect(repository.deleteForActor).toHaveBeenCalledWith(1, actor);
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
      repository.updateForActor.mockRejectedValue(error);
      await expect(
        method === 'create'
          ? service.create(dto, actor)
          : service.update(1, { idEmprendedor: 3 }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );
  it.each(['fk_producto_tienda', 'fk_pedido_tienda'])(
    'DELETE traduce únicamente FK conocida %s a 409',
    async (constraint) => {
      repository.deleteForActor.mockRejectedValue(failure('23503', constraint));
      await expect(service.remove(1, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );
  it.each([
    failure('23505', 'tienda_nombre_key'),
    failure('23503', 'otra_fk'),
    failure('23514', 'fk_producto_tienda'),
    new Error('inesperado'),
  ])('propaga errores no reconocidos al filtro global', async (error) => {
    repository.save.mockRejectedValue(error);
    repository.updateForActor.mockRejectedValue(error);
    repository.deleteForActor.mockRejectedValue(error);
    await expect(service.create(dto, actor)).rejects.toBe(error);
    await expect(service.update(1, { nombre: 'Nuevo' }, actor)).rejects.toBe(
      error,
    );
    await expect(service.remove(1, actor)).rejects.toBe(error);
  });
  it.each(['CLIENTE', 'REPARTIDOR'])(
    'rechaza escrituras directas del rol %s antes de consultar',
    async (rol) => {
      const denied = { ...actor, rol };
      await expect(service.create(dto, denied)).rejects.toThrow(
        'Rol no autorizado',
      );
      await expect(service.update(1, {}, denied)).rejects.toThrow(
        'Rol no autorizado',
      );
      await expect(service.remove(1, denied)).rejects.toThrow(
        'Rol no autorizado',
      );
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.createEntity).not.toHaveBeenCalled();
    },
  );
  it('rechaza contexto ausente al invocar directamente', async () => {
    const missing = undefined as unknown as typeof actor;
    await expect(service.create(dto, missing)).rejects.toThrow(
      'Identidad autenticada',
    );
    await expect(service.update(1, {}, missing)).rejects.toThrow(
      'Identidad autenticada',
    );
    await expect(service.remove(1, missing)).rejects.toThrow(
      'Identidad autenticada',
    );
    expect(repository.findById).not.toHaveBeenCalled();
  });
  it('condiciona actualización y eliminación directas por propietario', async () => {
    const owner = { ...actor, idUsuario: 3, rol: 'EMPRENDEDOR' };
    repository.updateForActor.mockResolvedValue(store);
    repository.deleteForActor.mockResolvedValue(true);
    await service.update(1, { nombre: 'Cambio' }, owner);
    await service.remove(1, owner);
    expect(repository.updateForActor).toHaveBeenCalledWith(
      1,
      { nombre: 'Cambio' },
      owner,
    );
    expect(repository.deleteForActor).toHaveBeenCalledWith(1, owner);
  });
  it('rechaza tiendas ajenas y creación a nombre ajeno sin escribir', async () => {
    const other = { ...actor, idUsuario: 4, rol: 'EMPRENDEDOR' };
    await expect(service.update(1, {}, other)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(1, other)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.create(dto, other)).rejects.toThrow(
      'Solo puede crear',
    );
    expect(repository.updateForActor).not.toHaveBeenCalled();
    expect(repository.deleteForActor).not.toHaveBeenCalled();
  });
  it.each([
    { rol: 'CLIENTE', estado: 'ACTIVO' },
    { rol: 'EMPRENDEDOR', estado: 'INACTIVO' },
  ])('ADMIN rechaza propietario inelegible %j', async (user) => {
    users.findById.mockResolvedValue({ idUsuario: 3, ...user });
    await expect(service.create(dto, actor)).rejects.toThrow(
      'emprendedor activo',
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});
