import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ type: 'string', minLength: 1, format: 'email' })
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @IsNotEmpty({ message: 'Este campo es obligatorio.' })
  correo!: string;

  @ApiProperty({
    type: 'string',
    minLength: 1,
    writeOnly: true,
    format: 'password',
  })
  @IsString()
  @IsNotEmpty({ message: 'Este campo es obligatorio.' })
  clave!: string;
}
