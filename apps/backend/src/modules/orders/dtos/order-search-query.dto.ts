import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import type { OrderState } from '../domain/order-state';

export const ORDER_STATES: readonly OrderState[] = [
  'PENDIENTE',
  'CONFIRMADO',
  'PREPARANDO',
  'EN_CAMINO',
  'ENTREGADO',
  'CANCELADO',
];

export class OrderSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: 'string',
    enum: [
      'PENDIENTE',
      'CONFIRMADO',
      'PREPARANDO',
      'EN_CAMINO',
      'ENTREGADO',
      'CANCELADO',
    ],
  })
  @IsOptional()
  @IsIn(ORDER_STATES)
  estado?: OrderState;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idCliente?: number;

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
  idBarrio?: number;

  @ApiPropertyOptional({
    type: 'string',
    description:
      'Fecha o instante ISO 8601; se valida también el rango en el servicio.',
    example: '2026-10-08T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  fechaDesde?: string;

  @ApiPropertyOptional({
    type: 'string',
    description:
      'Fecha o instante ISO 8601; se valida también el rango en el servicio.',
    example: '2026-10-08T00:00:00Z',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  fechaHasta?: string;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['idPedido', 'fechaCreacion', 'estado', 'total'],
    default: 'fechaCreacion',
  })
  @IsOptional()
  @IsIn(['idPedido', 'fechaCreacion', 'estado', 'total'])
  sortBy: 'idPedido' | 'fechaCreacion' | 'estado' | 'total' = 'fechaCreacion';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'DESC';
}
