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
    save: jest.fn(),
    updateById: jest.fn(),
    deleteById: jest.fn(),
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
    products.save.mockResolvedValue(product);
    products.updateById.mockResolvedValue(product);
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
      await expect(service.create(input)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(products.save).not.toHaveBeenCalled();
    },
  );

  it('PATCH envía solo cambios, convierte precio a string y admite descripción null', async () => {
    await service.update(1, { precio: 2.5, descripcion: null });
    expect(products.updateById).toHaveBeenCalledWith(1, {
      precio: '2.5',
      descripcion: null,
    });
    expect(stores.findById).not.toHaveBeenCalled();
    expect(categories.findById).not.toHaveBeenCalled();
  });

  it.each(['idTienda', 'idCategoria'] as const)(
    'PATCH valida la nueva relación %s',
    async (field) => {
      (field === 'idTienda' ? stores : categories).findById.mockResolvedValue(
        null,
      );
      await expect(service.update(1, { [field]: 999 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(products.updateById).not.toHaveBeenCalled();
    },
  );

  it('PATCH no inserta un producto eliminado antes de la actualización', async () => {
    products.updateById.mockResolvedValue(null);
    await expect(service.update(1, { nombre: 'Nuevo' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(products.save).not.toHaveBeenCalled();
  });

  function failure(constraint: string) {
    return new QueryFailedError(
      'private SQL',
      [],
      Object.assign(new Error('private'), { code: '23503', constraint }),
    );
  }

  it('DELETE traduce exclusivamente la referencia de detalles', async () => {
    products.deleteById.mockRejectedValue(failure('fk_detalle_producto'));
    await expect(service.remove(1)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['fk_producto_tienda', 'fk_producto_categoria'])(
    'traduce pérdida concurrente de %s al guardar',
    async (constraint) => {
      products.save.mockRejectedValue(failure(constraint));
      await expect(service.create(input)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );

  it('propaga errores inesperados para el 500 seguro global', async () => {
    const error = failure('otra_fk');
    products.deleteById.mockRejectedValue(error);
    await expect(service.remove(1)).rejects.toBe(error);
  });

  it.each(['fk_producto_tienda', 'fk_producto_categoria'])(
    'traduce pérdida concurrente de %s durante PATCH',
    async (constraint) => {
      products.updateById.mockRejectedValue(failure(constraint));
      await expect(
        service.update(1, { idTienda: 1, idCategoria: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it.each(['create', 'update'] as const)(
    'no oculta otras FK como 404 durante %s',
    async (operation) => {
      const error = failure('otra_fk');
      products.save.mockRejectedValue(error);
      products.updateById.mockRejectedValue(error);
      const result =
        operation === 'create'
          ? service.create(input)
          : service.update(1, { nombre: 'Nuevo' });
      await expect(result).rejects.toBe(error);
    },
  );
});
