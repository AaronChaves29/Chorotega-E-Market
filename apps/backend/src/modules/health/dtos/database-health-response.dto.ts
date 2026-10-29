import { ApiProperty } from '@nestjs/swagger';

export class DatabaseHealthResponseDto {
  @ApiProperty({ enum: ['connected'] })
  status!: 'connected';
}
