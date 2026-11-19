import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../modules/users/dtos/user-response.dto';
import { StoreResponseDto } from '../../modules/stores/dtos/store-response.dto';

export class EntrepreneurRegistrationResponseDto {
  @ApiProperty({ type: UserResponseDto })
  usuario!: UserResponseDto;

  @ApiProperty({ type: StoreResponseDto })
  tienda!: StoreResponseDto;
}
