import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class DeliverySearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: 'string',
    enum: ['ASIGNADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA'],
  })
  @IsOptional()
  @IsIn(['ASIGNADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA'])
  estado?: string;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idPedido?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idRepartidor?: number;

  @ApiPropertyOptional({
    type: 'string',
    description:
      'Fecha convertible por el DTO; filtra fechaAsignacion de forma inclusiva.',
    example: '2026-10-08T00:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @ApiPropertyOptional({
    type: 'string',
    description:
      'Fecha convertible por el DTO; filtra fechaAsignacion de forma inclusiva.',
    example: '2026-10-08T00:00:00Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['fechaAsignacion', 'fechaEntrega', 'idEntrega'],
    default: 'fechaAsignacion',
  })
  @IsOptional()
  @IsIn(['fechaAsignacion', 'fechaEntrega', 'idEntrega'])
  sortBy: 'fechaAsignacion' | 'fechaEntrega' | 'idEntrega' = 'fechaAsignacion';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'DESC';
}
