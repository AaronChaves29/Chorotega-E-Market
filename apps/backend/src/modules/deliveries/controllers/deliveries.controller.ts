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
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Response } from 'express';
import { PaginationResult } from 'src/common/pagination/pagination-result';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { AssignDeliveryDto } from '../dtos/assign-delivery.dto';
import { DeliveryResponseDto } from '../dtos/delivery-response.dto';
import { DeliverySearchQueryDto } from '../dtos/delivery-search-query.dto';
import { DeliveriesService } from '../services/deliveries.service';
import type { Request } from 'express';
import { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';

import { rethrowDeliveryHttpError } from '../http/delivery-http-error';

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  async assignDelivery(
    @Body() dto: AssignDeliveryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveriesService
      .assignDelivery(dto)
      .catch(rethrowDeliveryHttpError);

    response.location(`/api/v1/deliveries/${delivery.idEntrega}`);

    return delivery;
  }

  @Post(':id/start')
  @Roles('REPARTIDOR')
  @HttpCode(HttpStatus.OK)
  startDelivery(
    @Param('id', ParseIntPipe) idEntrega: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService
      .startDelivery(idEntrega, request.user.idUsuario)
      .catch(rethrowDeliveryHttpError);
  }

  @Post(':id/complete')
  @Roles('REPARTIDOR')
  @HttpCode(HttpStatus.OK)
  completeDelivery(
    @Param('id', ParseIntPipe) idEntrega: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService
      .completeDelivery(idEntrega, request.user.idUsuario)
      .catch(rethrowDeliveryHttpError);
  }

  @Post(':id/cancel')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.OK)
  cancelDelivery(
    @Param('id', ParseIntPipe) idEntrega: number,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService
      .cancelDelivery(idEntrega)
      .catch(rethrowDeliveryHttpError);
  }

  @Get()
  @Roles('ADMIN', 'REPARTIDOR')
  findAll(
    @Query() query: DeliverySearchQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaginationResult<DeliveryResponseDto>> {
    return this.deliveriesService
      .searchVisible(query, request.user)
      .catch(rethrowDeliveryHttpError);
  }

  @Get(':id')
  @Roles('ADMIN', 'REPARTIDOR')
  findById(
    @Param('id', ParseIntPipe) idEntrega: number,
    @Req() request: AuthenticatedRequest,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService
      .findVisibleById(idEntrega, request.user)
      .catch(rethrowDeliveryHttpError);
  }
}
