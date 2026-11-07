import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';
import { RegisterContactDto } from './register-contact.dto';

export class RegisterCourierDto extends RegisterContactDto {
  @ApiProperty({ maxLength: 50, example: 'Bicicleta' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/\S/)
  @MaxLength(50)
  medioTransporte!: string;
}
