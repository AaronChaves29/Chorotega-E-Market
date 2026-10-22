import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compile } from 'handlebars';

export function configureAdminViews(app: INestApplication): void {
  const server = app.getHttpAdapter().getInstance() as Express;
  server.engine(
    'hbs',
    (
      path: string,
      options: object,
      callback: (error: Error | null, html?: string) => void,
    ) => {
      void readFile(path, 'utf8')
        .then((template) => {
          callback(null, '<!doctype html>\n' + compile(template)(options));
        })
        .catch((error: unknown) =>
          callback(
            error instanceof Error
              ? error
              : new Error('No se pudo renderizar la vista.'),
          ),
        );
    },
  );
  server.set('view engine', 'hbs');
  server.set('views', join(__dirname, 'views'));
  server.use('/admin', (_request, response, next) => {
    response.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });
}
