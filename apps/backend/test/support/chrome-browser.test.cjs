const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { performance } = require('node:perf_hooks');
const { runInNewContext } = require('node:vm');
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
    /"cause":"binary_missing"/,
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
    /"cause":"nonzero_exit".*"class":"permission"/,
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
    /"cause":"execution_error"/,
  );
});

const privateMarker = 'synthetic-private';
const validVersion = 'Google Chrome 157.0.8103.50';
const diagnosticKeys = [
  'event',
  'cause',
  'exit',
  'signal',
  'node_code',
  'duration_ms',
  'stdout_present',
  'version_recognized',
  'class',
];
function inspectFailure(execute, options = {}) {
  let diagnostic;
  assert.throws(
    () =>
      inspectChrome({
        env: { CHROME_BIN: '/synthetic-private/chrome' },
        exists: () => true,
        realpath: () => {
          assert.fail('A failed version check must not resolve the binary.');
        },
        execute,
        ...options,
      }),
    (error) => {
      assert(!error.message.includes(privateMarker));
      diagnostic = JSON.parse(error.message);
      assert.deepEqual(Object.keys(diagnostic), diagnosticKeys);
      assert.equal(diagnostic.event, 'chrome_preflight_failed');
      assert(Number.isSafeInteger(diagnostic.duration_ms));
      assert(diagnostic.duration_ms >= 0);
      assert.equal(typeof diagnostic.stdout_present, 'boolean');
      assert.equal(typeof diagnostic.version_recognized, 'boolean');
      return true;
    },
  );
  return diagnostic;
}

test('timeout, ENOENT y EACCES se distinguen sin serializar el error', async (t) => {
  for (const code of ['ETIMEDOUT', 'ENOENT', 'EACCES'])
    await t.test(code, () => {
      const error = Object.assign(new Error(privateMarker), {
        code,
        path: '/synthetic-private/chrome',
        stack: privateMarker,
      });
      for (const execute of [
        () => ({
          status: null,
          signal: 'SIGTERM',
          error,
          stdout: privateMarker,
          stderr: privateMarker,
        }),
        () => {
          throw error;
        },
      ]) {
        const d = inspectFailure(execute);
        assert.equal(
          d.cause,
          code === 'ETIMEDOUT' ? 'timeout' : 'execution_error',
        );
        assert.equal(d.node_code, code);
        assert.equal(d.exit, 'unknown');
        assert.equal(d.version_recognized, false);
      }
    });
});

test('salida no cero conserva exit, presencia de stdout y versión reconocida', () => {
  const d = inspectFailure(() => ({
    status: 7,
    stdout: `${validVersion}\n${privateMarker}`,
    stderr: `Permission denied ${privateMarker}`,
  }));
  assert.equal(d.cause, 'nonzero_exit');
  assert.equal(d.exit, 7);
  assert.equal(d.signal, 'none');
  assert.equal(d.node_code, 'none');
  assert.equal(d.stdout_present, true);
  assert.equal(d.version_recognized, true);
  assert.equal(d.class, 'permission');
});

test('stderr se clasifica dentro del límite sin imprimir su contenido', () => {
  const d = inspectFailure(() => ({
    status: 1,
    stdout: Buffer.from(privateMarker),
    stderr: Buffer.from(
      `${'x'.repeat(8192)}Permission denied ${privateMarker}`,
    ),
  }));
  assert.equal(d.stdout_present, true);
  assert.equal(d.class, 'unknown');
});

test('descubrimiento y resolución fallidos conservan diagnóstico seguro', () => {
  const error = Object.assign(new Error(privateMarker), {
    code: 'EACCES',
    path: privateMarker,
    stack: privateMarker,
  });
  const discovery = inspectFailure(() => assert.fail('Must not execute.'), {
    exists: () => {
      throw error;
    },
  });
  assert.equal(discovery.cause, 'unexpected');
  assert.equal(discovery.node_code, 'EACCES');
  const resolution = inspectFailure(
    () => ({ status: 0, stdout: validVersion }),
    {
      realpath: () => {
        throw error;
      },
    },
  );
  assert.equal(resolution.cause, 'binary_unreadable');
  assert.equal(resolution.exit, 0);
  assert.equal(resolution.node_code, 'EACCES');
  assert.equal(resolution.version_recognized, true);
});

