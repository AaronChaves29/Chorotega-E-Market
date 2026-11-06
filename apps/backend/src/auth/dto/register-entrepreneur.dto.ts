import { OmitType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, Matches, ValidateNested } from 'class-validator';
import { RegisterDto } from './register.dto';
import { CreateStoreDto } from '../../modules/stores/dtos/create-store.dto';

// Owner and initial state are assigned by the server, never by public input.
export class EntrepreneurStoreDto extends OmitType(CreateStoreDto, [
  'idEmprendedor',
  'estado',
  'telefono',
] as const) {}

export class RegisterEntrepreneurDto extends RegisterDto {
  @ApiPropertyOptional({
    type: 'string',
    maxLength: 20,
    nullable: true,
    description:
      'Contacto compartido de la cuenta y el negocio; entre 8 y 15 digitos.',
  })
  @Matches(/^\+?[0-9][0-9 ()-]*$/, {
    message:
      'El telefono solo admite digitos, espacios, parentesis, guiones y prefijo +.',
  })
  @Matches(/^(?:\D*\d){8,15}\D*$/, {
    message: 'El telefono debe contener entre 8 y 15 digitos.',
  })
  declare telefono?: string | null;

  @ApiProperty({ type: EntrepreneurStoreDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => EntrepreneurStoreDto)
  tienda!: EntrepreneurStoreDto;
}
