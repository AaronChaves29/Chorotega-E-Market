import { OmitType, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsObject, ValidateNested } from 'class-validator';
import { RegisterContactDto } from './register-contact.dto';
import { CreateStoreDto } from '../../modules/stores/dtos/create-store.dto';

// Owner and initial state are assigned by the server, never by public input.
export class EntrepreneurStoreDto extends OmitType(CreateStoreDto, [
  'idEmprendedor',
  'estado',
  'telefono',
] as const) {}

export class RegisterEntrepreneurDto extends RegisterContactDto {
  @ApiProperty({ type: EntrepreneurStoreDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => EntrepreneurStoreDto)
  tienda!: EntrepreneurStoreDto;
}
