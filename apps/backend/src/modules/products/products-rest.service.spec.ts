const actor = { sub: 'admin@example.test', idUsuario: 9, rol: 'ADMIN' };
import { NotFoundException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ProductsService } from './products.service';
import { ProductsRepository } from './repositories/products.repository';
import { StoresRepository } from '../stores/repositories/stores.repository';
import { CategoriesRepository } from '../categories/repositories/categories.repository';
import { Product } from './entities/product.entity';
import { ProductSearchQueryDto } from './dto/product-search-query.dto';

describe('ProductsService: operaciones REST', () => {
  const products = {
    findById: jest.fn(),
    createEntity: jest.fn(),
    saveInAuthorizedStore: jest.fn(),
    updateForActor: jest.fn(),
    deleteForActor: jest.fn(),
    search: jest.fn(),
  };
  const stores = { findById: jest.fn() };
  const categories = { findById: jest.fn() };
  const service = new ProductsService(
    products as unknown as ProductsRepository,
    stores as unknown as StoresRepository,
    categories as unknown as CategoriesRepository,
  );
  const product = Object.assign(new Product(), {
    idProducto: 1,
    idTienda: 1,
    idCategoria: 1,
    nombre: 'Prueba',
    descripcion: 'Texto',
    precio: '10.25',
    cantidadDisponible: 3,
    estado: 'ACTIVO',
    fechaPublicacion: new Date('2026-10-06T00:00:00Z'),
    tienda: {},
    categoria: {},
    detallesPedido: [],
  });
  const input = {
    idTienda: 1,
    idCategoria: 1,
    nombre: 'Prueba',
    precio: 10.25,
    cantidadDisponible: 3,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    stores.findById.mockResolvedValue({ idTienda: 1 });
    categories.findById.mockResolvedValue({ idCategoria: 1 });
    products.findById.mockResolvedValue(product);
    products.createEntity.mockReturnValue(product);
    products.saveInAuthorizedStore.mockResolvedValue(product);
    products.updateForActor.mockResolvedValue(product);
  });

  it('devuelve una página de DTOs conservando metadatos y excluyendo relaciones', async () => {
    const page = {
      content: [product],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    };
    products.search.mockResolvedValue(page);
    const query = new ProductSearchQueryDto();
    const result = await service.search(query);
    expect(products.search).toHaveBeenCalledWith(query);
    expect(result).toMatchObject({
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    });
    expect(Object.keys(result.content[0]).sort()).toEqual([
      'cantidadDisponible',
      'descripcion',
      'estado',
      'fechaPublicacion',
      'idCategoria',
      'idProducto',
      'idTienda',
      'nombre',
      'precio',
    ]);
    expect(result.content[0]).not.toBeInstanceOf(Product);
    expect(result.content[0].precio).toBe('10.25');
  });

  it.each(['tienda', 'categoria'])(
    'rechaza creación si no existe %s antes de guardar',
    async (relation) => {
      (relation === 'tienda' ? stores : categories).findById.mockResolvedValue(
        null,
      );
      await expect(service.create(input, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(products.saveInAuthorizedStore).not.toHaveBeenCalled();
    },
  );

  it('PATCH envía solo cambios, convierte precio a string y admite descripción null', async () => {
    await service.update(1, { precio: 2.5, descripcion: null }, actor);
    expect(products.updateForActor).toHaveBeenCalledWith(
      1,
      {
        precio: '2.5',
        descripcion: null,
      },
      actor,
    );
    expect(stores.findById).not.toHaveBeenCalled();
    expect(categories.findById).not.toHaveBeenCalled();
  });

  it.each(['idTienda', 'idCategoria'] as const)(
    'PATCH valida la nueva relación %s',
    async (field) => {
      (field === 'idTienda' ? stores : categories).findById.mockResolvedValue(
        null,
      );
      await expect(
        service.update(1, { [field]: 999 }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(products.updateForActor).not.toHaveBeenCalled();
    },
  );

  it('PATCH no inserta un producto eliminado antes de la actualización', async () => {
    products.updateForActor.mockResolvedValue(null);
    await expect(
      service.update(1, { nombre: 'Nuevo' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(products.saveInAuthorizedStore).not.toHaveBeenCalled();
  });

  function failure(constraint: string) {
    return new QueryFailedError(
      'private SQL',
      [],
      Object.assign(new Error('private'), { code: '23503', constraint }),
    );
  }

  it('DELETE traduce exclusivamente la referencia de detalles', async () => {
    products.deleteForActor.mockRejectedValue(failure('fk_detalle_producto'));
    await expect(service.remove(1, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each(['fk_producto_tienda', 'fk_producto_categoria'])(
    'traduce pérdida concurrente de %s al guardar',
    async (constraint) => {
      products.saveInAuthorizedStore.mockRejectedValue(failure(constraint));
      await expect(service.create(input, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('propaga errores inesperados para el 500 seguro global', async () => {
    const error = failure('otra_fk');
    products.deleteForActor.mockRejectedValue(error);
    await expect(service.remove(1, actor)).rejects.toBe(error);
  });

  it.each(['fk_producto_tienda', 'fk_producto_categoria'])(
    'traduce pérdida concurrente de %s durante PATCH',
    async (constraint) => {
      products.updateForActor.mockRejectedValue(failure(constraint));
      await expect(
        service.update(1, { idTienda: 1, idCategoria: 1 }, actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it.each(['create', 'update'] as const)(
    'no oculta otras FK como 404 durante %s',
    async (operation) => {
      const error = failure('otra_fk');
      products.saveInAuthorizedStore.mockRejectedValue(error);
      products.updateForActor.mockRejectedValue(error);
      const result =
        operation === 'create'
          ? service.create(input, actor)
          : service.update(1, { nombre: 'Nuevo' }, actor);
      await expect(result).rejects.toBe(error);
    },
  );
  it.each(['CLIENTE', 'REPARTIDOR'])(
    'rechaza escrituras directas del rol %s antes de consultar',
    async (rol) => {
      const denied = { ...actor, rol };
      await expect(service.create(input, denied)).rejects.toThrow(
        'Rol no autorizado',
      );
      await expect(service.update(1, {}, denied)).rejects.toThrow(
        'Rol no autorizado',
      );
      await expect(service.remove(1, denied)).rejects.toThrow(
        'Rol no autorizado',
      );
      expect(products.findById).not.toHaveBeenCalled();
      expect(products.createEntity).not.toHaveBeenCalled();
    },
  );
  it('rechaza contexto ausente al invocar directamente', async () => {
    const missing = undefined as unknown as typeof actor;
    await expect(service.create(input, missing)).rejects.toThrow(
      'Identidad autenticada',
    );
    await expect(service.update(1, {}, missing)).rejects.toThrow(
      'Identidad autenticada',
    );
    await expect(service.remove(1, missing)).rejects.toThrow(
      'Identidad autenticada',
    );
    expect(products.findById).not.toHaveBeenCalled();
  });
  it('rechaza producto y tienda ajenos antes de persistir', async () => {
    stores.findById.mockResolvedValue({ idTienda: 1, idEmprendedor: 4 });
    const owner = { ...actor, idUsuario: 3, rol: 'EMPRENDEDOR' };
    await expect(service.create(input, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.update(1, {}, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(1, owner)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(products.saveInAuthorizedStore).not.toHaveBeenCalled();
    expect(products.updateForActor).not.toHaveBeenCalled();
    expect(products.deleteForActor).not.toHaveBeenCalled();
  });
  it('comprueba origen y destino al trasladar un producto propio', async () => {
    const owner = { ...actor, idUsuario: 3, rol: 'EMPRENDEDOR' };
    stores.findById.mockResolvedValue({ idTienda: 1, idEmprendedor: 3 });
    await service.update(1, { idTienda: 2 }, owner);
    expect(stores.findById.mock.calls).toEqual([[1], [2]]);
    expect(products.updateForActor).toHaveBeenCalledWith(
      1,
      { idTienda: 2 },
      owner,
    );
  });
  it('rechaza destino ajeno sin escribir', async () => {
    const owner = { ...actor, idUsuario: 3, rol: 'EMPRENDEDOR' };
    stores.findById
      .mockResolvedValueOnce({ idTienda: 1, idEmprendedor: 3 })
      .mockResolvedValueOnce({ idTienda: 2, idEmprendedor: 4 });
    await expect(
      service.update(1, { idTienda: 2 }, owner),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(products.updateForActor).not.toHaveBeenCalled();
  });
  it('rechaza tienda perdida antes de guardar dentro de la transacción', async () => {
    products.saveInAuthorizedStore.mockResolvedValue(null);
    await expect(service.create(input, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
