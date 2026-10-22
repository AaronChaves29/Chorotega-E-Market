import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idProducto!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  cantidad!: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idBarrio!: number;

  @ApiProperty({ type: 'string', maxLength: 255, pattern: '\\S' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  direccionEntrega!: string;

  @ApiProperty({ type: () => [CreateOrderItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
