import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const required = [
  'DEPLOY_SHA', 'RENDER_DEPLOY_HOOK_URL', 'RENDER_API_KEY', 'RENDER_SERVICE_ID',
  'VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID',
  'BACKEND_HEALTH_URL', 'FRONTEND_HEALTH_URL',
];

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error('URL HTTPS de despliegue no válida.');
  return url;
}

export function preflight(env) {
  if (required.some((key) => !env[key]?.trim()))
    throw new Error('Falta configuración de despliegue; revise Secrets y Variables.');
  if (!/^[a-f0-9]{40}$/.test(env.DEPLOY_SHA)) throw new Error('SHA no válido.');
  const hook = httpsUrl(env.RENDER_DEPLOY_HOOK_URL);
  if (hook.hostname !== 'api.render.com' ||
      hook.pathname !== `/deploy/${env.RENDER_SERVICE_ID}` || !hook.searchParams.get('key'))
    throw new Error('El hook no corresponde al servicio Render configurado.');
  for (const name of ['BACKEND_HEALTH_URL', 'FRONTEND_HEALTH_URL']) {
    const url = httpsUrl(env[name]);
    if (url.search) throw new Error('Health no debe incluir parámetros privados.');
  }
}

async function request(url, options, fetchImpl) {
  // Nunca imprimir URL, body ni errores del proveedor (pueden contener secretos).
  return fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
}

export async function health(url, backend, { fetchImpl = fetch, wait = pause, attempts = 30 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await request(url, {}, fetchImpl);
      if (response.status === 200) {
        if (backend && (await response.json()).status === 'connected') return;
        if (!backend && response.headers.get('content-type')?.includes('text/html')) {
          const html = await response.text();
          if (html.includes('Chorotega') && /id=["']login-title["']/.test(html) &&
              /id=["']correo["']/.test(html) && /id=["']clave["']/.test(html)) return;
        }
      }
    } catch { /* Reintento acotado; sin datos internos. */ }
    if (i + 1 < attempts) await wait(5000);
  }
  throw new Error('Health no satisfactorio dentro del plazo.');
}

export async function deployRender(env, { fetchImpl = fetch, wait = pause, attempts = 60 } = {}) {
  const hook = new URL(env.RENDER_DEPLOY_HOOK_URL);
  hook.searchParams.set('ref', env.DEPLOY_SHA);
  // Una sola solicitud: reintentar el hook podría crear despliegues duplicados.
  const accepted = await request(hook, { method: 'POST' }, fetchImpl);
  if (accepted.status !== 200)
    throw new Error('Render no entregó un despliegue rastreable; revise el panel antes de reintentar.');
  const { deploy } = await accepted.json();
  if (!deploy || !/^dep-[a-zA-Z0-9]+$/.test(deploy.id))
    throw new Error('Render no devolvió identificador de despliegue.');
  const endpoint = `https://api.render.com/v1/services/${encodeURIComponent(env.RENDER_SERVICE_ID)}/deploys/${deploy.id}`;
  for (let i = 0; i < attempts; i++) {
    const response = await request(endpoint, {
      headers: { Authorization: `Bearer ${env.RENDER_API_KEY}` },
    }, fetchImpl);
    if (!response.ok) throw new Error('No se pudo consultar el despliegue de Render.');
    const result = await response.json();
    if (['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled', 'deactivated'].includes(result.status))
      throw new Error('Render terminó sin publicar el despliegue.');
    if (result.status === 'live') {
      if (result.commit?.id !== env.DEPLOY_SHA)
        throw new Error('El SHA live de Render no coincide con el aprobado.');
      await health(env.BACKEND_HEALTH_URL, true, { fetchImpl, wait });
      console.log('Render: SHA aprobado live; health satisfactorio.');
      return;
    }
    if (i + 1 < attempts) await wait(10000);
  }
  throw new Error('Timeout esperando Render live; revisar el panel antes de reintentar.');
}

function cli(args, env) {
  const childEnv = { ...env };
  for (const key of ['RENDER_DEPLOY_HOOK_URL', 'RENDER_API_KEY', 'RENDER_SERVICE_ID']) delete childEnv[key];
  const result = spawnSync('vercel', [...args, '--token', env.VERCEL_TOKEN], {
    env: childEnv, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 16 * 1024 * 1024,
    // Se invoca desde la raíz Git, no desde apps/frontend.
  });
  if (result.error || result.status !== 0)
    throw new Error('Vercel CLI falló; salida omitida para proteger variables. Revise el panel.');
  return result.stdout.trim();
}

export function verifyVercelDeployment(result, url, env) {
  const productionHost = new URL(env.FRONTEND_HEALTH_URL).hostname;
  if (result.readyState !== 'READY' || result.target !== 'production' ||
      result.projectId !== env.VERCEL_PROJECT_ID || result.url !== url.hostname ||
      result.meta?.githubCommitSha !== env.DEPLOY_SHA ||
      result.meta?.githubCommitRef !== 'main' || result.aliasError ||
      result.aliasAssigned !== true || !Array.isArray(result.alias) ||
      !result.alias.includes(productionHost))
    throw new Error('Vercel no confirma estado READY, proyecto, SHA y dominio productivo esperados.');
}

export async function main(mode, env = process.env) {
  preflight(env);
  if (mode === 'preflight') return;
  if (mode === 'render') return deployRender(env);
  if (mode === 'vercel-build') {
    cli(['pull', '--yes', '--environment=production'], env);
    const project = JSON.parse(readFileSync('.vercel/project.json', 'utf8'));
    if (project.projectId !== env.VERCEL_PROJECT_ID || project.orgId !== env.VERCEL_ORG_ID ||
        project.settings?.rootDirectory?.replace(/\/$/, '') !== 'apps/frontend' ||
        project.settings?.nodeVersion !== '24.x')
      throw new Error('Proyecto Vercel, Root Directory o Node no coinciden con lo esperado.');
    cli(['build', '--prod'], env);
    console.log('Build Vercel production preparado.');
    return;
  }
  if (mode === 'vercel-deploy') {
    const output = cli(['deploy', '--prebuilt', '--prod', '--yes',
      '--meta', `githubCommitSha=${env.DEPLOY_SHA}`, '--meta', 'githubCommitRef=main'], env);
    const url = httpsUrl(output);
    if (!url.hostname.endsWith('.vercel.app') || url.search)
      throw new Error('URL de despliegue Vercel no válida.');
    cli(['inspect', url.href, '--wait', '--timeout', '5m'], env);
    // inspect JSON omite projectId/meta y renombra alias como aliases.
    // Obtener el objeto autenticado completo; no asumir su forma a partir de CLI.
    const endpoint = new URL(`https://api.vercel.com/v13/deployments/${encodeURIComponent(url.hostname)}`);
    if (env.VERCEL_ORG_ID.startsWith('team_')) endpoint.searchParams.set('teamId', env.VERCEL_ORG_ID);
    const response = await request(endpoint, {
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
    }, fetch);
    if (!response.ok) throw new Error('No se pudo verificar el despliegue Vercel.');
    verifyVercelDeployment(await response.json(), url, env);
    await health(new URL('/login', url), false);
    await health(env.FRONTEND_HEALTH_URL, false);
    console.log('Vercel: despliegue finalizado; URL inmutable y frontend comprobados.');
    return;
  }
  throw new Error('Modo de despliegue no válido.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]).catch(() => {
    // El detalle original puede contener un hook, token, URL o respuesta privada.
    console.error('Falló la etapa de despliegue; consulte el panel sin divulgar credenciales.');
    process.exitCode = 1;
  });
}
