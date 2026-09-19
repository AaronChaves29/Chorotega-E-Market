export class DeliveryResponseDto {
  idEntrega!: number;
  idPedido!: number;
  idRepartidor!: number;
  estado!: string;
  fechaAsignacion!: Date;
  fechaEntrega!: Date | null;
}
