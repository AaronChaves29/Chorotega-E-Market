import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CouriersService } from '../modules/couriers/services/couriers.service';
import { AssignDeliveryDto } from '../modules/deliveries/dtos/assign-delivery.dto';
import { DeliverySearchQueryDto } from '../modules/deliveries/dtos/delivery-search-query.dto';
import type { DeliveryResponseDto } from '../modules/deliveries/dtos/delivery-response.dto';
import { rethrowDeliveryHttpError } from '../modules/deliveries/http/delivery-http-error';
import { DeliveriesService } from '../modules/deliveries/services/deliveries.service';
import { AdminExceptionFilter } from './admin-exception.filter';
import { pageView, validateForm } from './admin-forms';
import {
  AdminCsrfGuard,
  AdminSessionGuard,
  type AdminRequest,
} from './admin.guards';

const messages: Record<number, string> = {
  400: 'Revise los identificadores y campos del formulario.',
  403: 'No tiene permiso para realizar esta operación.',
  404: 'No se encontró el pedido, repartidor o entrega indicado.',
  409: 'El estado cambió o existe un conflicto. Consulte las entregas y la disponibilidad antes de continuar.',
  422: 'El pedido no cumple las condiciones de dirección o barrio activo.',
  500: 'No se pudo confirmar el resultado. Consulte el estado antes de intentar otra operación. No se reenviará automáticamente.',
};

// Translate known domain errors through the same adapter as REST. Never render
// original messages, SQL, connection errors or unknown exceptions.
function failure(error: unknown) {
  try {
    rethrowDeliveryHttpError(error);
  } catch (translated) {
    const code =
      translated instanceof HttpException ? translated.getStatus() : 500;
    const status = Object.hasOwn(messages, code) ? code : 500;
    return { status, message: messages[status] };
  }
}

function identifier(value: string): number {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2_147_483_647)
    throw new BadRequestException();
  return Number(value);
}

function presentation(delivery: DeliveryResponseDto) {
  const dates = new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Costa_Rica',
  });
  return {
    ...delivery,
    fechaAsignacion: dates.format(delivery.fechaAsignacion),
    fechaEntrega: delivery.fechaEntrega
      ? dates.format(delivery.fechaEntrega)
      : 'Pendiente',
    canCancel: delivery.estado === 'ASIGNADA',
  };
}

@ApiExcludeController()
@Controller('admin/deliveries')
@UseFilters(AdminExceptionFilter)
@UseGuards(AdminSessionGuard, RolesGuard, AdminCsrfGuard)
@Roles('ADMIN')
export class AdminDeliveriesController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly couriers: CouriersService,
  ) {}

  @Get()
  async list(
    @Query() input: Record<string, unknown>,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ) {
    const normalized = { ...input };
    // Empty native GET controls mean no filter, not an invalid enum/date/ID.
    for (const key of [
      'estado',
      'idPedido',
      'idRepartidor',
      'fechaDesde',
      'fechaHasta',
    ])
      if (normalized[key] === '') delete normalized[key];
    if ('_csrf' in normalized) throw new BadRequestException();
    const { dto, errors } = await validateForm(
      DeliverySearchQueryDto,
      normalized,
    );
    if (Object.keys(errors).length) throw new BadRequestException();
    const query = {
      ...dto,
      fechaDesde: dto.fechaDesde?.toISOString(),
      fechaHasta: dto.fechaHasta?.toISOString(),
    };
    try {
      const result = await this.deliveries.searchVisible(dto, request.user);
      return response.render('deliveries', {
        csrf: request.adminSession.csrf,
        ...pageView(result, query, '/admin/deliveries'),
        content: result.content.map(presentation),
        filters: query,
        states: ['ASIGNADA', 'EN_CAMINO', 'ENTREGADA', 'CANCELADA'].map(
          (value) => ({ value, selected: value === dto.estado }),
        ),
        sorts: ['fechaAsignacion', 'fechaEntrega', 'idEntrega'].map(
          (value) => ({ value, selected: value === dto.sortBy }),
        ),
        directions: ['ASC', 'DESC'].map((value) => ({
          value,
          selected: value === dto.sortDirection,
        })),
      });
    } catch (error) {
      rethrowDeliveryHttpError(error);
    }
  }

  @Get('new')
  newForm(@Req() request: AdminRequest, @Res() response: Response) {
    return this.form(request, response, 200, {}, {});
  }

  private async form(
    request: AdminRequest,
    response: Response,
    status: number,
    values: Record<string, string>,
    errors: Record<string, string>,
  ) {
    const couriers = await this.couriers.findAll();
    return response.status(status).render('delivery-form', {
      csrf: request.adminSession.csrf,
      values,
      errors,
      couriers: couriers.map((courier) => ({
        idRepartidor: courier.idRepartidor,
        medioTransporte: courier.medioTransporte,
        disponibilidad: courier.disponibilidad,
        selected: String(courier.idRepartidor) === values.idRepartidor,
        // An unavailable selection is still displayed on errors; the service
        // checks current availability atomically, regardless of the form.
      })),
    });
  }

  @Post()
  async assign(
    @Body() input: Record<string, unknown>,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ) {
    const { dto, values, errors } = await validateForm(
      AssignDeliveryDto,
      input,
      ['idPedido', 'idRepartidor'],
    );
    for (const field of ['idPedido', 'idRepartidor'])
      if (typeof input[field] !== 'string' || !/^[1-9]\d*$/.test(input[field]))
        errors[field] = 'Indique un identificador entero positivo.';
    if (Object.keys(errors).length)
      return this.form(request, response, 400, values, errors);
    let delivery: DeliveryResponseDto;
    try {
      delivery = await this.deliveries.assignDelivery(dto);
    } catch (error) {
      const result = failure(error);
      if (result.status !== 500)
        return this.form(request, response, result.status, values, {
          _form: result.message,
        });
      return response.status(500).render('delivery-result', {
        csrf: request.adminSession.csrf,
        ...result,
        checkUrl: `/admin/deliveries?idPedido=${dto.idPedido}`,
      });
    }
    return response.redirect(303, `/admin/deliveries/${delivery.idEntrega}`);
  }

  @Get(':id')
  async detail(
    @Param('id') raw: string,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ) {
    const id = identifier(raw);
    try {
      const delivery = await this.deliveries.findVisibleById(id, request.user);
      return response.render('delivery-detail', {
        csrf: request.adminSession.csrf,
        delivery: presentation(delivery),
      });
    } catch (error) {
      rethrowDeliveryHttpError(error);
    }
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') raw: string,
    @Body() input: Record<string, unknown>,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ) {
    const id = identifier(raw);
    if (Object.keys(input).some((key) => key !== '_csrf'))
      throw new BadRequestException();
    try {
      await this.deliveries.cancelDelivery(id);
    } catch (error) {
      const result = failure(error);
      return response.status(result.status).render('delivery-result', {
        csrf: request.adminSession.csrf,
        ...result,
        checkUrl: `/admin/deliveries/${id}`,
      });
    }
    return response.redirect(303, `/admin/deliveries/${id}`);
  }
}
