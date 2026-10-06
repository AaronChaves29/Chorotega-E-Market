import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class CategorySearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';

  @IsOptional()
  @IsIn(['idCategoria', 'nombre', 'estado'])
  sortBy: 'idCategoria' | 'nombre' | 'estado' = 'idCategoria';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
