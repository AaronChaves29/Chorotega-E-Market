import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from './database.options';

const envPath = resolve(process.cwd(), '.env');

if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

const dataSource = new DataSource(
  createDatabaseOptions(process.env.DATABASE_URL, process.env.DATABASE_SSL),
);

export default dataSource;
