import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { toProblemDetails } from '../http/problem-details';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter<unknown> {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    // Se omiten parámetros de consulta que podrían contener datos sensibles.
    const problem = toProblemDetails(error, request.path);
    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }
}
