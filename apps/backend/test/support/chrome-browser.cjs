const { spawn, spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, realpathSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { performance } = require('node:perf_hooks');

const preflightDiagnostics = new WeakMap();
const preflightCauses = new Set([
  'timeout',
  'execution_error',
  'nonzero_exit',
  'unrecognized_version',
  'unknown_result',
  'binary_missing',
  'binary_unreadable',
  'unexpected',
]);
const preflightSignals = new Set([
  'SIGTERM',
  'SIGKILL',
  'SIGABRT',
  'SIGSEGV',
  'SIGINT',
]);
const preflightErrorCodes = new Set([
  'ETIMEDOUT',
  'ENOENT',
  'EACCES',
  'EPERM',
  'EAGAIN',
  'ENOMEM',
  'E2BIG',
  'ENOBUFS',
  'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
]);

function preflightFailure(
  cause,
  { result, error, durationMs = 0, versionRecognized = false } = {},
) {
  let status,
    signal,
    stdout,
    stderr,
    code = 'none';
  try {
    status = result?.status;
    signal = result?.signal;
    stdout = result?.stdout;
    stderr = result?.stderr;
    const executionError = error ?? result?.error;
    if (executionError) {
      const candidateCode = executionError.code;
      code = preflightErrorCodes.has(candidateCode) ? candidateCode : 'unknown';
    }
  } catch {
    code = 'unknown';
  }
  const duration = Math.round(durationMs);
  const diagnostic = Object.freeze({
    event: 'chrome_preflight_failed',
    cause: preflightCauses.has(cause) ? cause : 'unexpected',
    exit:
      Number.isInteger(status) && status >= -2147483648 && status <= 4294967295
        ? status
        : 'unknown',
    signal: preflightSignals.has(signal) ? signal : 'none',
    node_code: code,
    duration_ms:
      Number.isSafeInteger(duration) && duration >= 0 ? duration : 'unknown',
    stdout_present:
      (typeof stdout === 'string' || Buffer.isBuffer(stdout)) &&
      stdout.length > 0,
    version_recognized: versionRecognized === true,
    class: chromeFailureClass(
      typeof stderr === 'string'
        ? stderr.slice(0, 8192)
        : Buffer.isBuffer(stderr)
          ? stderr.subarray(0, 8192).toString('utf8')
          : '',
    ),
  });
  // No original exception or process output is attached to the thrown error.
  const failure = new Error(JSON.stringify(diagnostic));
  preflightDiagnostics.set(failure, diagnostic);
  return failure;
}

const knownLocations = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

function chromeFailureClass(stderr) {
  if (
    /No usable sandbox|Running as root without --no-sandbox|Failed to move to new namespace|userns.*(?:denied|not permitted)/i.test(
      stderr,
    )
  )
    return 'sandbox';
  if (/\/dev\/shm|shared.memory|No space left on device/i.test(stderr))
    return 'shared_memory';
  if (
    /error while loading shared libraries|cannot open shared object file/i.test(
      stderr,
    )
  )
    return 'missing_library';
  if (/remote.debugging.pipe|Remote debugging pipe.*not open/i.test(stderr))
    return 'devtools_pipe';
  if (/Permission denied|Operation not permitted/i.test(stderr))
    return 'permission';
  return 'unknown';
}

function inspectChrome({
  env = process.env,
  exists = existsSync,
  execute = spawnSync,
  realpath = realpathSync,
} = {}) {
  let binary;
  try {
    const candidates = [
      ...(env.CHROME_BIN ? [env.CHROME_BIN] : knownLocations),
    ].filter(Boolean);
    binary = candidates.find((path) => exists(path));
  } catch (error) {
    throw preflightFailure('unexpected', { error });
  }
  if (!binary) throw preflightFailure('binary_missing');
  let result;
  const started = performance.now();
  try {
    result = execute(binary, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 8192,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    let cause = 'execution_error';
    try {
      if (error?.code === 'ETIMEDOUT') cause = 'timeout';
    } catch {
      cause = 'unexpected';
    }
    throw preflightFailure(cause, {
      error,
      durationMs: performance.now() - started,
    });
  }
  const durationMs = performance.now() - started;
  let version;
  try {
    version =
      /^(?:Google Chrome(?: for Testing)?|Chromium) (\d+\.\d+\.\d+\.\d+)\b/m.exec(
        result.stdout ?? '',
      )?.[1];
    if (result.error || result.status !== 0 || !version) {
      const cause =
        result.error?.code === 'ETIMEDOUT'
          ? 'timeout'
          : result.error || preflightSignals.has(result.signal)
            ? 'execution_error'
            : Number.isInteger(result.status) && result.status !== 0
              ? 'nonzero_exit'
              : result.status === 0 && !version
                ? 'unrecognized_version'
                : 'unknown_result';
      throw preflightFailure(cause, {
        result,
        durationMs,
        versionRecognized: !!version,
      });
    }
  } catch (error) {
    if (preflightDiagnostics.has(error)) throw error;
    throw preflightFailure('unknown_result', { result, durationMs });
  }
  let resolved;
  try {
    resolved = realpath(binary);
  } catch (error) {
    throw preflightFailure('binary_unreadable', {
      result,
      error,
      durationMs,
      versionRecognized: true,
    });
  }
  // Only known system locations and numeric versions may reach CI logs.
  const allowed = [
    ...knownLocations,
    '/opt/google/chrome/chrome',
    '/opt/google/chrome/google-chrome',
  ];
  console.log(
    JSON.stringify({
      event: 'chrome_binary',
      binary: allowed.includes(binary) ? binary : 'custom_redacted',
      resolved: allowed.includes(resolved) ? resolved : 'custom_redacted',
      version,
    }),
  );
  return binary;
}

// Perfil exclusivo de pruebas: no lee cookies, cuentas ni perfiles del usuario.
async function startChromeBrowser({
  spawnImpl = spawn,
  inspectImpl = inspectChrome,
  timeoutMs = 15000,
} = {}) {
  const binary = inspectImpl();
  const profile = mkdtempSync(join(tmpdir(), 'chorotega-mvc-browser-'));
  let child;
  try {
    child = spawnImpl(
      binary,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-component-update',
        '--password-store=basic',
        '--use-mock-keychain',
        '--remote-debugging-pipe',
        `--user-data-dir=${profile}`,
      ],
      { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] },
    );
  } catch {
    rmSync(profile, { recursive: true, force: true });
    throw new Error('Chrome cause=spawn_failed class=unknown');
  }
  let sequence = 0,
    buffer = '',
    sessionId;
  const pending = new Map(),
    events = new Map();
  const requests = [],
    redirects = [];
  let stderr = '',
    stderrBytes = 0,
    terminalError,
    closing = false,
    lastMethod = 'startup';
  function failure(cause) {
    const exit =
      Number.isInteger(child.exitCode) &&
      child.exitCode >= 0 &&
      child.exitCode <= 255
        ? child.exitCode
        : 'unknown';
    const signal = ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV'].includes(
      child.signalCode,
    )
      ? child.signalCode
      : 'none';
    return new Error(
      `Chrome cause=${cause} exit=${exit} signal=${signal} class=${chromeFailureClass(stderr)} command=${lastMethod}`,
    );
  }
  function disconnected(cause = 'closed') {
    terminalError ??= failure(cause);
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(terminalError);
    }
    pending.clear();
    for (const task of events.values()) {
      clearTimeout(task.timer);
      task.reject(terminalError);
    }
    events.clear();
  }
  child.stderr.on('data', (chunk) => {
    const retained = chunk.subarray(0, Math.max(0, 8192 - stderrBytes));
    stderrBytes += retained.length;
    stderr += retained.toString('utf8');
  });
  child.on('error', (error) =>
    disconnected(
      ['ENOENT', 'EACCES', 'EPERM'].includes(error.code)
        ? `spawn_${error.code}`
        : 'spawn_failed',
    ),
  );
  child.on('exit', () => disconnected(closing ? 'closed' : 'early_exit'));
  child.stdio[3].on('error', () => disconnected('pipe_write_failed'));
  child.stdio[4].on('error', () => disconnected('pipe_read_failed'));
  child.stdio[4].on('end', () => {
    if (!closing) disconnected('pipe_closed');
  });
  child.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString();
    if (Buffer.byteLength(buffer) > 1024 * 1024)
      return disconnected('protocol_output_limit');
    let position;
    while ((position = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, position);
      buffer = buffer.slice(position + 1);
      if (!raw) continue;
      let message;
      try {
        message = JSON.parse(raw);
      } catch {
        return disconnected('protocol_invalid_json');
      }
      if (!message || typeof message !== 'object')
        return disconnected('protocol_invalid_message');
      if (message.id) {
        const task = pending.get(message.id);
        if (task) {
          pending.delete(message.id);
          clearTimeout(task.timer);
          if (message.error) {
            terminalError ??= failure('devtools_error');
            task.reject(terminalError);
            disconnected('devtools_error');
          } else task.resolve(message.result);
        }
      } else {
        if (message.method === 'Network.requestWillBeSent') {
          const { request, redirectResponse } = message.params;
          // Solo método, ruta, origen y estado; nunca cuerpos, cookies o Authorization.
          requests.push({
            method: request.method,
            path: new URL(request.url).pathname,
            origin: request.headers.Origin,
          });
          if (redirectResponse)
            redirects.push({
              path: new URL(redirectResponse.url).pathname,
              status: redirectResponse.status,
            });
        }
        const task = events.get(message.method);
        if (task) {
          events.delete(message.method);
          clearTimeout(task.timer);
          task.resolve(message.params);
        }
      }
    }
  });
  function call(method, params = {}, targetSession = sessionId) {
    return new Promise((resolve, reject) => {
      if (terminalError) return reject(terminalError);
      if (child.exitCode !== null || child.signalCode !== null)
        return reject(failure('early_exit'));
      lastMethod = [
        'Browser.getVersion',
        'Browser.close',
        'Target.createTarget',
        'Target.attachToTarget',
        'Page.enable',
        'Network.enable',
        'Page.navigate',
        'Runtime.evaluate',
      ].includes(method)
        ? method
        : 'other';
      const id = ++sequence;
      const timer = setTimeout(() => {
        disconnected('devtools_timeout');
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        child.stdio[3].write(
          JSON.stringify({
            id,
            method,
            params,
            ...(targetSession ? { sessionId: targetSession } : {}),
          }) + '\0',
          (error) => {
            if (error) disconnected('pipe_write_failed');
          },
        );
      } catch {
        disconnected('pipe_write_failed');
      }
    });
  }
  function event(method) {
    return new Promise((resolve, reject) => {
      if (terminalError) return reject(terminalError);
      const timer = setTimeout(() => {
        events.delete(method);
        reject(failure('navigation_timeout'));
      }, timeoutMs);
      events.set(method, { resolve, reject, timer });
    });
  }
  async function close() {
    closing = true;
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      if (terminalError) child.kill('SIGKILL');
      else await call('Browser.close', {}, null).catch(() => {});
      await new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null)
          return resolve();
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    disconnected();
    rmSync(profile, { recursive: true, force: true });
  }
  try {
    await call('Browser.getVersion');
    const { targetId } = await call('Target.createTarget', {
      url: 'about:blank',
    });
    ({ sessionId } = await call('Target.attachToTarget', {
      targetId,
      flatten: true,
    }));
    await call('Page.enable');
    await call('Network.enable');
    return {
      requests,
      redirects,
      close,
      async navigate(url) {
        const loaded = event('Page.loadEventFired');
        await Promise.all([loaded, call('Page.navigate', { url })]);
      },
      async evaluate(expression) {
        const result = await call('Runtime.evaluate', {
          expression,
          returnByValue: true,
        });
        if (result.exceptionDetails)
          throw new Error('Falló la expresión del navegador de pruebas.');
        return result.result.value;
      },
      async submit(expression) {
        const loaded = event('Page.loadEventFired');
        await Promise.all([loaded, call('Runtime.evaluate', { expression })]);
      },
    };
  } catch (error) {
    try {
      await close();
    } catch {
      console.error('Chrome cause=cleanup_failed');
    }
    throw error;
  }
}
module.exports = { startChromeBrowser, inspectChrome, chromeFailureClass };

if (require.main === module && process.argv[2] === '--check') {
  try {
    inspectChrome();
  } catch (error) {
    // Fail closed if an unexpected exception escapes the controlled preflight.
    const failure = preflightDiagnostics.has(error)
      ? error
      : preflightFailure('unexpected', { error });
    console.error(JSON.stringify(preflightDiagnostics.get(failure)));
    process.exitCode = 1;
  }
}
