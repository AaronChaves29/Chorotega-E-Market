import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ type: 'string', maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @ApiPropertyOptional({ type: 'string', enum: ['ACTIVA', 'INACTIVA'] })
  @IsOptional()
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idEmprendedor?: number;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['idTienda', 'nombre', 'estado'],
    default: 'idTienda',
  })
  @IsOptional()
  @IsIn(['idTienda', 'nombre', 'estado'])
  sortBy: 'idTienda' | 'nombre' | 'estado' = 'idTienda';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
