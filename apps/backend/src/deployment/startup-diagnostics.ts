export type StartupStage =
  'validacion_variables' | 'migraciones_postgresql' | 'arranque_nestjs';

// Solo mensajes controlados o conocidos sin valores de configuración.
// Un error desconocido puede incluir SQL, datos, credenciales o certificados.
const safeMessages = new Set([
  'NODE_ENV debe seleccionar development, test o production.',
  'NODE_ENV debe seleccionarse en el entorno del proceso antes de cargar archivos locales.',
  'PORT debe ser un puerto entero válido; cero solo se admite en test.',
  'DATABASE_URL debe ser una URL válida de PostgreSQL.',
  'La variable de entorno DATABASE_URL no está configurada.',
  'DATABASE_SSL debe ser "true" o "false".',
  'DATABASE_SSL debe ser true o false.',
  'DATABASE_SSL debe habilitar TLS en producción.',
  'DATABASE_URL no debe contener parámetros TLS en producción; use DATABASE_SSL y DATABASE_CA_CERT.',
  'DATABASE_CA_CERT debe ser un certificado PEM.',
  'DATABASE_CA_CERT debe ser un certificado PEM válido.',
  'DATABASE_CA_CERT requiere DATABASE_SSL habilitado.',
  'MONGODB_URI debe ser una URI de MongoDB.',
  'MONGODB_URI requiere TLS con validación de certificados en producción.',
  'JWT_SECRET requiere al menos 32 caracteres en producción.',
  'CORS_ORIGIN es obligatorio en producción.',
  'CORS_ORIGIN debe contener orígenes explícitos separados por comas.',
  'CORS_ORIGIN requiere orígenes exactos, sin rutas, credenciales ni comodines; HTTPS es obligatorio en producción.',
  'El comando compilado requiere NODE_ENV=production.',
  'Otro proceso está ejecutando migraciones. Reintente el despliegue al finalizar.',
  'self-signed certificate in certificate chain',
  'self-signed certificate',
  'unable to verify the first certificate',
  'certificate has expired',
  'Connection terminated unexpectedly',
  'Connection terminated due to connection timeout',
]);

const safeTypes = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AggregateError',
  'QueryFailedError',
  'DatabaseError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoParseError',
  'MongoServerError',
  'UnknownDependenciesException',
  'UnknownElementException',
]);

const safeCodes = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'CERT_HAS_EXPIRED',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  '28P01',
  '28000',
  '3D000',
  '42P01',
  '42P07',
  '42701',
  '42501',
  '53300',
  '57P03',
  '55P03',
  '57014',
  '23505',
]);

function originalError(error: unknown): unknown {
  const visited = new Set<Error>();
  while (
    error instanceof Error &&
    error.cause instanceof Error &&
    !visited.has(error.cause)
  ) {
    visited.add(error);
    error = error.cause;
  }
  return error;
}

export function reportStartupFailure(
  stage: StartupStage,
  failure: unknown,
): void {
  const error = originalError(failure);
  const type =
    error instanceof Error && safeTypes.has(error.name) ? error.name : 'Error';
  let message = 'Mensaje original omitido por seguridad.';
  if (
    error instanceof Error &&
    (safeMessages.has(error.message) ||
      /^La variable (DATABASE_URL|MONGODB_URI|MONGODB_DATABASE|JWT_SECRET) es obligatoria\.$/.test(
        error.message,
      ))
  )
    message = error.message;
  const code =
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    safeCodes.has(error.code)
      ? error.code
      : undefined;
  // Preserve existing allowlists. Never serialize the original Error/cause.
  const allowedStage = [
    'validacion_variables',
    'migraciones_postgresql',
    'arranque_nestjs',
  ].includes(stage)
    ? stage
    : 'arranque_nestjs';
  process.stdout.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'startup_failure',
      context: 'Startup',
      reason: 'initialization_failed',
      stage: allowedStage,
      type,
      ...(code ? { code } : {}),
      message,
    }) + '\n',
  );
}
