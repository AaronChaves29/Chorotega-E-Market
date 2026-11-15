import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { StoresModule } from '../../../src/modules/stores/stores.module';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { createHttpTestApp } from '../../support/create-http-test-app';

const contacts = {
  instagramUrl: 'https://www.instagram.com/local/',
  facebookUrl: 'https://www.facebook.com/Negocio.Local/',
  whatsappComercial: '50688888888',
};

describe('Store social contacts: real JWT, ownership and PostgreSQL', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  const previousSecret = process.env.JWT_SECRET;
  const actors: Record<string, { id: number; token: string }> = {};
  const endpoint = '/api/v1/stores';
  const server = () => context!.app.getHttpServer();
  const stores = () => context!.database.dataSource.getRepository(Store);
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp([StoresModule]);
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 10);
    for (const [label, rol] of [
      ['admin', 'ADMIN'],
      ['owner', 'EMPRENDEDOR'],
      ['other', 'EMPRENDEDOR'],
      ['client', 'CLIENTE'],
      ['courier', 'REPARTIDOR'],
    ]) {
      const user = await context.database.dataSource.getRepository(User).save({
        authId: randomUUID(),
        correo: `${label}@example.test`,
        nombre: 'Local',
        apellido: 'Prueba',
        rol,
        estado: 'ACTIVO',
        claveHash: hash,
      });
      const response = await request(server())
        .post('/api/v1/auth/login')
        .send({ correo: user.correo, clave: password })
        .expect(201);
      actors[label] = {
        id: user.idUsuario,
        token: (response.body as { token: string }).token,
      };
    }
  });
  afterEach(async () => {
    await context!.database.dataSource.query('DELETE FROM tienda');
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
  const createFixture = () =>
    stores().save({
      idEmprendedor: actors.owner.id,
      nombre: 'Tienda real',
      direccion: 'Nicoya',
      telefono: '88888888',
      ...contacts,
    });
  const authenticated = (
    method: 'get' | 'patch' | 'post',
    path: string,
    actor = 'owner',
  ) =>
    request(server())
      [method](path)
      .set('Authorization', `Bearer ${actors[actor].token}`);
  it.each(['admin', 'owner'])(
    '%s creates and reads canonical social fields with 201 and Location',
    async (actor) => {
      const response = await authenticated('post', endpoint, actor)
        .send({
          idEmprendedor: actors.owner.id,
          nombre: 'Tienda',
          direccion: 'Nicoya',
          instagramUrl: 'https://instagram.com/local',
          facebookUrl: 'https://facebook.com/Negocio.Local',
          whatsappComercial: '+506 8888-8888',
        })
        .expect(201);
      expect(response.body).toMatchObject(contacts);
      const location = response.headers.location;
      await authenticated('get', location).expect(200).expect(response.body);
      const list = await authenticated(
        'get',
        `${endpoint}?size=1&estado=ACTIVA`,
      ).expect(200);
      expect(list.body).toMatchObject({
        totalElements: 1,
        content: [contacts],
      });
      expect(response.text).not.toMatch(
        /claveHash|authId|emprendedor|productos|pedidos/,
      );
    },
  );
  it('retains omitted contacts, replaces values and clears only explicit nulls', async () => {
    const store = await createFixture();
    const path = `${endpoint}/${store.idTienda}`;
    await authenticated('patch', path)
      .send({ nombre: 'Nuevo' })
      .expect(200)
      .expect((response) => expect(response.body).toMatchObject(contacts));
    await authenticated('patch', path)
      .send({
        instagramUrl: 'https://instagram.com/otro',
        whatsappComercial: '+506 7777-7777',
      })
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({
          instagramUrl: 'https://www.instagram.com/otro/',
          facebookUrl: contacts.facebookUrl,
          whatsappComercial: '50677777777',
        }),
      );
    await authenticated('patch', path)
      .send({ instagramUrl: null, facebookUrl: null, whatsappComercial: null })
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({
          instagramUrl: null,
          facebookUrl: null,
          whatsappComercial: null,
          nombre: 'Nuevo',
          telefono: '88888888',
        }),
      );
    expect(
      await stores().findOneByOrFail({ idTienda: store.idTienda }),
    ).toMatchObject({
      instagramUrl: null,
      facebookUrl: null,
      whatsappComercial: null,
    });
  });
  it('ADMIN can update a different owner without transferring ownership', async () => {
    const store = await createFixture();
    await authenticated('patch', `${endpoint}/${store.idTienda}`, 'admin')
      .send({ facebookUrl: 'https://facebook.com/profile.php?id=123' })
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({
          idEmprendedor: actors.owner.id,
          facebookUrl: 'https://www.facebook.com/profile.php?id=123',
        }),
      );
  });
  it.each(['client', 'courier'])(
    '%s is rejected with 403 without changing social contact data',
    async (actor) => {
      const store = await createFixture();
      await authenticated('patch', `${endpoint}/${store.idTienda}`, actor)
        .send({ instagramUrl: null })
        .expect(403);
      await authenticated('post', endpoint, actor)
        .send({
          idEmprendedor: actors[actor].id,
          nombre: 'Tienda',
          direccion: 'Nicoya',
          ...contacts,
        })
        .expect(403);
      expect(
        await stores().findOneByOrFail({ idTienda: store.idTienda }),
      ).toMatchObject(contacts);
      expect(await stores().count()).toBe(1);
    },
  );
  it('conceals foreign stores and rejects assigning identity or transferring ownership', async () => {
    const store = await createFixture();
    await authenticated('patch', `${endpoint}/${store.idTienda}`, 'other')
      .send({ instagramUrl: null })
      .expect(404);
    await authenticated('post', endpoint, 'other')
      .send({
        idEmprendedor: actors.owner.id,
        nombre: 'Tienda',
        direccion: 'Nicoya',
      })
      .expect(403);
    for (const actor of ['owner', 'admin']) {
      await authenticated('patch', `${endpoint}/${store.idTienda}`, actor)
        .send({ idEmprendedor: actors.other.id, instagramUrl: null })
        .expect(403);
    }
    expect(
      await stores().findOneByOrFail({ idTienda: store.idTienda }),
    ).toMatchObject({ ...contacts, idEmprendedor: actors.owner.id });
  });
  it('preserves private reads and rejects absent or invalid JWT with 401', async () => {
    const store = await createFixture();
    for (const auth of [undefined, 'Bearer invalid']) {
      let read = request(server()).get(`${endpoint}/${store.idTienda}`);
      if (auth) read = read.set('Authorization', auth);
      await read.expect(401);
      let write = request(server()).patch(`${endpoint}/${store.idTienda}`);
      if (auth) write = write.set('Authorization', auth);
      await write.send({ instagramUrl: null }).expect(401);
    }
  });
  it.each([
    { instagramUrl: 'http://instagram.com/local' },
    { instagramUrl: 'https://instagram.com:443/local' },
    { instagramUrl: 'https://user:pass@instagram.com/local' },
    { instagramUrl: 'https://instagram.com.evil.test/local' },
    { instagramUrl: 'https://instagram.com/local/?redirect=evil' },
    { instagramUrl: 'https://instagram.com/reel/123' },
    { instagramUrl: 'https://instagram.com/local/#fragment' },
    { facebookUrl: 'https://facebook.com/l.php?u=evil' },
    { facebookUrl: 'https://facebook.com/profile.php?id=1&next=evil' },
    { facebookUrl: 'https://facebook.com.attacker.test/local' },
    { whatsappComercial: 'https://wa.me/50688888888' },
    { whatsappComercial: '0050688888888' },
    { whatsappComercial: '8888-8888' },
    { whatsappComercial: '1'.repeat(16) },
    { whatsappComercial: 50688888888 },
  ])(
    'rejects dangerous or malformed contacts without any partial PATCH or CREATE %#',
    async (invalid) => {
      const store = await createFixture();
      const response = await authenticated(
        'patch',
        `${endpoint}/${store.idTienda}`,
      )
        .send({ nombre: 'No guardar', ...invalid })
        .expect(400);
      expect(response.headers['content-type']).toMatch(
        /application\/problem\+json/,
      );
      expect(response.body).toMatchObject({ status: 400, type: 'about:blank' });
      expect(response.text).not.toMatch(
        /user:pass|stack|QueryFailedError|UPDATE|INSERT/,
      );
      expect(
        await stores().findOneByOrFail({ idTienda: store.idTienda }),
      ).toMatchObject({ ...contacts, nombre: 'Tienda real' });
      await authenticated('post', endpoint)
        .send({
          idEmprendedor: actors.owner.id,
          nombre: 'No crear',
          direccion: 'Nicoya',
          ...invalid,
        })
        .expect(400);
      expect(await stores().count()).toBe(1);
    },
  );
});
