import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';
import { ProductsRepository } from './repositories/products.repository';

describe('ProductsService', () => {
  let service: ProductsService;

  let findMock: jest.MockedFunction<ProductsRepository['findAll']>;
  let createMock: jest.MockedFunction<ProductsRepository['createEntity']>;
  let saveMock: jest.MockedFunction<ProductsRepository['save']>;
  let availableByStoreMock: jest.MockedFunction<
    ProductsRepository['findAvailableByStore']
  >;
  let activeByCategoryMock: jest.MockedFunction<
    ProductsRepository['findActiveByCategory']
  >;

  beforeEach(async () => {
    findMock = jest.fn();
    createMock = jest.fn();
    saveMock = jest.fn();
    availableByStoreMock = jest.fn();
    activeByCategoryMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: ProductsRepository,
          useValue: {
            findAll: findMock,
            createEntity: createMock,
            save: saveMock,
            findAvailableByStore: availableByStoreMock,
            findActiveByCategory: activeByCategoryMock,
          },
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe delegar la búsqueda de productos disponibles de la tienda', async () => {
    const products = [Object.assign(new Product(), { idProducto: 2 })];
    availableByStoreMock.mockResolvedValue(products);

    expect(await service.findAvailableByStore(7)).toBe(products);
    expect(availableByStoreMock).toHaveBeenCalledWith(7);
    expect(availableByStoreMock).toHaveBeenCalledTimes(1);
    expect(findMock).not.toHaveBeenCalled();
    expect(activeByCategoryMock).not.toHaveBeenCalled();
  });

  it('debe delegar la búsqueda de productos activos de la categoría', async () => {
    const products = [Object.assign(new Product(), { idProducto: 3 })];
    activeByCategoryMock.mockResolvedValue(products);

    expect(await service.findActiveByCategory(9)).toBe(products);
    expect(activeByCategoryMock).toHaveBeenCalledWith(9);
    expect(activeByCategoryMock).toHaveBeenCalledTimes(1);
    expect(findMock).not.toHaveBeenCalled();
    expect(availableByStoreMock).not.toHaveBeenCalled();
  });

  it('debe conservar las listas vacías de ambas consultas', async () => {
    availableByStoreMock.mockResolvedValue([]);
    activeByCategoryMock.mockResolvedValue([]);

    expect(await service.findAvailableByStore(7)).toEqual([]);
    expect(await service.findActiveByCategory(9)).toEqual([]);
  });

  it('debe propagar los errores de ambas consultas', async () => {
    const error = new Error('No se pudo consultar el catálogo');
    availableByStoreMock.mockRejectedValue(error);
    activeByCategoryMock.mockRejectedValue(error);

    await expect(service.findAvailableByStore(7)).rejects.toBe(error);
    await expect(service.findActiveByCategory(9)).rejects.toBe(error);
  });

  it('debe obtener todos los productos', async () => {
    const products: Product[] = [
      Object.assign(new Product(), {
        idProducto: 1,
        idTienda: 1,
        idCategoria: 1,
        nombre: 'Cafe Chorotega',
        descripcion: 'Cafe producido localmente',
        precio: '4500',
        cantidadDisponible: 18,
        estado: 'ACTIVO',
        fechaPublicacion: new Date(),
      }),
    ];

    findMock.mockResolvedValue(products);

    const result = await service.findAll();

    expect(result).toEqual(products);
    expect(findMock).toHaveBeenCalledTimes(1);
  });

  it('debe crear un producto', async () => {
    const createProductDto = {
      idTienda: 1,
      idCategoria: 1,
      nombre: 'Miel Chorotega',
      descripcion: 'Miel artesanal de productor local',
      precio: 3500,
      cantidadDisponible: 12,
      estado: 'ACTIVO',
    };

    const product: Product = Object.assign(new Product(), {
      idProducto: 4,
      idTienda: 1,
      idCategoria: 1,
      nombre: 'Miel Chorotega',
      descripcion: 'Miel artesanal de productor local',
      precio: '3500',
      cantidadDisponible: 12,
      estado: 'ACTIVO',
      fechaPublicacion: new Date(),
    });

    createMock.mockReturnValue(product);
    saveMock.mockResolvedValue(product);

    const result = await service.create(createProductDto);

    expect(createMock).toHaveBeenCalledWith({
      idTienda: 1,
      idCategoria: 1,
      nombre: 'Miel Chorotega',
      descripcion: 'Miel artesanal de productor local',
      precio: '3500',
      cantidadDisponible: 12,
      estado: 'ACTIVO',
    });

    expect(saveMock).toHaveBeenCalledWith(product);
    expect(result).toEqual(product);
  });

  it('debe conservar los valores por defecto y convertir el precio del DTO', async () => {
    const dto = {
      idTienda: 2,
      idCategoria: 3,
      nombre: 'Miel Chorotega',
      precio: 3500.5,
      cantidadDisponible: 0,
    };
    const data = {
      ...dto,
      descripcion: null,
      precio: '3500.5',
      estado: 'ACTIVO',
    };
    const entity = Object.assign(new Product(), data);
    const saved = Object.assign(new Product(), data, { idProducto: 4 });
    createMock.mockReturnValue(entity);
    saveMock.mockResolvedValue(saved);

    expect(await service.create(dto)).toBe(saved);
    expect(createMock).toHaveBeenCalledWith(data);
    expect(saveMock).toHaveBeenCalledWith(entity);
  });

  it('debe propagar un error al guardar el producto', async () => {
    const error = new Error('No se pudo guardar el producto');
    createMock.mockReturnValue(new Product());
    saveMock.mockRejectedValue(error);

    await expect(
      service.create({
        idTienda: 1,
        idCategoria: 1,
        nombre: 'Miel Chorotega',
        precio: 3500,
        cantidadDisponible: 12,
      }),
    ).rejects.toBe(error);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
