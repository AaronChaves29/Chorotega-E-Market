import type { SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ActiveProductSpecification } from './active-product.specification';
import { AvailableProductSpecification } from './available-product.specification';
import { ProductCategorySpecification } from './product-category.specification';
import { ProductStoreSpecification } from './product-store.specification';

describe('Product Specifications', () => {
  let queryBuilder: SelectQueryBuilder<Product>;
  let andWhereMock: jest.Mock;

  beforeEach(() => {
    andWhereMock = jest.fn();

    queryBuilder = {
      andWhere: andWhereMock,
    } as unknown as SelectQueryBuilder<Product>;
  });

  it('aplica el criterio de producto activo', () => {
    const specification = new ActiveProductSpecification();

    specification.apply(queryBuilder);

    expect(andWhereMock).toHaveBeenCalledWith('producto.estado = :estado', {
      estado: 'ACTIVO',
    });
  });

  it('aplica el criterio de producto con existencias disponibles', () => {
    const specification = new AvailableProductSpecification();

    specification.apply(queryBuilder);

    expect(andWhereMock).toHaveBeenCalledWith(
      'producto.cantidadDisponible > :cantidadMinima',
      {
        cantidadMinima: 0,
      },
    );
  });

  it('aplica el criterio de tienda indicada', () => {
    const specification = new ProductStoreSpecification(7);

    specification.apply(queryBuilder);

    expect(andWhereMock).toHaveBeenCalledWith('producto.idTienda = :idTienda', {
      idTienda: 7,
    });
  });

  it('aplica el criterio de categoría indicada', () => {
    const specification = new ProductCategorySpecification(9);

    specification.apply(queryBuilder);

    expect(andWhereMock).toHaveBeenCalledWith(
      'producto.idCategoria = :idCategoria',
      {
        idCategoria: 9,
      },
    );
  });
});
