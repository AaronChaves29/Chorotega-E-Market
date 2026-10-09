import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class CategorySearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: 'string', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ type: 'string', enum: ['ACTIVA', 'INACTIVA'] })
  @IsOptional()
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['idCategoria', 'nombre', 'estado'],
    default: 'idCategoria',
  })
  @IsOptional()
  @IsIn(['idCategoria', 'nombre', 'estado'])
  sortBy: 'idCategoria' | 'nombre' | 'estado' = 'idCategoria';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
