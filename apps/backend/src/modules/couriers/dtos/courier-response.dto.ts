import { ApiProperty } from '@nestjs/swagger';
export class CourierResponseDto {
  @ApiProperty({ type: 'integer' })
  idRepartidor!: number;
  @ApiProperty({ type: 'integer' })
  idUsuario!: number;
  @ApiProperty({ type: 'string' })
  medioTransporte!: string;
  @ApiProperty({ type: 'string', enum: ['DISPONIBLE', 'OCUPADO', 'INACTIVO'] })
  disponibilidad!: string;
}
