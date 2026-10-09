import { ApiProperty } from '@nestjs/swagger';
export class DeliveryResponseDto {
  @ApiProperty({ type: 'integer' })
  idEntrega!: number;
  @ApiProperty({ type: 'integer' })
  idPedido!: number;
  @ApiProperty({ type: 'integer' })
  idRepartidor!: number;
  @ApiProperty({
    type: 'string',
    enum: ['ASIGNADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA'],
  })
  estado!: string;
  @ApiProperty({ type: 'string', format: 'date-time' })
  fechaAsignacion!: Date;
  @ApiProperty({ type: 'string', format: 'date-time', nullable: true })
  fechaEntrega!: Date | null;
}
