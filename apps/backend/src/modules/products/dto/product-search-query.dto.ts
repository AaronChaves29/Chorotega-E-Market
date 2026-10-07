import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ProductSearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idTienda?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idCategoria?: number;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO', 'AGOTADO'])
  estado?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  disponible?: boolean;

  @IsOptional()
  @IsIn(['idProducto', 'nombre', 'precio', 'cantidadDisponible', 'estado'])
  sortBy: 'idProducto' | 'nombre' | 'precio' | 'cantidadDisponible' | 'estado' =
    'idProducto';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
