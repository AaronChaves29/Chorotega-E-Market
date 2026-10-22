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
import { StoresService } from '../services/stores.service';
import { CreateStoreDto } from '../dtos/create-store.dto';
import { UpdateStoreDto } from '../dtos/update-store.dto';
import { StoreResponseDto } from '../dtos/store-response.dto';
import { StoreSearchQueryDto } from '../dtos/store-search-query.dto';

@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @ApiOperation({
    summary: 'Listar tiendas',
    description:
      'Acceso público. Paginación en PostgreSQL, filtros combinables, columnas de orden controladas y desempate por identificador.',
  })
  @ApiPageResponse(StoreResponseDto)
  @ApiProblemResponses([400, 500])
  @Get()
  findAll(
    @Query() query: StoreSearchQueryDto,
  ): Promise<PaginationResult<StoreResponseDto>> {
    return this.storesService.search(query);
  }

  @ApiOperation({
    summary: 'Consultar tiendas por ID',
    description: 'Acceso público.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: StoreResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 404, 500])
  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<StoreResponseDto> {
    return this.storesService.findById(id);
  }

  @ApiOperation({
    summary: 'Crear tiendas',
    description: 'JWT requerido. ADMIN o EMPRENDEDOR propietario.',
  })
  @ApiBody({ type: CreateStoreDto })
  @ApiResponse({
    status: 201,
    type: StoreResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
    headers: {
      Location: {
        description: 'Ruta del recurso creado.',
        schema: { type: 'string', example: '/api/v1/stores/1' },
      },
    },
  })
  @ApiProblemResponses([400, 401, 403, 404, 422, 500])
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'EMPRENDEDOR')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateStoreDto,
    @Res({ passthrough: true }) response: Pick<Response, 'location'>,
    @Req() request: { user: AuthenticatedUser },
  ): Promise<StoreResponseDto> {
    const store = await this.storesService.create(dto, request.user);
    response.location(`/api/v1/stores/${store.idTienda}`);
    return store;
  }

  @ApiOperation({
    summary: 'Actualizar parcialmente tiendas',
    description:
      'JWT requerido. ADMIN o EMPRENDEDOR propietario. Actualización parcial; null solo en campos nullable.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiBody({ type: UpdateStoreDto })
  @ApiResponse({
    status: 200,
    type: StoreResponseDto,
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
    @Body() dto: UpdateStoreDto,
  ): Promise<StoreResponseDto> {
    return this.storesService.update(id, dto, request.user);
  }

  @ApiOperation({
    summary: 'Eliminar tiendas',
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
    return this.storesService.remove(id, request.user);
  }
}
