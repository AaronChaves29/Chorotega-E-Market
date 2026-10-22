import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idTienda?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idCategoria?: number;

  @ApiPropertyOptional({ type: 'string', maxLength: 150, minLength: 1 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre?: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @ApiPropertyOptional({
    type: 'number',
    minimum: 0.01,
    maximum: 99999999.99,
    multipleOf: 0.01,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  precio?: number;

  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: 2147483647 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  cantidadDisponible?: number;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ACTIVO', 'INACTIVO', 'AGOTADO'],
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVO', 'INACTIVO', 'AGOTADO'])
  estado?: string;
}
