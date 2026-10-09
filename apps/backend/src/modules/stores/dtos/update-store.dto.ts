import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateStoreDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idEmprendedor?: number;

  @ApiPropertyOptional({ type: 'string', maxLength: 150, pattern: '\\S' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  nombre?: string;

  @ApiPropertyOptional({ type: 'string', maxLength: 255, pattern: '\\S' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  direccion?: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  horario?: string | null;

  @ApiPropertyOptional({ type: 'string', enum: ['ACTIVA', 'INACTIVA'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';
}
