import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ type: 'string', maxLength: 100, pattern: '\\S' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({ type: 'string', maxLength: 100, pattern: '\\S' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  apellido?: string;

  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;
}
