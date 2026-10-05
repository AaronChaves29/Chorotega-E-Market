import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { toProblemDetails } from './problem-details';

describe('Problem Details', () => {
  it.each([
    [new BadRequestException('Entrada inválida'), 400, 'Bad Request'],
    [new UnauthorizedException('Token requerido'), 401, 'Unauthorized'],
    [new ForbiddenException('Acceso denegado'), 403, 'Forbidden'],
    [new NotFoundException('Recurso inexistente'), 404, 'Not Found'],
    [new ConflictException('Recurso en conflicto'), 409, 'Conflict'],
    [
      new UnprocessableEntityException('Regla incumplida'),
      422,
      'Unprocessable Entity',
    ],
  ] as const)(
    'conserva el estado y mensaje público de %s',
    (error, status, title) => {
      expect(toProblemDetails(error, '/api/v1/products')).toEqual({
        type: 'about:blank',
        title,
        status,
        detail: error.message,
        instance: '/api/v1/products',
      });
    },
  );

  it('conserva los errores de validación sin serializar otros campos', () => {
    expect(
      toProblemDetails(
        new BadRequestException({
          message: ['nombre must be a string'],
          stack: 'private-stack',
          sql: 'private-query',
        }),
        '/api/v1/products',
      ),
    ).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'La solicitud contiene datos no válidos.',
      instance: '/api/v1/products',
      errors: ['nombre must be a string'],
    });
  });

  it('acepta una excepción HTTP con cuerpo de texto', () => {
    expect(
      toProblemDetails(new HttpException('Mensaje público', 409), '/'),
    ).toMatchObject({
      status: 409,
      detail: 'Mensaje público',
    });
  });

  it('no publica objetos arbitrarios como mensajes', () => {
    expect(
      toProblemDetails(
        new BadRequestException({ message: { sql: 'private-query' } }),
        '/',
      ),
    ).toMatchObject({
      status: 400,
      detail: 'Bad Request',
    });
  });

  it.each([
    [new Error('SELECT secret FROM private_table'), 500],
    [{ message: 'password=private', stack: 'private-stack' }, 500],
    [new InternalServerErrorException('password=private'), 500],
    [new ServiceUnavailableException('SELECT secret FROM private_table'), 503],
  ] as const)('oculta detalles internos de %s', (error, status) => {
    const problem = toProblemDetails(error, '/api/v1/products');
    expect(problem.status).toBe(status);
    expect(problem.detail).toBe('No fue posible completar la solicitud.');
    expect(JSON.stringify(problem)).not.toMatch(
      /SELECT|private|password|stack/,
    );
  });

  it('no clasifica una excepción de negocio solo por su nombre', () => {
    const error = new Error('Regla privada');
    error.name = 'InsufficientOrderStockException';
    expect(toProblemDetails(error, '/').status).toBe(500);
  });
});
