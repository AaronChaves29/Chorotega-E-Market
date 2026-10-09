import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Max } from 'class-validator';

export class AssignDeliveryDto {
  @ApiProperty({ type: 'integer', maximum: 2147483647, minimum: 1 })
  @IsInt()
  @IsPositive()
  @Max(2_147_483_647)
  idPedido!: number;

  @ApiProperty({ type: 'integer', maximum: 2147483647, minimum: 1 })
  @IsInt()
  @IsPositive()
  @Max(2_147_483_647)
  idRepartidor!: number;
}
