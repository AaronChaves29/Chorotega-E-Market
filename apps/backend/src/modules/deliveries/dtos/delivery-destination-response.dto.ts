import { ApiProperty } from '@nestjs/swagger';

export class DeliveryDestinationResponseDto {
  @ApiProperty({ type: 'integer' })
  idEntrega!: number;

  @ApiProperty({ type: 'integer' })
  idPedido!: number;

  @ApiProperty({ type: 'string', maxLength: 255 })
  direccionEntrega!: string;

  @ApiProperty({ type: 'string', maxLength: 100 })
  nombreBarrio!: string;
}
