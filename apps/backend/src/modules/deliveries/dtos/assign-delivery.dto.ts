import { IsInt, IsPositive } from 'class-validator';

export class AssignDeliveryDto {
  @IsInt()
  @IsPositive()
  idPedido!: number;

  @IsInt()
  @IsPositive()
  idRepartidor!: number;
}
