import { ApiPropertyOptional } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { RegisterDto } from './register.dto';

export class RegisterContactDto extends RegisterDto {
  @ApiPropertyOptional({
    type: 'string',
    maxLength: 20,
    nullable: true,
    description: 'Telefono de contacto; entre 8 y 15 digitos.',
  })
  @Matches(/^\+?[0-9][0-9 ()-]*$/, {
    message:
      'El telefono solo admite digitos, espacios, parentesis, guiones y prefijo +.',
  })
  @Matches(/^(?:\D*\d){8,15}\D*$/, {
    message: 'El telefono debe contener entre 8 y 15 digitos.',
  })
  declare telefono?: string | null;
}
