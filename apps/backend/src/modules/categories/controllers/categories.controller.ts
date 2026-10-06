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
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CategoryResponseDto } from '../dtos/category-response.dto';
import { CategorySearchQueryDto } from '../dtos/category-search-query.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(
    @Query() query: CategorySearchQueryDto,
  ): Promise<PaginationResult<CategoryResponseDto>> {
    return this.categoriesService.search(query);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCategoryDto,
    @Res({ passthrough: true }) response: Pick<Response, 'location'>,
  ): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.create(dto);
    response.location(`/api/v1/categories/${category.idCategoria}`);
    return category;
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.categoriesService.remove(id);
  }
}
