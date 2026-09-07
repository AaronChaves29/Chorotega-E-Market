import { Injectable } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';
import { ProductsRepository } from './repositories/products.repository';

@Injectable()
export class ProductsService {
  constructor(private readonly productsRepository: ProductsRepository) {}

  findAll(): Promise<Product[]> {
    return this.productsRepository.findAll();
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const product = this.productsRepository.createEntity({
      idTienda: createProductDto.idTienda,
      idCategoria: createProductDto.idCategoria,
      nombre: createProductDto.nombre,
      descripcion: createProductDto.descripcion ?? null,
      precio: createProductDto.precio.toString(),
      cantidadDisponible: createProductDto.cantidadDisponible,
      estado: createProductDto.estado ?? 'ACTIVO',
    });

    return this.productsRepository.save(product);
  }
}
