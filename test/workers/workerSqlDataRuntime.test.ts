import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'
import { compactNitroSqlModule } from '../../scripts/compact-worker-static-data.mjs'
import { compactDeployedWorkerModules, compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'

it('preserves query bytes and request-specific parameters through workerd and postbuild compaction', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pages-sql-runtime-'))
  let worker: Miniflare | undefined
  const query = 'SELECT \'Literal 🚘\\n\' FROM page_studio_image_wallets WHERE client_id=$1\n' + 'AND balance >= 0\n'.repeat(100)
  try {
    await mkdir(path.join(root, 'chunks/nitro'), { recursive: true })
    await writeFile(path.join(root, 'chunks/nitro/nitro.mjs'), `export function query(db, id) { return db.query(${JSON.stringify(query)}, [id]); }`)
    await writeFile(path.join(root, 'index.js'), `import { query } from './chunks/nitro/nitro.mjs';
export default { fetch(request) { return query({ query(text, args) { return Response.json({text,args}); } }, new URL(request.url).searchParams.get('id')); } };`)
    expect(await compactNitroSqlModule(root)).toMatchObject({ literals: 1 })
    expect(await compactNitroSqlModule(root)).toEqual({ literals: 0, savedBytes: 0 })
    await compactDeployedWorkerModules(root)
    await compactWorkerModuleFilenames(root)
    worker = new Miniflare({ scriptPath: path.join(root, 'index.js'), modulesRoot: root, modules: true,
      modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }], compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'] })
    for (const id of ['customer-a', 'customer-b']) {
      expect(await (await worker.dispatchFetch(`https://worker.test/?id=${id}`)).json()).toEqual({ text: query, args: [id] })
    }
  } finally {
    await worker?.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
