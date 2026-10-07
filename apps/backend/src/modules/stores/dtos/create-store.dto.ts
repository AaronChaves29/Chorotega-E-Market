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

export class CreateStoreDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idEmprendedor!: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(150)
  nombre!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  direccion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  horario?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ACTIVA', 'INACTIVA'])
  estado?: 'ACTIVA' | 'INACTIVA';
}
