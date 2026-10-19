import { builtinModules } from 'node:module'
import { build } from 'esbuild'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'

it('bundles the private Worker without Nitro database code and isolates live workerd RPC database contexts', async () => {
  const root = resolve(import.meta.dirname, '../..')
  const directory = await mkdtemp(join(tmpdir(), 'studio-cms-worker-'))
  let runtime: Miniflare | undefined
  try {
    const bundled = await build({ absWorkingDir: root, entryPoints: ['workers/page-studio-management/src/index.ts'],
      bundle: true, write: false, metafile: true, format: 'esm', platform: 'neutral', mainFields: ['module', 'main'],
      conditions: ['workerd', 'worker'], banner: { js: 'import { createRequire } from \'node:module\'; const require = createRequire(\'file:///management.mjs\');' }, external: ['cloudflare:workers', 'node:*', ...builtinModules],
      tsconfig: 'workers/page-studio-management/tsconfig.json' })
    const modules = Object.keys(bundled.metafile!.inputs)
    expect(modules.some(name => name.endsWith('/cmsDatabase.ts'))).toBe(true)
    expect(modules.some(name => /server\/utils\/(?:db|auth)\.ts$|@neondatabase|nitropack/.test(name))).toBe(false)
    await writeFile(join(directory, 'management.mjs'), bundled.outputFiles[0]!.text)
    const db = await build({ absWorkingDir: root, entryPoints: ['workers/page-studio-management/src/cmsDatabase.ts'], bundle: true,
      write: false, format: 'esm', platform: 'neutral', external: ['node:*'] })
    await writeFile(join(directory, 'database.mjs'), db.outputFiles[0]!.text)
    await writeFile(join(directory, 'probe.mjs'), `import { WorkerEntrypoint } from 'cloudflare:workers';
      import { runCmsDatabaseInvocation, queryOneFresh } from './database.mjs';
      export class Probe extends WorkerEntrypoint {
        async check() {
          const results = await Promise.all(['staging','production'].map(environment =>
            runCmsDatabaseInvocation(async work => work({query:async()=>({rows:[{environment}]})}),async()=>{
              await Promise.resolve(); return await queryOneFresh('SELECT scope');
            })));
          let release; const gate=new Promise(resolve=>release=resolve); let late;
          await runCmsDatabaseInvocation(async work=>work({query:async()=>({rows:[]})}),async()=>{
            late=gate.then(()=>queryOneFresh('SELECT expired')).then(()=>false,()=>true);
          });
          release(); return {results, revoked:await late};
        }
      }
      export default {async fetch(request,env){
        const a=env.PROBE.check; const check=await Reflect.apply(a,env.PROBE,[]);
        const method=env.MANAGEMENT.cmsAuthoring;
        const refused=await Reflect.apply(method,env.MANAGEMENT,[{operation:'untrusted'}]);
        return Response.json({check,refused});
      }};`)
    runtime = new Miniflare({ workers: [
      { name: 'probe', scriptPath: join(directory, 'probe.mjs'), modules: true, modulesRoot: directory, compatibilityDate: '2026-07-15', compatibilityFlags: ['nodejs_compat'],
        serviceBindings: { PROBE: { name: 'probe', entrypoint: 'Probe' }, MANAGEMENT: 'management' } },
      { name: 'management', scriptPath: join(directory, 'management.mjs'), modules: true, modulesRoot: directory, compatibilityDate: '2026-07-15', compatibilityFlags: ['nodejs_compat'] }
    ] })
    const response = await runtime.dispatchFetch('http://cms.test/')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ check: { results: [{ environment: 'staging' }, { environment: 'production' }], revoked: true },
      refused: { ok: false, error: { code: 'CMS_MANAGEMENT_INVALID', statusCode: 400 } } })
  } finally {
    await runtime?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
