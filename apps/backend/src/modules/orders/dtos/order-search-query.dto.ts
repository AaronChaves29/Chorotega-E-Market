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
  @IsOptional()
  @IsIn(ORDER_STATES)
  estado?: OrderState;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idCliente?: number;

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
  idBarrio?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  fechaDesde?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  fechaHasta?: string;

  @IsOptional()
  @IsIn(['idPedido', 'fechaCreacion', 'estado', 'total'])
  sortBy: 'idPedido' | 'fechaCreacion' | 'estado' | 'total' = 'fechaCreacion';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'DESC';
}
