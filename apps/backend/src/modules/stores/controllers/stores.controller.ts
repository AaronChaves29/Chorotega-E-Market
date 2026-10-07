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
import { StoresService } from '../services/stores.service';
import { CreateStoreDto } from '../dtos/create-store.dto';
import { UpdateStoreDto } from '../dtos/update-store.dto';
import { StoreResponseDto } from '../dtos/store-response.dto';
import { StoreSearchQueryDto } from '../dtos/store-search-query.dto';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  findAll(
    @Query() query: StoreSearchQueryDto,
  ): Promise<PaginationResult<StoreResponseDto>> {
    return this.storesService.search(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<StoreResponseDto> {
    return this.storesService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStoreDto,
    @Res({ passthrough: true }) response: Pick<Response, 'location'>,
  ): Promise<StoreResponseDto> {
    const store = await this.storesService.create(dto);
    response.location(`/api/v1/stores/${store.idTienda}`);
    return store;
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStoreDto,
  ): Promise<StoreResponseDto> {
    return this.storesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.storesService.remove(id);
  }
}
