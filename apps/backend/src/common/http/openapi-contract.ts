import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

export class ProblemDetailsDto {
  @ApiProperty({ example: 'about:blank' }) type!: string;
  @ApiProperty({ example: 'Bad Request' }) title!: string;
  @ApiProperty({ type: 'integer', example: 400 }) status!: number;
  @ApiProperty({ example: 'La solicitud contiene datos no válidos.' })
  detail!: string;
  @ApiProperty({ example: '/api/v1/products' }) instance!: string;
  @ApiPropertyOptional({
    type: [String],
    description: 'Mensajes de validación de formato.',
  })
  errors?: string[];
}

export class DatabaseHealthResponseDto {
  @ApiProperty({ enum: ['connected'] }) status!: string;
  @ApiProperty({ description: 'Nombre de la base seleccionada.' })
  database!: string;
  @ApiProperty({ type: String, format: 'date-time' }) timestamp!: Date;
}

export function ApiProblemResponses(statuses: number[]) {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: (
          {
            400: 'Entrada inválida.',
            401: 'JWT ausente, inválido o credenciales incorrectas.',
            403: 'Rol o propiedad no autorizados.',
            404: 'Recurso inexistente o no visible.',
            409: 'Conflicto con el estado o restricciones conocidas.',
            422: 'Regla de negocio no satisfecha.',
            500: 'Error inesperado; mensaje seguro sin detalles internos.',
            503: 'Base de datos no disponible.',
          } as Record<number, string>
        )[status],
        content: {
          'application/problem+json': {
            schema: { $ref: getSchemaPath(ProblemDetailsDto) },
          },
        },
      }),
    ),
  );
}

export function ApiPageResponse(model: Type<unknown>) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: 200,
      description: 'Página dentro del alcance autorizado.',
      schema: {
        type: 'object',
        required: ['content', 'page', 'size', 'totalElements', 'totalPages'],
        properties: {
          content: { type: 'array', items: { $ref: getSchemaPath(model) } },
          page: { type: 'integer', minimum: 0 },
          size: { type: 'integer', minimum: 1, maximum: 100 },
          totalElements: { type: 'integer', minimum: 0 },
          totalPages: { type: 'integer', minimum: 0 },
        },
      },
    }),
  );
}
