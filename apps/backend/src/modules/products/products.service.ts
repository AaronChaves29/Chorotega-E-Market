import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
  ) {}

  findAll(): Promise<Product[]> {
    return this.productsRepository.find();
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const product = this.productsRepository.create({
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
