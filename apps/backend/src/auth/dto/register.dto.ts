import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'bcryptPasswordByteLength', async: false })
class BcryptPasswordByteLengthConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72;
  }

  defaultMessage(): string {
    return 'La contraseña no puede superar 72 bytes.';
  }
}

export class RegisterDto {
  @ApiProperty({ type: 'string', minLength: 1, maxLength: 100 })
  @IsString()
  @IsNotEmpty({ message: 'Este campo es obligatorio.' })
  @Matches(/\S/, { message: 'Este campo es obligatorio.' })
  @MaxLength(100)
  nombre!: string;

  @ApiProperty({ type: 'string', minLength: 1, maxLength: 100 })
  @IsString()
  @IsNotEmpty({ message: 'Este campo es obligatorio.' })
  @Matches(/\S/, { message: 'Este campo es obligatorio.' })
  @MaxLength(100)
  apellido!: string;

  @ApiProperty({ type: 'string', maxLength: 150, format: 'email' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @MaxLength(150)
  correo!: string;

  @ApiPropertyOptional({ type: 'string', maxLength: 20, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefono?: string | null;

  @ApiProperty({
    type: 'string',
    minLength: 8,
    maxLength: 72,
    writeOnly: true,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Este campo es obligatorio.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72)
  @Validate(BcryptPasswordByteLengthConstraint)
  clave!: string;
}
