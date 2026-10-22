import { ApiProperty } from '@nestjs/swagger';
export class UserResponseDto {
  @ApiProperty({ type: 'integer' })
  idUsuario!: number;
  @ApiProperty({ type: 'string' })
  nombre!: string;
  @ApiProperty({ type: 'string' })
  apellido!: string;
  @ApiProperty({ type: 'string', format: 'email' })
  correo!: string;
  @ApiProperty({ type: 'string', nullable: true })
  telefono!: string | null;
  @ApiProperty({
    type: 'string',
    enum: ['ADMIN', 'CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'],
  })
  rol!: string;
  @ApiProperty({ type: 'string', enum: ['ACTIVO', 'INACTIVO'] })
  estado!: string;
  @ApiProperty({ type: 'string', format: 'date-time' })
  fechaCreacion!: Date;
}
