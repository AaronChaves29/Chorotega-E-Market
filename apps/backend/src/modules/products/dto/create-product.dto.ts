import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsInt()
  @Min(1)
  idTienda!: number;

  @IsInt()
  @Min(1)
  idCategoria!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsNumber()
  @Min(0.01)
  precio!: number;

  @IsInt()
  @Min(0)
  cantidadDisponible!: number;

  @IsOptional()
  @IsIn(['ACTIVO', 'INACTIVO', 'AGOTADO'])
  estado?: string;
}
