import * as bcrypt from 'bcrypt';
import { User } from '../../../src/modules/users/entities/user.entity';
import { Store } from '../../../src/modules/stores/entities/store.entity';
import { Category } from '../../../src/modules/categories/entities/category.entity';
import { Product } from '../../../src/modules/products/entities/product.entity';
import { Neighborhood } from '../../../src/modules/neighborhoods/entities/neighborhood.entity';
import { Courier } from '../../../src/modules/couriers/entities/courier.entity';
import { Order } from '../../../src/modules/orders/entities/order.entity';
import { DeliveriesService } from '../../../src/modules/deliveries/services/deliveries.service';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ReferenceObject,
  SchemaObject,
} from '@nestjs/swagger';
import { configureOpenApi } from '../../../src/common/http/configure-openapi';
import { AuthModule } from '../../../src/auth/auth.module';
import { UsersHttpModule } from '../../../src/modules/users/users-http.module';
import { StoresModule } from '../../../src/modules/stores/stores.module';
import { CategoriesModule } from '../../../src/modules/categories/categories.module';
import { ProductsModule } from '../../../src/modules/products/products.module';
import { OrdersHttpModule } from '../../../src/modules/orders/orders-http.module';
import { DeliveriesModule } from '../../../src/modules/deliveries/deliveries.module';
import { NeighborhoodsModule } from '../../../src/modules/neighborhoods/neighborhoods.module';
import { CouriersModule } from '../../../src/modules/couriers/couriers.module';
import { HealthModule } from '../../../src/modules/health/health.module';
import { createHttpTestApp } from '../../support/create-http-test-app';

type Method = 'get' | 'post' | 'patch' | 'delete';
interface ExpectedOperation {
  method: Method;
  path: string;
  statuses: number[];
  protected: boolean;
}
const expected: ExpectedOperation[] = [];
function add(
  method: Method,
  path: string,
  statuses: number[],
  protectedRoute = false,
) {
  expected.push({
    method,
    path: '/api/v1/' + path,
    statuses,
    protected: protectedRoute,
  });
}
add('post', 'auth/login', [201, 400, 401, 500]);
for (const resource of ['stores', 'categories', 'products']) {
  add('get', resource, [200, 400, 500]);
  add('get', resource + '/{id}', [200, 400, 404, 500]);
  add(
    'post',
    resource,
    resource === 'categories' ? [201, 400, 409, 500] : [201, 400, 404, 500],
  );
  add(
    'patch',
    resource + '/{id}',
    resource === 'categories'
      ? [200, 400, 404, 409, 500]
      : [200, 400, 404, 500],
  );
  add('delete', resource + '/{id}', [204, 400, 404, 409, 500]);
}
add('get', 'users', [200, 400, 401, 403, 500], true);
add('get', 'users/{id}', [200, 400, 401, 403, 404, 500], true);
add('patch', 'users/{id}', [200, 400, 401, 403, 404, 500], true);
add('get', 'orders', [200, 400, 401, 403, 500], true);
add('get', 'orders/{id}', [200, 400, 401, 403, 404, 500], true);
add('post', 'orders', [201, 400, 401, 403, 404, 409, 422, 500], true);
add('get', 'orders/{id}/details', [200, 400, 401, 403, 404, 500], true);
add(
  'get',
  'orders/{id}/details/{detailId}',
  [200, 400, 401, 403, 404, 500],
  true,
);
add('get', 'deliveries', [200, 400, 401, 403, 500], true);
add('get', 'deliveries/{id}', [200, 400, 401, 403, 404, 500], true);
add('post', 'deliveries', [201, 400, 401, 403, 404, 409, 422, 500], true);
for (const action of ['start', 'complete', 'cancel'])
  add(
    'post',
    `deliveries/{id}/${action}`,
    [200, 400, 401, 403, 404, 409, 500],
    true,
  );
for (const resource of ['neighborhoods', 'couriers']) {
  add('get', resource, [200, 500]);
  add('get', resource + '/{id}', [200, 400, 404, 500]);
}
expected.push({
  method: 'get',
  path: '/api/database/health',
  statuses: [200, 503],
  protected: false,
});

