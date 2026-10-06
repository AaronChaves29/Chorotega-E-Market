import { Type } from 'class-transformer';
import { IsDate, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class DeliverySearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['ASIGNADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA'])
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idPedido?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idRepartidor?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaDesde?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fechaHasta?: Date;

  @IsOptional()
  @IsIn(['fechaAsignacion', 'fechaEntrega', 'idEntrega'])
  sortBy: 'fechaAsignacion' | 'fechaEntrega' | 'idEntrega' = 'fechaAsignacion';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'DESC';
}
