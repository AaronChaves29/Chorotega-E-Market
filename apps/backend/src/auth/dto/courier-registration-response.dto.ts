import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../modules/users/dtos/user-response.dto';
import { CourierResponseDto } from '../../modules/couriers/dtos/courier-response.dto';

export class CourierRegistrationResponseDto {
  @ApiProperty({ type: UserResponseDto })
  usuario!: UserResponseDto;

  @ApiProperty({ type: CourierResponseDto })
  repartidor!: CourierResponseDto;
}