test('señales conocidas se conservan y las arbitrarias nunca se imprimen', async (t) => {
  for (const signal of ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGINT'])
    await t.test(signal, () => {
      const d = inspectFailure(() => ({ status: null, signal, stdout: '' }));
      assert.equal(d.cause, 'execution_error');
      assert.equal(d.signal, signal);
      assert.equal(d.exit, 'unknown');
    });
  const d = inspectFailure(() => ({
    status: null,
    signal: `SIGTERM\n${privateMarker}`,
    error: { code: `ENOENT\n${privateMarker}`, message: privateMarker },
  }));
  assert.equal(d.node_code, 'unknown');
  assert.equal(d.signal, 'none');
});

test('los códigos Node solo se aceptan desde la lista explícita', () => {
  for (const code of [
    'ETIMEDOUT',
    'ENOENT',
    'EACCES',
    'EPERM',
    'EAGAIN',
    'ENOMEM',
    'E2BIG',
    'ENOBUFS',
    'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
  ])
    assert.equal(
      inspectFailure(() => ({ error: { code }, status: null })).node_code,
      code,
    );
  for (const code of [undefined, 123, privateMarker, 'EOTHER'])
    assert.equal(
      inspectFailure(() => ({ error: { code }, status: null })).node_code,
      'unknown',
    );
  let reads = 0;
  const d = inspectFailure(() => ({
    status: 1,
    error: {
      get code() {
        return ++reads <= 2 ? 'EACCES' : privateMarker;
      },
    },
  }));
  assert.equal(d.node_code, 'EACCES');
  assert.equal(reads, 2);
});

test('resultado sin código de salida o anómalo sigue fallando', () => {
  for (const status of [undefined, null, NaN, '0']) {
    const d = inspectFailure(() => ({ status, stdout: validVersion }));
    assert.equal(d.cause, 'unknown_result');
    assert.equal(d.exit, 'unknown');
    assert.equal(d.version_recognized, true);
  }
  for (const result of [undefined, null, false])
    assert.equal(inspectFailure(() => result).cause, 'unknown_result');
});

test('versión ausente o no reconocida falla aun con exit cero', async (t) => {
  for (const [i, stdout] of [
    '',
    privateMarker,
    'Google Chrome 157',
    'Other 157.0.8103.50',
  ].entries())
    await t.test(`invalid_version_${i}`, () => {
      const d = inspectFailure(() => ({
        status: 0,
        stdout,
        stderr: privateMarker,
      }));
      assert.equal(d.cause, 'unrecognized_version');
      assert.equal(d.exit, 0);
      assert.equal(d.stdout_present, stdout.length > 0);
      assert.equal(d.version_recognized, false);
    });
});

test('duración monotónica válida no depende del reloj de calendario', () => {
  const original = Date.now;
  const before = performance.now();
  let d;
  try {
    Date.now = () => {
      throw new Error(privateMarker);
    };
    d = inspectFailure(() => ({ status: 1 }));
  } finally {
    Date.now = original;
  }
  assert(Number.isInteger(d.duration_ms));
  assert(d.duration_ms <= Math.ceil(performance.now() - before) + 1);
});

test('errores inesperados, getters y metadatos privados no escapan', () => {
  const d = inspectFailure(() => {
    throw Object.assign(new Error(privateMarker), {
      code: privateMarker,
      stack: privateMarker,
      path: privateMarker,
    });
  });
  assert.equal(d.cause, 'execution_error');
  assert.equal(d.node_code, 'unknown');
  assert.equal(
    inspectFailure(() => ({
      status: 0,
      stdout: {
        toString() {
          throw new Error(privateMarker);
        },
      },
    })).cause,
    'unknown_result',
  );
  assert.equal(
    inspectFailure(() => ({
      status: 0,
      error: {
        get code() {
          throw new Error(privateMarker);
        },
      },
      stdout: validVersion,
    })).cause,
    'unknown_result',
  );
});

function preflightCli({ result, thrown, unexpected = false }) {
  const output = { stdout: [], stderr: [] },
    main = { exports: {} };
  let calls = 0;
  const mockRequire = (id) => {
    if (id === 'node:child_process')
      return {
        spawnSync: (binary, args, options) => {
          calls++;
          assert.equal(binary, '/synthetic-private/chrome');
          assert.deepEqual(Array.from(args), ['--version']);
          assert.equal(options.timeout, 5000);
          assert.equal(options.maxBuffer, 8192);
          assert.equal(options.encoding, 'utf8');
          assert.deepEqual(Array.from(options.stdio), [
            'ignore',
            'pipe',
            'pipe',
          ]);
          if (thrown) throw thrown;
          return result;
        },
        spawn: () => assert.fail('Preflight must not launch MVC Chrome.'),
      };
    if (id === 'node:fs')
      return {
        ...require(id),
        existsSync: () => true,
        realpathSync: () => '/synthetic-private/real',
      };
    if (id === 'node:perf_hooks' && unexpected)
      return {
        performance: {
          now() {
            throw new Error(privateMarker);
          },
        },
      };
    return require(id);
  };
  mockRequire.main = main;
  const process = {
    env: { CHROME_BIN: '/synthetic-private/chrome' },
    argv: ['node', 'chrome-browser.cjs', '--check'],
  };
  runInNewContext(readFileSync(join(__dirname, 'chrome-browser.cjs'), 'utf8'), {
    require: mockRequire,
    module: main,
    process,
    Buffer,
    console: {
      log: (line) => output.stdout.push(line),
      error: (line) => output.stderr.push(line),
    },
  });
  const text = JSON.stringify(output);
  assert(!text.includes(privateMarker));
  return { ...output, exitCode: process.exitCode, calls };
}

test('CLI falla cerrado con JSON controlado, sin stdout/stderr ni excepciones privadas', async (t) => {
  const fixtures = [
    {
      result: {
        error: { code: 'ETIMEDOUT', message: privateMarker },
        status: null,
        signal: 'SIGTERM',
        stderr: privateMarker,
      },
    },
    {
      result: {
        status: 2,
        stdout: privateMarker,
        stderr: `Permission denied ${privateMarker}`,
      },
    },
    { result: { status: 0, stdout: privateMarker, stderr: privateMarker } },
    { result: undefined },
    {
      thrown: Object.assign(new Error(privateMarker), {
        code: 'EACCES',
        path: privateMarker,
        stack: privateMarker,
      }),
    },
    { unexpected: true },
  ];
  for (const [i, fixture] of fixtures.entries())
    await t.test(String(i), () => {
      const result = preflightCli(fixture);
      assert.equal(result.exitCode, 1);
      assert.equal(result.stderr.length, 1);
      assert.equal(result.stdout.length, 0);
      assert.deepEqual(
        Object.keys(JSON.parse(result.stderr[0])),
        diagnosticKeys,
      );
      assert.equal(result.calls, fixture.unexpected ? 0 : 1);
    });
});

test('CLI exitoso conserva versión, rutas redactadas, comando y criterios anteriores', async (t) => {
  for (const name of ['Google Chrome', 'Google Chrome for Testing', 'Chromium'])
    await t.test(name, () => {
      const result = preflightCli({
        result: {
          status: 0,
          stdout: `${name} 157.0.8103.50\n${privateMarker}`,
          stderr: privateMarker,
        },
      });
      assert.equal(result.exitCode, undefined);
      assert.equal(result.stderr.length, 0);
      assert.equal(result.calls, 1);
      assert.deepEqual(JSON.parse(result.stdout[0]), {
        event: 'chrome_binary',
        binary: 'custom_redacted',
        resolved: 'custom_redacted',
        version: '157.0.8103.50',
      });
    });
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
