import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class UserSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: 'string', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ type: 'string', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;

  @ApiPropertyOptional({ type: 'string', maxLength: 150, format: 'email' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  correo?: string;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'],
  })
  @IsOptional()
  @IsIn(['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])
  rol?: 'ADMIN' | 'CLIENTE' | 'EMPRENDEDOR' | 'REPARTIDOR';

  @ApiPropertyOptional({ type: 'string', enum: ['ACTIVO', 'INACTIVO'] })
  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['idUsuario', 'nombre', 'apellido', 'correo', 'rol', 'estado'],
    default: 'idUsuario',
  })
  @IsOptional()
  @IsIn(['idUsuario', 'nombre', 'apellido', 'correo', 'rol', 'estado'])
  sortBy: 'idUsuario' | 'nombre' | 'apellido' | 'correo' | 'rol' | 'estado' =
    'idUsuario';

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
