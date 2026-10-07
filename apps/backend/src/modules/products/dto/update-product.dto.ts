import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  ValidateIf,
  Min,
} from 'class-validator';

export class UpdateProductDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idTienda?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idCategoria?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  precio?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  cantidadDisponible?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVO', 'INACTIVO', 'AGOTADO'])
  estado?: string;
}
