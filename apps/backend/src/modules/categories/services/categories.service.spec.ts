const actor = { sub: 'admin@example.test', idUsuario: 9, rol: 'ADMIN' };
import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CategoriesService } from './categories.service';
import { CategoriesRepository } from '../repositories/categories.repository';
import { Category } from '../entities/category.entity';
import { CategorySearchQueryDto } from '../dtos/category-search-query.dto';

describe('CategoriesService', () => {
  const repository = {
    findById: jest.fn(),
    search: jest.fn(),
    save: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
    createEntity: jest.fn(),
  };
  const service = new CategoriesService(
    repository as unknown as CategoriesRepository,
  );
  const category = Object.assign(new Category(), {
    idCategoria: 1,
    nombre: 'Alimentos',
    descripcion: 'Local',
    estado: 'ACTIVA',
    productos: [],
  });
  beforeEach(() => jest.resetAllMocks());

  it('mapea la página sin exponer relaciones ni entidades', async () => {
    const query = new CategorySearchQueryDto();
    repository.search.mockResolvedValue({
      content: [category],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    const result = await service.search(query);
    expect(result).toEqual({
      content: [
        {
          idCategoria: 1,
          nombre: 'Alimentos',
          descripcion: 'Local',
          estado: 'ACTIVA',
        },
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    expect(result.content[0]).not.toBeInstanceOf(Category);
    expect(repository.search).toHaveBeenCalledWith(query);
  });

  it('aplica defaults de creación y devuelve DTO', async () => {
    repository.createEntity.mockReturnValue(category);
    repository.save.mockResolvedValue(category);
    const result = await service.create({ nombre: 'Alimentos' }, actor);
    expect(repository.createEntity).toHaveBeenCalledWith({
      nombre: 'Alimentos',
      descripcion: null,
      estado: 'ACTIVA',
    });
    expect(repository.save).toHaveBeenCalledWith(category);
    expect(result).not.toHaveProperty('productos');
  });

  it('envía solo campos presentes y conserva null explícito en PATCH', async () => {
    repository.updateById.mockResolvedValue({ ...category, descripcion: null });
    expect(await service.update(1, { descripcion: null }, actor)).toMatchObject(
      {
        descripcion: null,
        nombre: 'Alimentos',
      },
    );
    expect(repository.updateById).toHaveBeenCalledWith(1, {
      descripcion: null,
    });
  });

  it.each(['findById', 'update', 'remove'] as const)(
    'devuelve 404 cuando %s no encuentra categoría',
    async (method) => {
      repository.findById.mockResolvedValue(null);
      repository.updateById.mockResolvedValue(null);
      repository.deleteById.mockResolvedValue(false);
      const operation =
        method === 'update'
          ? service.update(1, {}, actor)
          : method === 'findById'
            ? service.findById(1)
            : service.remove(1, actor);
      await expect(operation).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  function failure(code: string, constraint: string) {
    return new QueryFailedError(
      'private SQL',
      [],
      Object.assign(new Error('private DB detail'), { code, constraint }),
    );
  }

  it('traduce la restricción única real durante creación', async () => {
    repository.save.mockRejectedValue(failure('23505', 'categoria_nombre_key'));
    await expect(
      service.create({ nombre: 'Duplicado' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('traduce la restricción única real durante PATCH', async () => {
    repository.updateById.mockRejectedValue(
      failure('23505', 'categoria_nombre_key'),
    );
    await expect(
      service.update(1, { nombre: 'Duplicado' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('traduce solo la FK de productos al borrar', async () => {
    repository.deleteById.mockRejectedValue(
      failure('23503', 'fk_producto_categoria'),
    );
    await expect(service.remove(1, actor)).rejects.toThrow(
      'La categoría tiene productos asociados.',
    );
  });

  it.each([
    failure('23505', 'otra_restriccion'),
    failure('23503', 'otra_fk'),
    new Error('fallo inesperado'),
  ])('propaga fallos no clasificados al filtro global', async (error) => {
    repository.deleteById.mockRejectedValue(error);
    await expect(service.remove(1, actor)).rejects.toBe(error);
  });
  it.each(['CLIENTE', 'REPARTIDOR', 'EMPRENDEDOR'])(
    'rechaza escrituras directas del rol %s antes de consultar',
    async (rol) => {
      const denied = { ...actor, rol };
      await expect(service.create({ nombre: 'Nueva' }, denied)).rejects.toThrow(
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
    await expect(service.create({ nombre: 'Nueva' }, missing)).rejects.toThrow(
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
});
