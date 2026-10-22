import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ type: 'string', maxLength: 100, pattern: '\\S' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  nombre!: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string | null;

  @ApiPropertyOptional({ type: 'string', enum: ['ACTIVA', 'INACTIVA'] })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';
}
