import { HttpException } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: string[];
}

export function toProblemDetails(
  error: unknown,
  instance: string,
): ProblemDetails {
  const status = error instanceof HttpException ? error.getStatus() : 500;
  const title = STATUS_CODES[status] ?? 'HTTP Error';
  const problem: ProblemDetails = {
    type: 'about:blank',
    title,
    status,
    detail: status >= 500 ? 'No fue posible completar la solicitud.' : title,
    instance,
  };

  // Solo los mensajes HTTP de cliente son públicos. Nunca serializar el error completo.
  // Las excepciones de negocio requerirán traducciones explícitas según su significado.
  if (error instanceof HttpException && status >= 400 && status < 500) {
    const response = error.getResponse();
    const message: unknown =
      typeof response === 'string'
        ? response
        : 'message' in response
          ? response.message
          : undefined;
    if (typeof message === 'string') {
      problem.detail = message;
    } else if (
      Array.isArray(message) &&
      message.every((item: unknown) => typeof item === 'string')
    ) {
      problem.detail = 'La solicitud contiene datos no válidos.';
      problem.errors = message;
    }
  }
  return problem;
}
