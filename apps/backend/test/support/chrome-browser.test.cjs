const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { existsSync } = require('node:fs');
const {
  startChromeBrowser,
  inspectChrome,
  chromeFailureClass,
} = require('./chrome-browser.cjs');

function fakeChrome(reply) {
  const child = new EventEmitter();
  child.exitCode = child.signalCode = null;
  child.pid = 123;
  child.stderr = new PassThrough();
  child.stdio = [
    null,
    null,
    child.stderr,
    new PassThrough(),
    new PassThrough(),
  ];
  child.kill = (signal) => {
    child.signalCode = signal;
    child.emit('exit', null, signal);
  };
  child.stdio[3].on('data', (data) => {
    const message = JSON.parse(data.toString().replace(/\0$/, ''));
    reply?.(message, child);
  });
  return child;
}

async function failsWith(child, pattern, options = {}) {
  let profile;
  await assert.rejects(
    startChromeBrowser({
      inspectImpl: () => '/synthetic/chrome',
      timeoutMs: 30,
      spawnImpl: (binary, args, spawnOptions) => {
        assert.equal(binary, '/synthetic/chrome');
        assert.deepEqual(spawnOptions.stdio, [
          'ignore',
          'ignore',
          'pipe',
          'pipe',
          'pipe',
        ]);
        assert(args.includes('--remote-debugging-pipe'));
        assert(!args.includes('--no-sandbox'));
        profile = args
          .find((a) => a.startsWith('--user-data-dir='))
          .slice('--user-data-dir='.length);
        return child;
      },
      ...options,
    }),
    (error) => {
      assert.match(error.message, pattern);
      assert(!error.message.includes('synthetic-private'));
      return true;
    },
  );
  if (profile) assert.equal(existsSync(profile), false);
}

test('version y ubicacion se validan sin imprimir salida ni rutas privadas', () => {
  const logs = [];
  const original = console.log;
  console.log = (value) => logs.push(value);
  try {
    assert.equal(
      inspectChrome({
        env: { CHROME_BIN: '/synthetic-private/chrome' },
        exists: () => true,
        realpath: () => '/synthetic-private/real',
        execute: (binary, args, options) => {
          assert.deepEqual(args, ['--version']);
          assert.equal(options.timeout, 5000);
          return {
            status: 0,
            stdout: 'Google Chrome 156.0.8078.79\nsynthetic-private',
            stderr: 'synthetic-private',
          };
        },
      }),
      '/synthetic-private/chrome',
    );
    assert.deepEqual(JSON.parse(logs[0]), {
      event: 'chrome_binary',
      binary: 'custom_redacted',
      resolved: 'custom_redacted',
      version: '156.0.8078.79',
    });
    assert(!logs.join('').includes('synthetic-private'));
  } finally {
    console.log = original;
  }
});

test('preflight falla con binario ausente o version fallida sin salida privada', () => {
  assert.throws(
    () => inspectChrome({ env: {}, exists: () => false }),
    /Se requiere Chrome/,
  );
  assert.throws(
    () =>
      inspectChrome({
        env: {},
        exists: () => true,
        execute: () => ({
          status: 1,
          stderr: 'Permission denied synthetic-private',
        }),
      }),
    /class=permission$/,
  );
  assert.throws(
    () =>
      inspectChrome({
        env: {},
        exists: () => true,
        execute: () => {
          throw Error('synthetic-private');
        },
      }),
    /version_spawn_failed$/,
  );
});

test('clasificacion de stderr solo devuelve categorias controladas', () => {
  for (const [text, category] of [
    ['No usable sandbox!', 'sandbox'],
    ['/dev/shm: No space left on device', 'shared_memory'],
    ['error while loading shared libraries', 'missing_library'],
    ['Remote debugging pipe file descriptors are not open', 'devtools_pipe'],
    ['Permission denied', 'permission'],
    ['synthetic-private', 'unknown'],
  ])
    assert.equal(chromeFailureClass(text), category);
});

