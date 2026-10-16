import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { DataSource } from 'typeorm';
import { readNodeEnvironment } from '../config/environment';
import { createDatabaseOptions } from './database.options';

const environment = readNodeEnvironment();
if (environment === 'development') {
  for (const name of ['.env.development', '.env']) {
    const envPath = resolve(process.cwd(), name);
    if (existsSync(envPath)) loadEnvFile(envPath);
  }
  if (readNodeEnvironment() !== environment)
    throw new Error('NODE_ENV debe seleccionarse en el entorno del proceso.');
}

const dataSource = new DataSource(
  createDatabaseOptions(process.env.DATABASE_URL, process.env.DATABASE_SSL, {
    production: environment === 'production',
    ca: process.env.DATABASE_CA_CERT,
  }),
);

export default dataSource;
