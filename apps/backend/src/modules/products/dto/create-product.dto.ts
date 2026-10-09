import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class CreateProductDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idTienda!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idCategoria!: number;

  @ApiProperty({ type: 'string', maxLength: 150, minLength: 1 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @ApiProperty({
    type: 'number',
    minimum: 0.01,
    maximum: 99999999.99,
    multipleOf: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99_999_999.99)
  precio!: number;

  @ApiProperty({ type: 'integer', minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  cantidadDisponible!: number;

  @ApiPropertyOptional({
    type: 'string',
    enum: ['ACTIVO', 'INACTIVO', 'AGOTADO'],
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVO', 'INACTIVO', 'AGOTADO'])
  estado?: string;
}