const queryFields: Record<string, string[]> = {
  users: [
    'page',
    'size',
    'nombre',
    'apellido',
    'correo',
    'rol',
    'estado',
    'sortBy',
    'sortDirection',
  ],
  stores: [
    'page',
    'size',
    'nombre',
    'estado',
    'idEmprendedor',
    'sortBy',
    'sortDirection',
  ],
  categories: ['page', 'size', 'nombre', 'estado', 'sortBy', 'sortDirection'],
  products: [
    'page',
    'size',
    'idTienda',
    'idCategoria',
    'estado',
    'disponible',
    'sortBy',
    'sortDirection',
  ],
  orders: [
    'page',
    'size',
    'estado',
    'idCliente',
    'idTienda',
    'idBarrio',
    'fechaDesde',
    'fechaHasta',
    'sortBy',
    'sortDirection',
  ],
  deliveries: [
    'page',
    'size',
    'estado',
    'idPedido',
    'idRepartidor',
    'fechaDesde',
    'fechaHasta',
    'sortBy',
    'sortDirection',
  ],
};
const responseModels: Record<string, string> = {
  users: 'UserResponseDto',
  stores: 'StoreResponseDto',
  categories: 'CategoryResponseDto',
  products: 'ProductResponseDto',
  orders: 'OrderResponseDto',
  deliveries: 'DeliveryResponseDto',
  neighborhoods: 'NeighborhoodResponseDto',
  couriers: 'CourierResponseDto',
};

