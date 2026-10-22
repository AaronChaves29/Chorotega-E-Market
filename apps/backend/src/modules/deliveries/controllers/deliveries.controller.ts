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

@ApiTags('deliveries')
@ApiBearerAuth('bearer')
@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @ApiOperation({
    summary: 'Crear entregas',
    description:
      'Roles: ADMIN. Se conservan las reglas de asignación y cancelación del dominio.',
  })
  @ApiBody({ type: AssignDeliveryDto })
  @ApiResponse({
    status: 201,
    type: DeliveryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
    headers: {
      Location: {
        description: 'Ruta del recurso creado.',
        schema: { type: 'string', example: '/api/v1/deliveries/1' },
      },
    },
  })
  @ApiProblemResponses([400, 401, 403, 404, 409, 422, 500])
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

  @ApiOperation({
    summary: 'Ejecutar start de entrega',
    description:
      'Roles: REPARTIDOR. Solo propietario; una entrega ajena devuelve 403. Se conservan transacciones y estados.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: DeliveryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 409, 500])
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

  @ApiOperation({
    summary: 'Ejecutar complete de entrega',
    description:
      'Roles: REPARTIDOR. Solo propietario; una entrega ajena devuelve 403. Se conservan transacciones y estados.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: DeliveryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 409, 500])
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

  @ApiOperation({
    summary: 'Ejecutar cancel de entrega',
    description:
      'Roles: ADMIN. Se conservan las reglas de asignación y cancelación del dominio.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: DeliveryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 409, 500])
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

  @ApiOperation({
    summary: 'Listar entregas',
    description:
      'Roles: ADMIN, REPARTIDOR. ADMIN consulta todas. REPARTIDOR solo las vinculadas a su usuario JWT: alcance SQL antes de paginar y contar; filtros nunca lo amplían. Sin registro asociado, listado vacío y detalle 404. Paginación en PostgreSQL, filtros combinables, columnas de orden controladas y desempate por identificador.',
  })
  @ApiPageResponse(DeliveryResponseDto)
  @ApiProblemResponses([400, 401, 403, 500])
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

  @ApiOperation({
    summary: 'Consultar entregas por ID',
    description:
      'Roles: ADMIN, REPARTIDOR. ADMIN consulta todas. REPARTIDOR solo las vinculadas a su usuario JWT: alcance SQL antes de paginar y contar; filtros nunca lo amplían. Sin registro asociado, listado vacío y detalle 404.',
  })
  @ApiParam({
    name: 'id',
    schema: { type: 'integer' },
    description: 'Identificador del recurso.',
  })
  @ApiResponse({
    status: 200,
    type: DeliveryResponseDto,
    isArray: false,
    description: 'Respuesta pública mediante DTO.',
  })
  @ApiProblemResponses([400, 401, 403, 404, 500])
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
