import { ApiProperty } from '@nestjs/swagger';
export class StoreResponseDto {
  @ApiProperty({ type: 'integer' })
  idTienda!: number;
  @ApiProperty({ type: 'integer' })
  idEmprendedor!: number;
  @ApiProperty({ type: 'string' })
  nombre!: string;
  @ApiProperty({ type: 'string', nullable: true })
  descripcion!: string | null;
  @ApiProperty({ type: 'string' })
  direccion!: string;
  @ApiProperty({ type: 'string', nullable: true })
  telefono!: string | null;
  @ApiProperty({ type: 'string', nullable: true })
  horario!: string | null;
  @ApiProperty({ type: 'string', nullable: true, maxLength: 500 })
  instagramUrl!: string | null;
  @ApiProperty({ type: 'string', nullable: true, maxLength: 500 })
  facebookUrl!: string | null;
  @ApiProperty({
    type: 'string',
    nullable: true,
    maxLength: 15,
    pattern: '^[1-9][0-9]{7,14}$',
  })
  whatsappComercial!: string | null;
  @ApiProperty({ type: 'string', enum: ['ACTIVA', 'INACTIVA'] })
  estado!: string;
  @ApiProperty({ type: 'string', format: 'date-time' })
  fechaCreacion!: Date;
}
