import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AdminExceptionFilter implements ExceptionFilter<unknown> {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    if (status === 401) {
      response.redirect(303, '/admin/login');
      return;
    }
    const messages: Record<number, string> = {
      400: 'La solicitud contiene datos no válidos.',
      403: 'No tiene permiso o el formulario venció. Recargue la página.',
      404: 'El recurso no existe.',
      409: 'No se pudo completar la operación por un conflicto.',
      422: 'No se cumplen las condiciones para realizar la operación.',
      429: 'Demasiadas solicitudes. Inténtelo más tarde.',
    };
    response.status(status).render('error', {
      status,
      message: messages[status] ?? 'No fue posible completar la solicitud.',
    });
  }
}
