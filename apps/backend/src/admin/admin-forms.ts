import { HttpException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import type { PaginationResult } from '../common/pagination/pagination-result';

export async function validateForm<T extends object>(
  type: ClassConstructor<T>,
  body: Record<string, unknown>,
  numericFields: readonly string[] = [],
) {
  const input = { ...body };
  delete input._csrf;
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') values[key] = value;
    if (
      numericFields.includes(key) &&
      typeof value === 'string' &&
      value.trim() !== ''
    )
      input[key] = Number(value);
  }
  if (input.estado === '') delete input.estado;
  const dto = plainToInstance(type, input);
  const failures = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
  const errors: Record<string, string> = {};
  for (const failure of failures) {
    const key = failure.constraints?.whitelistValidation
      ? '_form'
      : failure.property;
    errors[key] =
      key === '_form'
        ? 'El formulario contiene campos no permitidos.'
        : Object.values(failure.constraints ?? {}).join(' ');
  }
  return { dto, values, errors };
}

export function domainFormError(
  error: unknown,
  fields: Record<string, string>,
) {
  if (
    !(error instanceof HttpException) ||
    ![400, 404, 409, 422].includes(error.getStatus())
  )
    throw error;
  const field = fields[error.message];
  return {
    status: error.getStatus(),
    errors: {
      [field ?? '_form']: field
        ? error.message
        : 'No se pudo guardar. Revise los datos y las relaciones seleccionadas.',
    },
  };
}

export function pageView<T>(
  result: PaginationResult<T>,
  query: object,
  path: string,
) {
  const link = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, page }))
      if (value !== undefined) params.set(key, String(value));
    return `${path}?${params.toString()}`;
  };
  return {
    ...result,
    displayPage: result.page + 1,
    previous: result.page > 0 ? link(result.page - 1) : undefined,
    next:
      result.page + 1 < result.totalPages ? link(result.page + 1) : undefined,
  };
}
