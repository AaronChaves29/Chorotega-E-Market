import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ProductSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idTienda?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idCategoria?: number;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ACTIVO', 'INACTIVO', 'AGOTADO'],
  })
  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO', 'AGOTADO'])
  estado?: string;

  @ApiPropertyOptional({ type: 'boolean' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  disponible?: boolean;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['idProducto', 'nombre', 'precio', 'cantidadDisponible', 'estado'],
    default: 'idProducto',
  })
  @IsOptional()
  @IsIn(['idProducto', 'nombre', 'precio', 'cantidadDisponible', 'estado'])
  sortBy: 'idProducto' | 'nombre' | 'precio' | 'cantidadDisponible' | 'estado' =
    'idProducto';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
