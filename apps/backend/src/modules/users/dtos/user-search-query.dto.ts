import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class UserSearchQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  apellido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  correo?: string;

  @IsOptional()
  @IsIn(['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])
  rol?: 'ADMIN' | 'CLIENTE' | 'EMPRENDEDOR' | 'REPARTIDOR';

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO'])
  estado?: 'ACTIVO' | 'INACTIVO';

  @IsOptional()
  @IsIn(['idUsuario', 'nombre', 'apellido', 'correo', 'rol', 'estado'])
  sortBy: 'idUsuario' | 'nombre' | 'apellido' | 'correo' | 'rol' | 'estado' =
    'idUsuario';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortDirection: 'ASC' | 'DESC' = 'ASC';
}
