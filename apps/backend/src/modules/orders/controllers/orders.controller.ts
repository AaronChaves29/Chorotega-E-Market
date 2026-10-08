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

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersReadService: OrdersReadService,
  ) {}

  @Get()
  @Roles('ADMIN', 'CLIENTE', 'EMPRENDEDOR')
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: OrderSearchQueryDto,
  ): Promise<PaginationResult<OrderResponseDto>> {
    return this.ordersReadService.search(request.user, query);
  }

  @Get(':id')
  @Roles('ADMIN', 'CLIENTE', 'EMPRENDEDOR')
  findById(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderResponseDto> {
    return this.ordersReadService.findById(request.user, id);
  }

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

  @Get(':id/details')
  @Roles('ADMIN', 'CLIENTE', 'EMPRENDEDOR')
  findDetails(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<OrderItemResponseDto[]> {
    return this.ordersReadService.findDetails(request.user, id);
  }

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
