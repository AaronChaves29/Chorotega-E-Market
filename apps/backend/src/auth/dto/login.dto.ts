import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @IsNotEmpty({ message: 'Este campo es obligatorio.' })
  correo!: string;

  @IsString()
  @IsNotEmpty({ message: 'Este campo es obligatorio.' })
  clave!: string;
}
