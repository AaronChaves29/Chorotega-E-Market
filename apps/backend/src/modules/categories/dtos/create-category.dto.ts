import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';
}
