import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Standalone diagnostic: no import of the production deployment orchestrator.
export function classify(stdout, stderr) {
  let data;
  try { data = JSON.parse(String(stdout ?? '').slice(0, 8192)); } catch { /* No raw output is logged. */ }
  const codes = {
    invalid_token: 'authentication', missing_token: 'authentication', not_authenticated: 'authentication',
    forbidden: 'permission', project_unauthorized: 'project', project_not_found: 'project',
    scope_not_accessible: 'scope', scope_not_found: 'scope', invalid_argument: 'arguments',
  };
  for (const value of [data?.reason, data?.code, data?.error?.code]) {
    if (typeof value === 'string' && Object.hasOwn(codes, value.toLowerCase())) return codes[value.toLowerCase()];
  }
  const text = String(stderr ?? '').slice(0, 8192);
  if (/scope.not.accessible|specified account|specified scope|not able to load teams/i.test(text)) return 'scope';
  if (/project.not.found|project.unauthorized|project settings|not linked/i.test(text)) return 'project';
  if (/invalid token|unauthorized|not authenticated|authentication required/i.test(text)) return 'authentication';
  if (/forbidden|permission denied|not authorized|access denied/i.test(text)) return 'permission';
  if (/unknown (option|argument)|invalid (option|argument)/i.test(text)) return 'arguments';
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed|network error/i.test(text)) return 'network';
  return 'unknown';
}

export function check(env = process.env, execute = spawnSync,
  readProject = () => JSON.parse(readFileSync('.vercel/project.json', 'utf8'))) {
  if (['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'].some((key) => !env[key]?.trim()))
    return 'result=failed cause=missing_configuration';
  // CI-only guard: credentials must never be used from PRs or other branches.
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF !== 'refs/heads/develop')
    return 'result=failed cause=disallowed_context';
  let result;
  try {
    result = execute('vercel', ['pull', '--yes', '--environment=production', `--project=${env.VERCEL_PROJECT_ID}`], {
      env, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch { return 'result=failed command=vercel_pull cause=runner_failed'; }
  if (result.error || result.status !== 0) {
    const cause = result.error?.code === 'ETIMEDOUT' ? 'timeout'
      : result.error?.code === 'ENOBUFS' ? 'output_limit' : result.error ? 'spawn_failed' : 'exit_nonzero';
    const exit = Number.isInteger(result.status) && result.status >= 0 && result.status <= 255 ? result.status : 'unknown';
    return `result=failed command=vercel_pull cause=${cause} exit=${exit} class=${classify(result.stdout, result.stderr)}`;
  }
  let project;
  try { project = readProject(); } catch { return 'result=failed cause=project_settings_unreadable'; }
  if (project?.projectId !== env.VERCEL_PROJECT_ID) return 'result=failed cause=project_mismatch';
  if (project.orgId !== env.VERCEL_ORG_ID) return 'result=failed cause=organization_mismatch';
  if (project.settings?.rootDirectory !== 'apps/frontend') return 'result=failed cause=root_directory_mismatch';
  if (project.settings?.nodeVersion !== '24.x') return 'result=failed cause=node_version_mismatch';
  return 'result=success project=matched organization=matched root=matched node=matched';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let summary;
  try { summary = check(); } catch { summary = 'result=failed cause=unexpected'; }
  console.log(summary);
  if (!summary.startsWith('result=success ')) process.exitCode = 1;
}
