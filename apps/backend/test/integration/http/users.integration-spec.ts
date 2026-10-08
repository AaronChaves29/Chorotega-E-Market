import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import type { DeepPartial } from 'typeorm';
import { UsersHttpModule } from '../../../src/modules/users/users-http.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import type { UserResponseDto } from '../../../src/modules/users/dtos/user-response.dto';
import type { PaginationResult } from '../../../src/common/pagination/pagination-result';
import { createHttpTestApp } from '../../support/create-http-test-app';

describe('Usuarios: administración HTTP con JWT y PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  let admin: User;
  let target: User;
  let token: string;
  let hash: string;
  const password = 'Clave-de-prueba-local-123!';
  const previousSecret = process.env.JWT_SECRET;
  const path = '/api/v1/users';
  const publicFields = [
    'idUsuario',
    'nombre',
    'apellido',
    'correo',
    'telefono',
    'rol',
    'estado',
    'fechaCreacion',
  ].sort();

  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    hash = await bcrypt.hash(password, 10);
    context = await createHttpTestApp([UsersHttpModule]);
  });
  beforeEach(async () => {
    admin = await fixture({ nombre: 'Administrador', rol: 'ADMIN' });
    target = await fixture({
      nombre: 'Ana',
      apellido: 'Prueba',
      correo: 'ana@example.test',
      rol: 'CLIENTE',
      telefono: '88888888',
    });
    token = await login(admin);
  });
  afterEach(async () => {
    await context?.database.dataSource.query(
      `TRUNCATE TABLE entrega, detalle_pedido, pedido, repartidor, barrio, producto, categoria, tienda, usuario RESTART IDENTITY`,
    );
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  async function fixture(data: DeepPartial<User> = {}): Promise<User> {
    const repository = context!.database.dataSource.getRepository(User);
    return repository.save(
      repository.create({
        authId: randomUUID(),
        nombre: 'Usuario',
        apellido: 'Prueba',
        correo: `${randomUUID()}@example.test`,
        rol: 'CLIENTE',
        estado: 'ACTIVO',
        claveHash: hash,
        ...data,
      }),
    );
  }
  async function login(user: User): Promise<string> {
    const response = await request(server())
      .post('/api/v1/auth/login')
      .send({ correo: user.correo, clave: password })
      .expect(201);
    const body = response.body as {
      token: string;
      tipo: string;
      expiraEnSegundos: number;
    };
    expect(body).toMatchObject({ tipo: 'Bearer', expiraEnSegundos: 3600 });
    return body.token;
  }
  function publicDto(user: User) {
    return {
      idUsuario: user.idUsuario,
      nombre: user.nombre,
      apellido: user.apellido,
      correo: user.correo,
      telefono: user.telefono,
      rol: user.rol,
      estado: user.estado,
      fechaCreacion: user.fechaCreacion.toISOString(),
    };
  }
  function problem(response: request.Response, status: number) {
    expect(response.headers['content-type']).toMatch(
      /application\/problem\+json/,
    );
    expect(response.body).toMatchObject({
      type: 'about:blank',
      status,
      title: expect.any(String) as string,
      detail: expect.any(String) as string,
      instance: expect.any(String) as string,
    });
    expect(response.text).not.toMatch(
      /QueryFailedError|SELECT |UPDATE |driverError|stack/,
    );
  }
  async function list(query: Record<string, string | number> = {}) {
    const response = await request(server())
      .get(path)
      .set('Authorization', `Bearer ${token}`)
      .query(query)
      .expect(200);
    const result = response.body as PaginationResult<UserResponseDto>;
    for (const item of result.content)
      expect(Object.keys(item).sort()).toEqual(publicFields);
    return result;
  }

  it('ADMIN lista usuarios con metadatos compartidos y sin campos sensibles', async () => {
    expect(await list()).toEqual({
      content: [publicDto(admin), publicDto(target)],
      page: 0,
      size: 20,
      totalElements: 2,
      totalPages: 1,
    });
  });
  it('ADMIN consulta detalle con contrato exacto, sin authId, hashes ni relaciones', async () => {
    await request(server())
      .get(`${path}/${target.idUsuario}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(publicDto(target));
  });
  it('PATCH parcial conserva credenciales y relaciones de identidad; login sigue funcionando', async () => {
    const before = await context!.database.dataSource
      .getRepository(User)
      .findOneByOrFail({ idUsuario: target.idUsuario });
    await request(server())
      .patch(`${path}/${target.idUsuario}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Actualizado' })
      .expect(200)
      .expect({ ...publicDto(target), nombre: 'Actualizado' });
    const after = await context!.database.dataSource
      .getRepository(User)
      .findOneByOrFail({ idUsuario: target.idUsuario });
    expect(after).toEqual({ ...before, nombre: 'Actualizado' });
    const userToken = await login(target);
    problem(
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403),
      403,
    );
  });
  it('PATCH permite apellido, teléfono null y vacío; conserva campos omitidos', async () => {
    const updated = { ...publicDto(target), apellido: 'Otro', telefono: null };
    await request(server())
      .patch(`${path}/${target.idUsuario}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ apellido: 'Otro', telefono: null })
      .expect(200)
      .expect(updated);
    await request(server())
      .patch(`${path}/${target.idUsuario}`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200)
      .expect(updated);
    await request(server())
      .get(`${path}/${target.idUsuario}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(updated);
  });
  it('acepta longitudes máximas reales del perfil', async () => {
    const profile = {
      nombre: 'N'.repeat(100),
      apellido: 'A'.repeat(100),
      telefono: '1'.repeat(20),
    };
    await request(server())
      .patch(`${path}/${target.idUsuario}`)
      .set('Authorization', `Bearer ${token}`)
      .send(profile)
      .expect(200)
      .expect({ ...publicDto(target), ...profile });
  });

  describe.each(['list', 'detail', 'patch'] as const)(
    'protección de %s',
    (operation) => {
      function call(accessToken?: string) {
        const route =
          operation === 'list' ? path : `${path}/${target.idUsuario}`;
        const pending =
          operation === 'patch'
            ? request(server()).patch(route).send({ nombre: 'Prohibido' })
            : request(server()).get(route);
        return accessToken === undefined
          ? pending
          : pending.set('Authorization', `Bearer ${accessToken}`);
      }
      it('rechaza ausencia de JWT con 401', async () => {
        problem(await call().expect(401), 401);
      });
      it('rechaza JWT inválido con 401', async () => {
        problem(await call('token-invalido').expect(401), 401);
      });
      it.each(['CLIENTE', 'EMPRENDEDOR', 'REPARTIDOR'])(
        'rechaza rol %s con 403 sin modificar el usuario',
        async (rol) => {
          const user = rol === 'CLIENTE' ? target : await fixture({ rol });
          problem(await call(await login(user)).expect(403), 403);
          expect(
            (
              await context!.database.dataSource
                .getRepository(User)
                .findOneByOrFail({ idUsuario: target.idUsuario })
            ).nombre,
          ).toBe(target.nombre);
        },
      );
    },
  );
  it.each(['get', 'patch'] as const)(
    '%s devuelve 404 para usuario inexistente',
    async (method) => {
      const pending = request(server())
        [method](`${path}/2147483647`)
        .set('Authorization', `Bearer ${token}`);
      problem(
        await (
          method === 'patch' ? pending.send({ nombre: 'Nuevo' }) : pending
        ).expect(404),
        404,
      );
      expect(
        await context!.database.dataSource.getRepository(User).count(),
      ).toBe(2);
    },
  );
  it.each(['abc', '1.5', '0', '-1', '2147483648'])(
    'rechaza ID %s en lectura y actualización',
    async (id) => {
      problem(
        await request(server())
          .get(`${path}/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(400),
        400,
      );
      problem(
        await request(server())
          .patch(`${path}/${id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ nombre: 'Nuevo' })
          .expect(400),
        400,
      );
    },
  );
  it.each([
    { nombre: null },
    { nombre: '' },
    { nombre: ' ' },
    { nombre: 1 },
    { nombre: 'N'.repeat(101) },
    { apellido: null },
    { apellido: '' },
    { apellido: ' ' },
    { apellido: 'A'.repeat(101) },
    { telefono: 123 },
    { telefono: '1'.repeat(21) },
    { idUsuario: 9 },
    { authId: '00000000-0000-4000-8000-000000000001' },
    { correo: 'otro@example.test' },
    { rol: 'ADMIN' },
    { estado: 'INACTIVO' },
    { claveHash: 'hash-cliente' },
    { clave_hash: 'hash-cliente' },
    { clave: 'nueva-clave' },
    { fechaCreacion: '2020-01-01T00:00:00Z' },
    { tiendas: [] },
    { extra: true },
  ])(
    'rechaza perfil inválido o campo protegido %j sin escribir',
    async (body) => {
      const repository = context!.database.dataSource.getRepository(User);
      const before = await repository.findOneByOrFail({
        idUsuario: target.idUsuario,
      });
      problem(
        await request(server())
          .patch(`${path}/${target.idUsuario}`)
          .set('Authorization', `Bearer ${token}`)
          .send(body)
          .expect(400),
        400,
      );
      expect(
        await repository.findOneByOrFail({ idUsuario: target.idUsuario }),
      ).toEqual(before);
    },
  );

  it('pagina en PostgreSQL y conserva totales fuera de rango', async () => {
    const first = await list({ size: 1 });
    const second = await list({ size: 1, page: 1 });
    expect(first.content).toEqual([publicDto(admin)]);
    expect(second).toEqual({
      content: [publicDto(target)],
      page: 1,
      size: 1,
      totalElements: 2,
      totalPages: 2,
    });
    expect(await list({ page: 9, size: 1 })).toEqual({
      content: [],
      page: 9,
      size: 1,
      totalElements: 2,
      totalPages: 2,
    });
  });
  it.each([
    [{ nombre: 'ANA' }],
    [{ apellido: 'pru', rol: 'CLIENTE' }],
    [{ correo: 'ANA@EXAMPLE' }],
    [{ rol: 'CLIENTE' }],
  ])('filtra valores parametrizados %j', async (query) => {
    expect((await list(query)).content).toEqual([publicDto(target)]);
  });
  it('combina todos los filtros con orden y paginación', async () => {
    const second = await fixture({
      nombre: 'Ana',
      apellido: 'Prueba',
      correo: 'ana2@example.test',
    });
    await fixture({
      nombre: 'Ana',
      apellido: 'Prueba',
      correo: 'ana3@example.test',
      estado: 'INACTIVO',
    });
    await fixture({
      nombre: 'Ana',
      apellido: 'Prueba',
      correo: 'ana4@example.test',
      rol: 'EMPRENDEDOR',
    });
    await fixture({
      nombre: 'Otro',
      apellido: 'Prueba',
      correo: 'ana5@example.test',
    });
    await fixture({
      nombre: 'Ana',
      apellido: 'Diferente',
      correo: 'ana6@example.test',
    });
    await fixture({
      nombre: 'Ana',
      apellido: 'Prueba',
      correo: 'distinto@example.test',
    });
    expect(
      await list({
        nombre: 'ana',
        apellido: 'pru',
        correo: 'ana',
        rol: 'CLIENTE',
        estado: 'ACTIVO',
        size: 1,
        page: 1,
        sortBy: 'nombre',
      }),
    ).toEqual({
      content: [publicDto(second)],
      page: 1,
      size: 1,
      totalElements: 2,
      totalPages: 2,
    });
  });
  it.each(['ASC', 'DESC'])(
    'ordena por nombre %s y desempata por ID',
    async (sortDirection) => {
      const second = await fixture({ nombre: 'Ana' });
      const expected =
        sortDirection === 'ASC'
          ? [admin, target, second]
          : [second, target, admin];
      expect(
        (await list({ sortBy: 'nombre', sortDirection })).content.map(
          (x) => x.idUsuario,
        ),
      ).toEqual(expected.map((x) => x.idUsuario));
    },
  );
  it('trata comodines y comillas del filtro como datos', async () => {
    const literal = await fixture({ nombre: '100%_local' });
    expect((await list({ nombre: '%_' })).content).toEqual([
      publicDto(literal),
    ]);
    expect((await list({ correo: "' OR 1=1 --" })).totalElements).toBe(0);
  });
  it.each([
    { page: -1 },
    { page: 0.5 },
    { size: 0 },
    { size: 101 },
    { size: 'abc' },
    { sortBy: 'authId' },
    { sortBy: 'claveHash' },
    { sortBy: 'nombre; DROP TABLE usuario' },
    { sortDirection: 'desc' },
    { rol: 'SUPERADMIN' },
    { estado: 'ACTIVA' },
    { nombre: 'N'.repeat(101) },
    { apellido: 'A'.repeat(101) },
    { correo: 'C'.repeat(151) },
    { extra: 'x' },
  ])('rechaza query inválida %j', async (query) => {
    problem(
      await request(server())
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .query(query)
        .expect(400),
      400,
    );
  });
  it('no registra POST ni DELETE aun para ADMIN', async () => {
    problem(
      await request(server())
        .post(path)
        .set('Authorization', `Bearer ${token}`)
        .send({ nombre: 'Nuevo' })
        .expect(404),
      404,
    );
    problem(
      await request(server())
        .delete(`${path}/${target.idUsuario}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404),
      404,
    );
    expect(await context!.database.dataSource.getRepository(User).count()).toBe(
      2,
    );
  });
});
