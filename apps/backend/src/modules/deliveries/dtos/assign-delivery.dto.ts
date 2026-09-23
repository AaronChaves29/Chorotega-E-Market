import { IsInt, IsPositive, Max } from 'class-validator';

export class AssignDeliveryDto {
  @IsInt()
  @IsPositive()
  @Max(2_147_483_647)
  idPedido!: number;

  @IsInt()
  @IsPositive()
  @Max(2_147_483_647)
  idRepartidor!: number;
}
