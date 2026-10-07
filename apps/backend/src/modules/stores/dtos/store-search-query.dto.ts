import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class StoreSearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idEmprendedor?: number;

  @IsOptional()
  @IsIn(['idTienda', 'nombre', 'estado'])
  sortBy: 'idTienda' | 'nombre' | 'estado' = 'idTienda';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
