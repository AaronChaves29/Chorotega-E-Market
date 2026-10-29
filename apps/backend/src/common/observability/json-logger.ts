import { ConsoleLogger, type LogLevel } from '@nestjs/common';

const operations = {
  backend_started: { context: 'Bootstrap', reason: 'http_listening' },
  migrations_completed: {
    context: 'Migrations',
    reason: 'pending_migrations_applied',
  },
  startup_aborted: { context: 'Startup', reason: 'startup_failed' },
  migrations_aborted: { context: 'Migrations', reason: 'migration_failed' },
} as const;
type Operation = keyof typeof operations;
const contexts = new Set([
  'Bootstrap',
  'NestFactory',
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'NestApplication',
  'Application',
]);
const levels = new Set<LogLevel>([
  'log',
  'error',
  'warn',
  'debug',
  'verbose',
  'fatal',
]);
const errorTypes = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'QueryFailedError',
  'DatabaseError',
  'MongoServerSelectionError',
  'MongoNetworkError',
]);
const errorCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  '23505',
  '40001',
  '40P01',
  '55P03',
  '57014',
]);

/** No raw messages, stack, request, headers or Error are serialized. */
export class JsonLogger extends ConsoleLogger {
  constructor() {
    super({ json: true, colors: false, compact: true });
  }

  operational(event: Operation, level: LogLevel = 'log', count?: number): void {
    if (!levels.has(level) || !this.isLevelEnabled(level)) return;
    if (!Object.hasOwn(operations, event)) return;
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...operations[event],
        ...(event === 'migrations_completed' &&
        Number.isSafeInteger(count) &&
        count! >= 0
          ? { count }
          : {}),
      }) + '\n',
    );
  }

  protected printMessages(
    messages: unknown[],
    context = 'Application',
    level: LogLevel = 'log',
  ): void {
    const error = messages.find(
      (value): value is Error => value instanceof Error,
    );
    const failure = level === 'error' || level === 'fatal';
    const code =
      error &&
      'code' in error &&
      typeof error.code === 'string' &&
      errorCodes.has(error.code)
        ? error.code
        : undefined;
    // Nest framework messages can include paths, SQL or arbitrary error values.
    // Emit only a fixed event and an allowlisted context, once per call.
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event: failure ? 'framework_error' : 'framework_message',
        context: contexts.has(context) ? context : 'Application',
        reason: 'framework_details_omitted',
        ...(failure
          ? { type: error && errorTypes.has(error.name) ? error.name : 'Error' }
          : {}),
        ...(code ? { code } : {}),
      }) + '\n',
    );
  }
}
