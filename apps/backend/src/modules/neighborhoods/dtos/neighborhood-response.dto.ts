import { ApiProperty } from '@nestjs/swagger';
export class NeighborhoodResponseDto {
  @ApiProperty({ type: 'integer' })
  idBarrio!: number;
  @ApiProperty({ type: 'string' })
  nombre!: string;
  @ApiProperty({
    type: 'string',
    description: 'Importe decimal exacto, serializado como string.',
    example: '1500.00',
  })
  tarifaEnvio!: string;
  @ApiProperty({ type: 'string', enum: ['ACTIVO', 'INACTIVO'] })
  estado!: string;
}
