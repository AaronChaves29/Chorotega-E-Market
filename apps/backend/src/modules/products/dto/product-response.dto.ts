import { ApiProperty } from '@nestjs/swagger';
export class ProductResponseDto {
  @ApiProperty({ type: 'integer' })
  idProducto!: number;
  @ApiProperty({ type: 'integer' })
  idTienda!: number;
  @ApiProperty({ type: 'integer' })
  idCategoria!: number;
  @ApiProperty({ type: 'string' })
  nombre!: string;
  @ApiProperty({ type: 'string', nullable: true })
  descripcion!: string | null;
  @ApiProperty({
    type: 'string',
    description: 'Importe decimal exacto, serializado como string.',
    example: '1500.00',
  })
  precio!: string;
  @ApiProperty({ type: 'integer' })
  cantidadDisponible!: number;
  @ApiProperty({ type: 'string', enum: ['ACTIVO', 'INACTIVO', 'AGOTADO'] })
  estado!: string;
  @ApiProperty({ type: 'string', format: 'date-time' })
  fechaPublicacion!: Date;
}