test('salida prematura informa exit y sandbox, conserva limpieza', async () => {
  const child = fakeChrome((message, process) => {
    process.stderr.write('No usable sandbox! synthetic-private');
    process.exitCode = 1;
    process.emit('exit', 1, null);
  });
  await failsWith(child, /cause=early_exit exit=1 signal=none class=sandbox/);
  const alreadyExited = fakeChrome();
  alreadyExited.exitCode = 2;
  await failsWith(alreadyExited, /cause=early_exit exit=2/);
});

test('error de spawn no se convierte en timeout ni revela el objeto Error', async () => {
  const child = fakeChrome((message, process) =>
    process.emit(
      'error',
      Object.assign(Error('synthetic-private'), { code: 'EACCES' }),
    ),
  );
  await failsWith(child, /cause=spawn_EACCES/);
});

test('timeout conserva diagnostico acotado y termina Chrome', async () => {
  const child = fakeChrome((message, process) =>
    process.stderr.write(
      'synthetic-private '.repeat(1000) + 'No usable sandbox!',
    ),
  );
  await failsWith(child, /cause=devtools_timeout .*class=unknown/);
  assert.equal(child.signalCode, 'SIGKILL');
});

test('errores de escritura y cierre del pipe rechazan inmediatamente', async () => {
  await failsWith(
    fakeChrome((message, child) =>
      child.stdio[3].emit('error', Error('synthetic-private')),
    ),
    /cause=pipe_write_failed/,
  );
  await failsWith(
    fakeChrome((message, child) =>
      child.stdio[4].emit('error', Error('synthetic-private')),
    ),
    /cause=pipe_read_failed/,
  );
  await failsWith(
    fakeChrome((message, child) => child.stdio[4].end()),
    /cause=pipe_closed/,
  );
});

test('JSON invalido y error DevTools no se imprimen ni ocultan el fallo', async () => {
  await failsWith(
    fakeChrome((message, child) => child.stdio[4].write('synthetic-private\0')),
    /cause=protocol_invalid_json/,
  );
  await failsWith(
    fakeChrome((message, child) =>
      child.stdio[4].write(
        JSON.stringify({
          id: message.id,
          error: { message: 'synthetic-private' },
        }) + '\0',
      ),
    ),
    /cause=devtools_error/,
  );
});

test('handshake sano mantiene comandos, navegacion y registros funcionales', async () => {
  const commands = [];
  const child = fakeChrome((message, process) => {
    commands.push(message.method);
    const result =
      message.method === 'Target.createTarget'
        ? { targetId: 'target' }
        : message.method === 'Target.attachToTarget'
          ? { sessionId: 'session' }
          : message.method === 'Runtime.evaluate'
            ? { result: { value: '/admin/products' } }
            : {};
    process.stdio[4].write(JSON.stringify({ id: message.id, result }) + '\0');
    if (message.method === 'Page.navigate') {
      for (const event of [
        {
          method: 'Network.requestWillBeSent',
          params: {
            request: {
              method: 'POST',
              url: 'http://127.0.0.1/admin/login',
              headers: {
                Origin: 'http://127.0.0.1',
                Cookie: 'synthetic-private',
              },
            },
            redirectResponse: {
              url: 'http://127.0.0.1/admin/login',
              status: 303,
            },
          },
        },
        { method: 'Page.loadEventFired', params: {} },
      ])
        process.stdio[4].write(JSON.stringify(event) + '\0');
    }
    if (message.method === 'Browser.close') {
      process.exitCode = 0;
      process.emit('exit', 0, null);
    }
  });
  const browser = await startChromeBrowser({
    inspectImpl: () => '/synthetic/chrome',
    spawnImpl: () => child,
  });
  await browser.navigate('http://127.0.0.1/admin/products');
  assert.equal(await browser.evaluate('location.pathname'), '/admin/products');
  assert.deepEqual(browser.requests, [
    { method: 'POST', path: '/admin/login', origin: 'http://127.0.0.1' },
  ]);
  assert.deepEqual(browser.redirects, [{ path: '/admin/login', status: 303 }]);
  assert(!JSON.stringify(browser.requests).includes('synthetic-private'));
  await browser.close();
  assert.equal(commands[0], 'Browser.getVersion');
});