describe('OpenAPI HTTP: contrato generado de las 35 operaciones', () => {
  let context: Awaited<ReturnType<typeof createHttpTestApp>> | undefined;
  let document: OpenAPIObject;
  const previousSecret = process.env.JWT_SECRET;
  function server() {
    if (!context) throw new Error('Aplicación no inicializada');
    return context.app.getHttpServer();
  }
  function operation(path: string, method: Method): OperationObject {
    const value = document.paths[path]?.[method];
    if (!value) throw new Error(`Operación ausente: ${method} ${path}`);
    return value;
  }
  function schema(
    value: SchemaObject | ReferenceObject | undefined,
  ): SchemaObject {
    if (!value) throw new Error('Esquema ausente');
    if ('$ref' in value) {
      const model =
        document.components?.schemas?.[
          value.$ref.replace('#/components/schemas/', '')
        ];
      return schema(model);
    }
    return value;
  }
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    context = await createHttpTestApp(
      [
        AuthModule,
        UsersHttpModule,
        StoresModule,
        CategoriesModule,
        ProductsModule,
        OrdersHttpModule,
        DeliveriesModule,
        NeighborhoodsModule,
        CouriersModule,
        HealthModule,
      ],
      (app) => {
        configureOpenApi(app);
      },
    );
    const response = await request(server())
      .get('/docs-json')
      .expect(200)
      .expect('Content-Type', /application\/json/);
    document = response.body as OpenAPIObject;
  });
  afterAll(async () => {
    try {
      await context?.close();
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });

  it('sirve Swagger UI, su script y JSON sin prefijo global adicional', async () => {
    const ui = await request(server())
      .get('/docs')
      .expect(200)
      .expect('Content-Type', /text\/html/);
    expect(ui.text).toContain('swagger-ui');
    expect(
      (await request(server()).get('/docs/swagger-ui-init.js').expect(200))
        .text,
    ).toContain('Chorotega E-Market API');
    await request(server()).get('/api/v1/docs').expect(404);
    expect(document.openapi).toBe('3.0.0');
    expect(document.info).toMatchObject({
      title: 'Chorotega E-Market API',
      version: '1.0.0',
    });
  });
  it('contiene exactamente las 35 rutas y métodos esperados, sin duplicaciones', () => {
    const actual = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((method) => ['get', 'post', 'patch', 'delete'].includes(method))
        .map((method) => `${method} ${path}`),
    );
    expect(actual.sort()).toEqual(
      expected.map((x) => `${x.method} ${x.path}`).sort(),
    );
    expect(actual).toHaveLength(35);
    expect(document.paths).not.toHaveProperty('/api/v1/api/v1/couriers');
    expect(document.paths).not.toHaveProperty('/api/v1/api/v1/neighborhoods');
    expect(document.paths['/api/v1/users'].post).toBeUndefined();
    expect(document.paths['/api/v1/users/{id}'].delete).toBeUndefined();
  });
  it.each(expected)(
    '$method $path tiene respuestas, parámetros y seguridad correctos',
    (entry) => {
      const op = operation(entry.path, entry.method);
      expect(
        Object.keys(op.responses)
          .map(Number)
          .sort((a, b) => a - b),
      ).toEqual([...entry.statuses].sort((a, b) => a - b));
      expect(op.summary).toEqual(expect.any(String));
      expect(op.description).toEqual(expect.any(String));
      expect(op.security ?? []).toEqual(
        entry.protected ? [{ bearer: [] }] : [],
      );
      const params = (op.parameters ?? []).filter(
        (p): p is ParameterObject => !('$ref' in p),
      );
      const pathNames = [...entry.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      expect(
        params
          .filter((p) => p.in === 'path')
          .map((p) => p.name)
          .sort(),
      ).toEqual(pathNames.sort());
      for (const p of params.filter((p) => p.in === 'path')) {
        expect(p.required).toBe(true);
        expect(schema(p.schema).type).toBe('integer');
      }
      const resource = entry.path.split('/').at(-1)!;
      const query =
        entry.method === 'get' && queryFields[resource]
          ? queryFields[resource]
          : [];
      expect(
        params
          .filter((p) => p.in === 'query')
          .map((p) => p.name)
          .sort(),
      ).toEqual([...query].sort());
      for (const p of params.filter((p) => p.in === 'query'))
        expect(p.required).toBe(false);
      for (const status of entry.statuses.filter((x) => x >= 400)) {
        const response = op.responses[status];
        if (!response || '$ref' in response)
          throw new Error('Respuesta inesperada');
        expect(response.content?.['application/problem+json'].schema).toEqual({
          $ref: '#/components/schemas/ProblemDetailsDto',
        });
      }
      if (entry.statuses.includes(204)) {
        const r = op.responses['204'];
        if (!r || '$ref' in r) throw new Error('Respuesta inesperada');
        expect(r.content).toBeUndefined();
      }
      if (entry.statuses.includes(201) && entry.path !== '/api/v1/auth/login') {
        const r = op.responses['201'];
        if (!r || '$ref' in r) throw new Error('Respuesta inesperada');
        expect(r.headers).toHaveProperty('Location');
      }
    },
  );
  it('todos los $ref del JSON apuntan a componentes existentes', () => {
    function check(value: unknown) {
      if (!value || typeof value !== 'object') return;
      if ('$ref' in value && typeof value.$ref === 'string') {
        expect(value.$ref).toMatch(/^#\/components\/schemas\//);
        expect(document.components?.schemas).toHaveProperty(
          value.$ref.split('/').at(-1)!,
        );
      }
      Object.values(value).forEach(check);
    }
    check(document);
  });
  it('documenta DTOs públicos y no publica entidades ni campos internos', () => {
    const models = document.components?.schemas ?? {};
    for (const name of [
      ...Object.values(responseModels),
      'LoginResponseDto',
      'OrderItemResponseDto',
      'ProblemDetailsDto',
      'DatabaseHealthResponseDto',
    ])
      expect(models).toHaveProperty(name);
    expect(
      Object.keys(schema(models.UserResponseDto).properties ?? {}).sort(),
    ).toEqual(
      [
        'idUsuario',
        'nombre',
        'apellido',
        'correo',
        'telefono',
        'rol',
        'estado',
        'fechaCreacion',
      ].sort(),
    );
    expect(JSON.stringify(models)).not.toMatch(
      /authId|claveHash|clave_hash|driverError|"repartidor"|"pedido"|"detalles"/,
    );
    for (const name of [
      'User',
      'Store',
      'Category',
      'Product',
      'Order',
      'Delivery',
      'Courier',
      'Neighborhood',
    ])
      expect(models).not.toHaveProperty(name);
  });
  it('documenta los campos obligatorios de creación sin convertir los opcionales en requeridos', () => {
    const models = document.components?.schemas ?? {};
    const contracts = [
      {
        name: 'CreateCategoryDto',
        required: ['nombre'],
        optional: ['descripcion', 'estado'],
      },
      {
        name: 'CreateStoreDto',
        required: ['idEmprendedor', 'nombre', 'direccion'],
        optional: ['descripcion', 'telefono', 'horario', 'estado'],
      },
      {
        name: 'CreateProductDto',
        required: [
          'idTienda',
          'idCategoria',
          'nombre',
          'precio',
          'cantidadDisponible',
        ],
        optional: ['descripcion', 'estado'],
      },
    ];
    for (const contract of contracts) {
      const model = schema(models[contract.name]);
      expect([...(model.required ?? [])].sort()).toEqual(
        [...contract.required].sort(),
      );
      for (const field of contract.optional) {
        expect(model.properties).toHaveProperty(field);
        expect(model.required ?? []).not.toContain(field);
      }
    }
  });
  it('documenta PATCH parcial, campos nullable y contraseña writeOnly', () => {
    const models = document.components?.schemas ?? {};
    for (const name of [
      'UpdateUserDto',
      'UpdateStoreDto',
      'UpdateCategoryDto',
      'UpdateProductDto',
    ])
      expect(schema(models[name]).required ?? []).toEqual([]);
    expect(
      schema(schema(models.UpdateUserDto).properties?.telefono).nullable,
    ).toBe(true);
    expect(
      schema(schema(models.UpdateUserDto).properties?.nombre).maxLength,
    ).toBe(100);
    expect(
      schema(schema(models.UpdateUserDto).properties?.telefono).maxLength,
    ).toBe(20);
    expect(schema(schema(models.LoginDto).properties?.clave)).toMatchObject({
      type: 'string',
      writeOnly: true,
      format: 'password',
    });
    expect(schema(models.LoginResponseDto).properties).not.toHaveProperty(
      'clave',
    );
  });
  it('mantiene importes string en respuestas y valida el precio numérico de entrada', () => {
    const models = document.components?.schemas ?? {};
    for (const [name, fields] of [
      ['ProductResponseDto', ['precio']],
      ['OrderResponseDto', ['subtotal', 'tarifaEnvio', 'total']],
      ['OrderItemResponseDto', ['precioUnitario', 'subtotal']],
      ['NeighborhoodResponseDto', ['tarifaEnvio']],
    ] as const)
      for (const field of fields)
        expect(schema(schema(models[name]).properties?.[field]).type).toBe(
          'string',
        );
    expect(
      schema(schema(models.CreateProductDto).properties?.precio),
    ).toMatchObject({
      type: 'number',
      minimum: 0.01,
      maximum: 99999999.99,
      multipleOf: 0.01,
    });
    expect(
      schema(schema(models.CreateOrderDto).properties?.items),
    ).toMatchObject({
      type: 'array',
      minItems: 1,
      items: { $ref: '#/components/schemas/CreateOrderItemDto' },
    });
  });
  it('las seis páginas tienen contenido tipado y metadatos; los listados simples son arrays', () => {
    for (const resource of Object.keys(queryFields)) {
      const response = operation('/api/v1/' + resource, 'get').responses['200'];
      if (!response || '$ref' in response)
        throw new Error('Respuesta inesperada');
      const page = schema(response.content?.['application/json'].schema);
      expect(page.required).toEqual([
        'content',
        'page',
        'size',
        'totalElements',
        'totalPages',
      ]);
      expect(schema(page.properties?.content)).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/' + responseModels[resource] },
      });
      for (const field of ['page', 'size', 'totalElements', 'totalPages'])
        expect(schema(page.properties?.[field]).type).toBe('integer');
    }
    for (const resource of ['neighborhoods', 'couriers']) {
      const response = operation('/api/v1/' + resource, 'get').responses['200'];
      if (!response || '$ref' in response)
        throw new Error('Respuesta inesperada');
      expect(
        schema(response.content?.['application/json'].schema),
      ).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/' + responseModels[resource] },
      });
    }
  });
  it('la colección HTTP incluye las 35 operaciones documentadas', () => {
    const collection = readFileSync(
      resolve(__dirname, '../../../../../docs/laboratory/lab-05/api.http'),
      'utf8',
    );
    const actual = new Set(
      [...collection.matchAll(/^(GET|POST|PATCH|DELETE) (.+)$/gm)].map((m) => {
        const path = m[2]
          .replace('{{baseUrl}}', '')
          .replace(/\?.*$/, '')
          .replace(/\{\{detailId\}\}/g, '{detailId}')
          .replace(
            /\{\{(?:userId|storeId|categoryId|productId|orderId|deliveryId|cancellableDeliveryId|neighborhoodId|courierId)\}\}/g,
            '{id}',
          );
        return `${m[1].toLowerCase()} ${path}`;
      }),
    );
    for (const entry of expected)
      expect(actual.has(`${entry.method} ${entry.path}`)).toBe(true);
  });
  it('ejecuta todos los bloques de api.http con JWT real y datos temporales', async () => {
    if (!context) throw new Error('Aplicación no inicializada');
    const ds = context.database.dataSource;
    const users = ds.getRepository(User),
      stores = ds.getRepository(Store),
      categories = ds.getRepository(Category),
      products = ds.getRepository(Product),
      couriers = ds.getRepository(Courier),
      orders = ds.getRepository(Order);
    const password = randomUUID(),
      claveHash = await bcrypt.hash(password, 10);
    const actors: User[] = [];
    for (const rol of [
      'ADMIN',
      'CLIENTE',
      'REPARTIDOR',
      'EMPRENDEDOR',
      'REPARTIDOR',
    ]) {
      actors.push(
        await users.save({
          authId: randomUUID(),
          nombre: 'Usuario',
          apellido: 'Colección',
          correo: `${randomUUID()}@example.test`,
          rol,
          estado: 'ACTIVO',
          claveHash,
        }),
      );
    }
    const [admin, client, owner, entrepreneur, other] = actors;
    const store = await stores.save({
      idEmprendedor: entrepreneur.idUsuario,
      nombre: 'Catálogo de prueba',
      direccion: 'Nicoya',
    });
    const otherStore = await stores.save({
      idEmprendedor: entrepreneur.idUsuario,
      nombre: 'Otra tienda',
      direccion: 'Nicoya',
    });
    const category = await categories.save({
      nombre: 'Categoría base',
      estado: 'ACTIVA',
    });
    const product = await products.save({
      idTienda: store.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Producto base',
      precio: '1000.00',
      cantidadDisponible: 20,
      estado: 'ACTIVO',
    });
    const otherProduct = await products.save({
      idTienda: otherStore.idTienda,
      idCategoria: category.idCategoria,
      nombre: 'Producto de otra tienda',
      precio: '1000.00',
      cantidadDisponible: 20,
      estado: 'ACTIVO',
    });
    const neighborhood = await ds
      .getRepository(Neighborhood)
      .save({ nombre: 'Barrio base', tarifaEnvio: '100.00', estado: 'ACTIVO' });
    const courier = await couriers.save({
      idUsuario: owner.idUsuario,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });
    const otherCourier = await couriers.save({
      idUsuario: other.idUsuario,
      medioTransporte: 'MOTO',
      disponibilidad: 'DISPONIBLE',
    });
    const makeOrder = () =>
      orders.save({
        idCliente: client.idUsuario,
        idTienda: store.idTienda,
        idBarrio: neighborhood.idBarrio,
        estado: 'PREPARANDO',
        subtotal: '1000.00',
        tarifaEnvio: '100.00',
        total: '1100.00',
        direccionEntrega: 'Nicoya',
      });
    const prepared = await makeOrder(),
      cancellable = await makeOrder();
    const deliveriesService = context.app.get(DeliveriesService);
    const assigned = await deliveriesService.assignDelivery({
      idPedido: cancellable.idPedido,
      idRepartidor: otherCourier.idRepartidor,
    });
    const collection = readFileSync(
      resolve(__dirname, '../../../../../docs/laboratory/lab-05/api.http'),
      'utf8',
    );
    const variables: Record<string, string> = Object.fromEntries(
      [...collection.matchAll(/^@(\w+) = (.+)$/gm)].map((m) => [m[1], m[2]]),
    );
    Object.assign(variables, {
      baseUrl: '',
      adminEmail: admin.correo,
      clientEmail: client.correo,
      courierEmail: owner.correo,
      adminPassword: password,
      clientPassword: password,
      courierPassword: password,
      userId: String(client.idUsuario),
      entrepreneurId: String(entrepreneur.idUsuario),
      catalogStoreId: String(store.idTienda),
      catalogCategoryId: String(category.idCategoria),
      catalogProductId: String(product.idProducto),
      neighborhoodId: String(neighborhood.idBarrio),
      courierId: String(courier.idRepartidor),
      preparedOrderId: String(prepared.idPedido),
      cancellableDeliveryId: String(assigned.idEntrega),
      existingCategoryName: category.nombre,
      otherStoreProductId: String(otherProduct.idProducto),
    });
    const responses: Record<string, unknown> = {};
    function interpolate(text: string): string {
      for (let pass = 0; pass < 8 && text.includes('{{'); pass++) {
        text = text.replace(/\{\{([^{}]+)\}\}/g, (_match, key: string) => {
          if (key in variables) return variables[key];
          const ref = key.match(/^(\w+)\.response\.body\.\$\.(.+)$/);
          if (!ref) throw new Error(`Variable no resuelta: ${key}`);
          let value = responses[ref[1]];
          for (const part of ref[2].replace(/\[(\d+)\]/g, '.$1').split('.')) {
            if (!value || typeof value !== 'object')
              throw new Error(`Respuesta no resuelta: ${key}`);
            value = (value as Record<string, unknown>)[part];
          }
          if (typeof value !== 'number' && typeof value !== 'string')
            throw new Error(`Valor no escalar: ${key}`);
          return String(value);
        });
      }
      if (text.includes('{{')) throw new Error('Referencia sin resolver');
      return text;
    }
    const executed: string[] = [];
    for (const block of collection.split(/^###.*$/m).slice(1)) {
      const name = block.match(/^# @name (\w+)$/m)?.[1];
      const status = Number(block.match(/^# expected-status: (\d+)$/m)?.[1]);
      const route = block.match(/^(GET|POST|PATCH|DELETE) (.+)$/m);
      if (!name || !route || !status) throw new Error('Bloque HTTP incompleto');
      const method = route[1].toLowerCase() as Method;
      const url = interpolate(route[2]);
      let pending = request(server())[method](url);
      const authorization = block.match(/^Authorization: (.+)$/m)?.[1];
      if (authorization)
        pending = pending.set('Authorization', interpolate(authorization));
      const start = block.indexOf('\n{');
      if (start !== -1) {
        const body: unknown = JSON.parse(
          interpolate(block.slice(start).trim()),
        );
        if (!body || typeof body !== 'object') throw new Error('Body inválido');
        pending = pending.send(body);
      }
      const response = await pending;
      expect({ name, status: response.status }).toEqual({ name, status });
      responses[name] = response.body as unknown;
      if (status >= 400)
        expect(response.headers['content-type']).toMatch(
          /application\/problem\+json/,
        );
      if (status === 204) expect(response.text).toBe('');
      if (status === 201 && !url.includes('/auth/login'))
        expect(response.headers.location).toEqual(expect.any(String));
      executed.push(name);
    }
    expect(executed).toHaveLength(43);
    expect(
      await orders.findOneByOrFail({ idPedido: prepared.idPedido }),
    ).toMatchObject({ estado: 'ENTREGADO' });
    expect(
      await couriers.findOneByOrFail({ idRepartidor: courier.idRepartidor }),
    ).toMatchObject({ disponibilidad: 'DISPONIBLE' });
  });
});
