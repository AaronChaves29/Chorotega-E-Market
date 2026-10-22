import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
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
} from '../../../common/http/openapi-contract';
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
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import { CategoriesService } from '../services/categories.service';
import { CreateCategoryDto } from '../dtos/create-category.dto';
import { UpdateCategoryDto } from '../dtos/update-category.dto';
import { CategoryResponseDto } from '../dtos/category-response.dto';
import { CategorySearchQueryDto } from '../dtos/category-search-query.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @ApiOperation({
    summary: 'Listar categorías',
    description:
      'Acceso público. Paginación en PostgreSQL, filtros combinables, columnas de orden controladas y desempate por identificador.',
  })
  @ApiPageResponse(CategoryResponseDto)
  @ApiProblemResponses([400, 500])
  @Get()
  findAll(
    @Query() query: CategorySearchQueryDto,
  ): Promise<PaginationResult<CategoryResponseDto>> {
    return this.categoriesService.search(query);
  }

  @ApiOperation({
    summary: 'Consultar categorías por ID',
    description: 'Acceso público.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: CategoryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 404, 500])
  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.findById(id);
  }

  @ApiOperation({
    summary: 'Crear categorías',
    description: 'JWT requerido. Solo ADMIN.',
  })
  @ApiBody({ type: CreateCategoryDto })
  @ApiResponse({
    status: 201,
    type: CategoryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
    headers: {
      Location: {
        description: 'Ruta del recurso creado.',
        schema: { type: 'string', example: '/api/v1/categories/1' },
      },
    },
  })
  @ApiProblemResponses([400, 401, 403, 409, 500])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateCategoryDto,
    @Res({ passthrough: true }) response: Pick<Response, 'location'>,
    @Req() request: { user: AuthenticatedUser },
  ): Promise<CategoryResponseDto> {
    const category = await this.categoriesService.create(dto, request.user);
    response.location(`/api/v1/categories/${category.idCategoria}`);
    return category;
  }

  @ApiOperation({
    summary: 'Actualizar parcialmente categorías',
    description:
      'JWT requerido. Solo ADMIN. Actualización parcial; null solo en campos nullable.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiResponse({
    status: 200,
    type: CategoryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 409, 500])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: { user: AuthenticatedUser },
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return this.categoriesService.update(id, dto, request.user);
  }

  @ApiOperation({
    summary: 'Eliminar categorías',
    description: 'JWT requerido. Solo ADMIN.',
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
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: { user: AuthenticatedUser },
  ): Promise<void> {
    return this.categoriesService.remove(id, request.user);
  }
}
