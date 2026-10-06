import { CategoryResponseDto } from '../dtos/category-response.dto';
import { Category } from '../entities/category.entity';

export class CategoryMapper {
  static toResponseDto(category: Category): CategoryResponseDto {
    return {
      idCategoria: category.idCategoria,
      nombre: category.nombre,
      descripcion: category.descripcion,
      estado: category.estado,
    };
  }
}
