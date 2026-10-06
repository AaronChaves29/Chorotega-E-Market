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
} from '@nestjs/common';
import { AssignDeliveryDto } from '../dtos/assign-delivery.dto';
import { DeliveryResponseDto } from '../dtos/delivery-response.dto';
import { DeliverySearchQueryDto } from '../dtos/delivery-search-query.dto';
import { DeliveriesService } from '../services/deliveries.service';
import { PaginationResult } from 'src/common/pagination/pagination-result';

@Controller('api/v1/deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  assignDelivery(@Body() dto: AssignDeliveryDto): Promise<DeliveryResponseDto> {
    return this.deliveriesService.assignDelivery(dto);
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
}
