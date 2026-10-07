import { Product } from '../entities/product.entity';
import { ProductResponseDto } from '../dto/product-response.dto';

export class ProductMapper {
  static toResponseDto(product: Product): ProductResponseDto {
    return {
      idProducto: product.idProducto,
      idTienda: product.idTienda,
      idCategoria: product.idCategoria,
      nombre: product.nombre,
      descripcion: product.descripcion,
      precio: product.precio,
      cantidadDisponible: product.cantidadDisponible,
      estado: product.estado,
      fechaPublicacion: product.fechaPublicacion,
    };
  }
}
