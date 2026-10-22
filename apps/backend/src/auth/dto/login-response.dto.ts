import { ApiProperty } from '@nestjs/swagger';
export class LoginResponseDto {
  @ApiProperty({ type: 'string' })
  token!: string;
  @ApiProperty({ type: 'string' })
  tipo!: string;
  @ApiProperty({ type: 'integer' })
  expiraEnSegundos!: number;
}
