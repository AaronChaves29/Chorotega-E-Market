import { ApiProperty } from '@nestjs/swagger';
import type { OrderState } from '../domain/order-state';

export class OrderItemResponseDto {
  @ApiProperty({ type: 'integer' })
  idDetalle!: number;
  @ApiProperty({ type: 'integer' })
  idProducto!: number;
  @ApiProperty({ type: 'integer' })
  cantidad!: number;
  @ApiProperty({
    type: 'string',
    description: 'Importe decimal exacto, serializado como string.',
    example: '1500.00',
  })
  precioUnitario!: string;
  @ApiProperty({
    type: 'string',
    description: 'Importe decimal exacto, serializado como string.',
    example: '1500.00',
  })
  subtotal!: string;
}

export class OrderResponseDto {
  @ApiProperty({ type: 'integer' })
  idPedido!: number;
  @ApiProperty({ type: 'integer' })
  idCliente!: number;
  @ApiProperty({ type: 'integer' })
  idTienda!: number;
  @ApiProperty({ type: 'integer' })
  idBarrio!: number;
  @ApiProperty({
    type: 'string',
    enum: [
      'PENDIENTE',
      'CONFIRMADO',
      'PREPARANDO',
      'EN_CAMINO',
      'ENTREGADO',
      'CANCELADO',
    ],
  })
  estado!: OrderState;
  @ApiProperty({ type: 'string', format: 'date-time' })
  fechaCreacion!: Date;
  @ApiProperty({ type: 'string' })
  direccionEntrega!: string;
  @ApiProperty({
    type: 'string',
    description: 'Importe decimal exacto, serializado como string.',
    example: '1500.00',
  })
  subtotal!: string;
  @ApiProperty({
    type: 'string',
    description: 'Importe decimal exacto, serializado como string.',
    example: '1500.00',
  })
  tarifaEnvio!: string;
  @ApiProperty({
    type: 'string',
    description: 'Importe decimal exacto, serializado como string.',
    example: '1500.00',
  })
  total!: string;
  @ApiProperty({ type: () => [OrderItemResponseDto] })
  items!: OrderItemResponseDto[];
}
