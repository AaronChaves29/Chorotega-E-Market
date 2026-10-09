import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import {
  ApiPageResponse,
  ApiProblemResponses,
} from '../../common/http/openapi-contract';
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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { PaginationResult } from '../../common/pagination/pagination-result';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { ProductSearchQueryDto } from './dto/product-search-query.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Listar productos',
    description:
      'Acceso público. Paginación en PostgreSQL, filtros combinables, columnas de orden controladas y desempate por identificador.',
  })
  @ApiPageResponse(ProductResponseDto)
  @ApiProblemResponses([400, 500])
  @Get()
  findAll(
    @Query() query: ProductSearchQueryDto,
  ): Promise<PaginationResult<ProductResponseDto>> {
    return this.productsService.search(query);
  }

  @ApiOperation({
    summary: 'Consultar productos por ID',
    description: 'Acceso público.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: ProductResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 404, 500])
  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<ProductResponseDto> {
    return this.productsService.findById(id);
  }

  @ApiOperation({
    summary: 'Crear productos',
    description: 'JWT requerido. ADMIN o EMPRENDEDOR propietario.',
  })
  @ApiBody({ type: CreateProductDto })
  @ApiResponse({
    status: 201,
    type: ProductResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
    headers: {
      Location: {
        description: 'Ruta del recurso creado.',
        schema: { type: 'string', example: '/api/v1/products/1' },
      },
    },
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EMPRENDEDOR')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateProductDto,
    @Res({ passthrough: true }) response: Pick<Response, 'location'>,
    @Req() request: { user: AuthenticatedUser },
  ): Promise<ProductResponseDto> {
    const product = await this.productsService.create(dto, request.user);
    response.location(`/api/v1/products/${product.idProducto}`);
    return product;
  }

  @ApiOperation({
    summary: 'Actualizar parcialmente productos',
    description:
      'JWT requerido. ADMIN o EMPRENDEDOR propietario. Actualización parcial; null solo en campos nullable.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiBody({ type: UpdateProductDto })
  @ApiResponse({
    status: 200,
    type: ProductResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EMPRENDEDOR')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: { user: AuthenticatedUser },
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    return this.productsService.update(id, dto, request.user);
  }

  @ApiOperation({
    summary: 'Eliminar productos',
    description: 'JWT requerido. ADMIN o EMPRENDEDOR propietario.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 204,
    description: 'Eliminación correcta; sin cuerpo.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 409, 500])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EMPRENDEDOR')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: { user: AuthenticatedUser },
  ): Promise<void> {
    return this.productsService.remove(id, request.user);
  }
}
