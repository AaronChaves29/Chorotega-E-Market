import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  ParseIntPipe,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { AssignDeliveryDto } from '../dtos/assign-delivery.dto';
import { DeliveryResponseDto } from '../dtos/delivery-response.dto';
import { DeliverySearchQueryDto } from '../dtos/delivery-search-query.dto';
import { DeliveriesService } from '../services/deliveries.service';
import { PaginationResult } from 'src/common/pagination/pagination-result';
import type { Response } from 'express';

@Controller('api/v1/deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async assignDelivery(
    @Body() dto: AssignDeliveryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DeliveryResponseDto> {
    const delivery = await this.deliveriesService.assignDelivery(dto);

    response.location(`/api/v1/deliveries/${delivery.idEntrega}`);

    return delivery;
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  startDelivery(
    @Param('id', ParseIntPipe) idEntrega: number,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService.startDelivery(idEntrega);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  completeDelivery(
    @Param('id', ParseIntPipe) idEntrega: number,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService.completeDelivery(idEntrega);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelDelivery(
    @Param('id', ParseIntPipe) idEntrega: number,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService.cancelDelivery(idEntrega);
  }

  @Get()
  findAll(
    @Query() query: DeliverySearchQueryDto,
  ): Promise<PaginationResult<DeliveryResponseDto>> {
    return this.deliveriesService.search(query);
  }

  @Get(':id')
  findById(
    @Param('id', ParseIntPipe) idEntrega: number,
  ): Promise<DeliveryResponseDto> {
    return this.deliveriesService.findById(idEntrega);
  }
}
