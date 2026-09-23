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
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idProducto!: number;

  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  cantidad!: number;
}

export class CreateOrderDto {
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  idBarrio!: number;

  @IsString()
  @Matches(/\S/)
  @MaxLength(255)
  direccionEntrega!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
