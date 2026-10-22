import { ApiProperty } from '@nestjs/swagger';
export class CategoryResponseDto {
  @ApiProperty({ type: 'integer' })
  idCategoria!: number;
  @ApiProperty({ type: 'string' })
  nombre!: string;
  @ApiProperty({ type: 'string', nullable: true })
  descripcion!: string | null;
  @ApiProperty({ type: 'string', enum: ['ACTIVA', 'INACTIVA'] })
  estado!: string;
}
