import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  ApiPageResponse,
  ApiProblemResponses,
} from '../../../common/http/openapi-contract';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import type { PaginationResult } from '../../../common/pagination/pagination-result';
import { OrdersService } from '../services/orders.service';
import { OrdersReadService } from '../services/orders-read.service';
import { CreateOrderDto } from '../dtos/create-order.dto';
import {
  OrderResponseDto,
  OrderItemResponseDto,
} from '../dtos/order-response.dto';
import { OrderSearchQueryDto } from '../dtos/order-search-query.dto';
import { rethrowOrderHttpError } from '../http/order-http-error';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@ApiTags('orders')
@ApiBearerAuth('bearer')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersReadService: OrdersReadService,
  ) {}

  @ApiOperation({
    summary: 'Listar pedidos',
    description:
      'Roles: ADMIN, CLIENTE, EMPRENDEDOR. ADMIN consulta todos, CLIENTE solo propios y EMPRENDEDOR solo pedidos de sus tiendas; recursos ajenos devuelven 404. Los detalles pertenecen al pedido de la URL. Paginación en PostgreSQL, filtros combinables, columnas de orden controladas y desempate por identificador.',
  })
  @ApiPageResponse(OrderResponseDto)
  @ApiProblemResponses([400, 401, 403, 500])
  @Get()
  @Roles('ADMIN', 'CLIENTE', 'EMPRENDEDOR')
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: OrderSearchQueryDto,
  ): Promise<PaginationResult<OrderResponseDto>> {
    return this.ordersReadService.search(request.user, query);
  }

  @ApiOperation({
    summary: 'Consultar pedidos por ID',
    description:
      'Roles: ADMIN, CLIENTE, EMPRENDEDOR. ADMIN consulta todos, CLIENTE solo propios y EMPRENDEDOR solo pedidos de sus tiendas; recursos ajenos devuelven 404. Los detalles pertenecen al pedido de la URL.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: OrderResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @Get(':id')
  @Roles('ADMIN', 'CLIENTE', 'EMPRENDEDOR')
  findById(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderResponseDto> {
    return this.ordersReadService.findById(request.user, id);
  }

  @ApiOperation({
    summary: 'Crear pedidos',
    description:
      'Roles: CLIENTE. idCliente procede del JWT; creación y confirmación transaccional con importes calculados por el servicio.',
  })
  @ApiBody({ type: CreateOrderDto })
  @ApiResponse({
    status: 201,
    type: OrderResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
    headers: {
      Location: {
        description: 'Ruta del recurso creado.',
        schema: { type: 'string', example: '/api/v1/orders/1' },
      },
    },
  })
  @ApiProblemResponses([400, 401, 403, 404, 409, 422, 500])
  @Post()
  @Roles('CLIENTE')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateOrderDto,
    @Res({ passthrough: true }) response: Pick<Response, 'location'>,
  ): Promise<OrderResponseDto> {
    try {
      const order = await this.ordersService.createAndConfirm(
        request.user.idUsuario,
        dto,
      );
      response.location(`/api/v1/orders/${order.idPedido}`);
      return order;
    } catch (error) {
      rethrowOrderHttpError(error);
    }
  }

  @ApiOperation({
    summary: 'Listar detalles del pedido',
    description:
      'Roles: ADMIN, CLIENTE, EMPRENDEDOR. ADMIN consulta todos, CLIENTE solo propios y EMPRENDEDOR solo pedidos de sus tiendas; recursos ajenos devuelven 404. Los detalles pertenecen al pedido de la URL.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: OrderItemResponseDto,
    isArray: true,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @Get(':id/details')
  @Roles('ADMIN', 'CLIENTE', 'EMPRENDEDOR')
  findDetails(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderItemResponseDto[]> {
    return this.ordersReadService.findDetails(request.user, id);
  }

  @ApiOperation({
    summary: 'Consultar un detalle del pedido',
    description:
      'Roles: ADMIN, CLIENTE, EMPRENDEDOR. ADMIN consulta todos, CLIENTE solo propios y EMPRENDEDOR solo pedidos de sus tiendas; recursos ajenos devuelven 404. Los detalles pertenecen al pedido de la URL.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiParam({
    name: 'detailId',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: OrderItemResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
  @Get(':id/details/:detailId')
  @Roles('ADMIN', 'CLIENTE', 'EMPRENDEDOR')
  findDetail(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('detailId', ParseIntPipe) detailId: number,
  ): Promise<OrderItemResponseDto> {
    return this.ordersReadService.findDetail(request.user, id, detailId);
  }
}
