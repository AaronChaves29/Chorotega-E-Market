import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  let service: ProductsService;

  let findMock: jest.MockedFunction<() => Promise<Product[]>>;
  let createMock: jest.MockedFunction<(data: Partial<Product>) => Product>;
  let saveMock: jest.MockedFunction<(product: Product) => Promise<Product>>;

  beforeEach(async () => {
    findMock = jest.fn();
    createMock = jest.fn();
    saveMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            find: findMock,
            create: createMock,
            save: saveMock,
          },
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe obtener todos los productos', async () => {
    const products: Product[] = [
      {
        idProducto: 1,
        idTienda: 1,
        idCategoria: 1,
        nombre: 'Cafe Chorotega',
        descripcion: 'Cafe producido localmente',
        precio: '4500',
        cantidadDisponible: 18,
        estado: 'ACTIVO',
        fechaPublicacion: new Date(),
      },
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

    const product: Product = {
      idProducto: 4,
      idTienda: 1,
      idCategoria: 1,
      nombre: 'Miel Chorotega',
      descripcion: 'Miel artesanal de productor local',
      precio: '3500',
      cantidadDisponible: 12,
      estado: 'ACTIVO',
      fechaPublicacion: new Date(),
    };

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
});
