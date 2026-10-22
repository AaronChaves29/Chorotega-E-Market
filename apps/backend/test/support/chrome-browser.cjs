const { spawn } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

// Perfil exclusivo de pruebas: no lee cookies, cuentas ni perfiles del usuario.
async function startChromeBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const binary = candidates.find((path) => existsSync(path));
  if (!binary)
    throw new Error(
      'Se requiere Chrome/Chromium local o CHROME_BIN para test:browser.',
    );
  const profile = mkdtempSync(join(tmpdir(), 'chorotega-mvc-browser-'));
  const child = spawn(
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
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] },
  );
  let sequence = 0,
    buffer = '',
    sessionId;
  const pending = new Map(),
    events = new Map();
  const requests = [],
    redirects = [];
  function disconnected() {
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(new Error('Chrome cerró la conexión de pruebas.'));
    }
    pending.clear();
    for (const task of events.values()) {
      clearTimeout(task.timer);
      task.reject(new Error('Chrome cerró antes de la navegación.'));
    }
    events.clear();
  }
  child.on('error', disconnected);
  child.on('exit', disconnected);
  child.stdio[4].on('data', (chunk) => {
    buffer += chunk.toString();
    let position;
    while ((position = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, position);
      buffer = buffer.slice(position + 1);
      if (!raw) continue;
      const message = JSON.parse(raw);
      if (message.id) {
        const task = pending.get(message.id);
        if (task) {
          pending.delete(message.id);
          clearTimeout(task.timer);
          message.error
            ? task.reject(new Error(message.error.message))
            : task.resolve(message.result);
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
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome no respondió a ${method}.`));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      child.stdio[3].write(
        JSON.stringify({
          id,
          method,
          params,
          ...(targetSession ? { sessionId: targetSession } : {}),
        }) + '\0',
      );
    });
  }
  function event(method) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        events.delete(method);
        reject(new Error(`No se completó ${method}.`));
      }, 15000);
      events.set(method, { resolve, reject, timer });
    });
  }
  async function close() {
    if (child.exitCode === null && child.signalCode === null && child.pid) {
      await call('Browser.close', {}, null).catch(() => {});
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
    await close();
    throw error;
  }
}
module.exports = { startChromeBrowser };
