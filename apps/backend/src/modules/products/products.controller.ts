import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { PaginationResult } from '../../common/pagination/pagination-result';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { ProductSearchQueryDto } from './dto/product-search-query.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @Query() query: ProductSearchQueryDto,
  ): Promise<PaginationResult<ProductResponseDto>> {
    return this.productsService.search(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<ProductResponseDto> {
    return this.productsService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateProductDto,
    @Res({ passthrough: true }) response: Pick<Response, 'location'>,
  ): Promise<ProductResponseDto> {
    const product = await this.productsService.create(dto);
    response.location(`/api/v1/products/${product.idProducto}`);
    return product;
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.productsService.remove(id);
  }
}
