import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { DataSource } from 'typeorm';
import { User } from '../../src/modules/users/entities/user.entity';

// Credenciales y secreto efímeros exclusivos de cada suite; no se carga .env.
export class CatalogHttpAuth {
  private readonly previousSecret = process.env.JWT_SECRET;
  private readonly password = randomUUID();
  private hash!: string;

  async prepare(): Promise<void> {
    process.env.JWT_SECRET = randomUUID();
    this.hash = await bcrypt.hash(this.password, 10);
  }

  async loginAdmin(database: DataSource, server: App): Promise<string> {
    const user = await database.getRepository(User).save({
      authId: randomUUID(),
      nombre: 'Admin',
      apellido: 'Prueba',
      correo: `${randomUUID()}@example.test`,
      rol: 'ADMIN',
      estado: 'ACTIVO',
      claveHash: this.hash,
    });
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ correo: user.correo, clave: this.password })
      .expect(201);
    return (response.body as { token: string }).token;
  }

  restore(): void {
    if (this.previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = this.previousSecret;
  }
}
