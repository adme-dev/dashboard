import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'
import { compactSqlTemplateDirectory } from '../../scripts/compact-worker-static-data.mjs'
import { compactDeployedWorkerModules, compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'

it('preserves dynamic SQL bytes, coercion and request isolation through workerd and the complete compaction pipeline', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'pages-sql-template-runtime-'))
  let worker: Miniflare | undefined
  const head = 'SELECT \'Melbourne 🚘\' FROM owned_site WHERE client_id=$1\n' + 'AND enabled = TRUE\n'.repeat(100)
  try {
    await mkdir(path.join(root, 'chunks/nitro'), { recursive: true })
    await mkdir(path.join(root, 'chunks/build'), { recursive: true })
    const source = 'export function query(id) { const events=[]; const value={ [Symbol.toPrimitive](hint) { events.push(hint); return id; } }; return { sql:`' + head + '${value}' + head + '`, args:[id], events }; }'
    await writeFile(path.join(root, 'chunks/nitro/nitro.mjs'), source)
    await writeFile(path.join(root, 'chunks/build/untouched.mjs'), source)
    await writeFile(path.join(root, 'chunks/nitro/nitro.mjs.map'), 'preserved-map')
    const entry = path.join(root, 'index.js')
    await writeFile(entry, 'import { query } from \'./chunks/nitro/nitro.mjs\'; export default { fetch(request) { return Response.json(query(new URL(request.url).searchParams.get(\'id\'))); } };')
    expect(await compactSqlTemplateDirectory(root)).toMatchObject({ changedFiles: 1, literals: 2 })
    expect(await readFile(path.join(root, 'chunks/build/untouched.mjs'), 'utf8')).toBe(source)
    expect(await readFile(path.join(root, 'chunks/nitro/nitro.mjs.map'), 'utf8')).toBe('preserved-map')
    expect(await compactSqlTemplateDirectory(root)).toEqual({ changedFiles: 0, literals: 0, savedBytes: 0 })
    await compactDeployedWorkerModules(root)
    await compactWorkerModuleFilenames(root)
    worker = new Miniflare({ scriptPath: entry, modulesRoot: root, modules: true,
      modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }], compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'] })
    const durations = []
    for (const id of ['customer-a', 'customer-b', 'customer-a']) {
      const start = performance.now()
      const response = await worker.dispatchFetch(`https://worker.test/?id=${id}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ sql: head + id + head, args: [id], events: ['string'] })
      durations.push(performance.now() - start)
    }
    console.info('Local workerd SQL template timings (includes dispatch, not hosted p95):', durations)
  } finally {
    await worker?.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 30_000)
