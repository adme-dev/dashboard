import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import * as compactor from '../../scripts/compact-worker-static-data.mjs'
import { compactDeployedWorkerModules, compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'

it('preserves every generated icon and repeated registration in workerd while reducing deployed bytes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'worker-icon-data-'))
  let worker: Miniflare | undefined
  try {
    const collections = [{ prefix: 'lucide', icons: Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`icon-${i}`, { width: 24, height: 24, body: `<path fill="none" d="M${i} 2h20v20H2z"/>` }])) }]
    const json = JSON.stringify(collections)
    const entry = path.join(directory, 'chunks/virtual/entry.mjs')
    await mkdir(path.dirname(entry), { recursive: true })
    const source = `export function register(addCollection) { for (const collection of JSON.parse(${JSON.stringify(json)})) addCollection(collection); }`
    await writeFile(entry, source)
    expect(compactor).toHaveProperty('compactIconBundleModule')
    const result = await compactor.compactIconBundleModule(directory)
    expect(result.literals).toBe(1)
    expect(result.savedBytes).toBeGreaterThan(Buffer.byteLength(source) / 2)
    const compacted = await readFile(entry, 'utf8')
    expect(await compactor.compactIconBundleModule(directory)).toEqual({ literals: 0, savedBytes: 0 })
    expect(await readFile(entry, 'utf8')).toBe(compacted)
    const index = path.join(directory, 'index.js')
    await writeFile(index, `import { register } from './chunks/virtual/entry.mjs'; export default { fetch() { const results = []; register(value => results.push(value)); return Response.json({ name: register.name, results }); } }`)
    await compactDeployedWorkerModules(directory)
    await compactWorkerModuleFilenames(directory)
    worker = new Miniflare({ scriptPath: index, modulesRoot: directory, modules: true, modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }], compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'] })
    for (let i = 0; i < 2; i++) {
      const response = await worker.dispatchFetch('https://worker.test/')
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ name: 'register', results: collections })
    }
  } finally {
    await worker?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)

it('leaves unrelated JSON, keys, tags and dynamic icon templates untouched', () => {
  expect(compactor).toHaveProperty('compactIconBundleSource')
  const json = JSON.stringify([{ prefix: 'lucide', icons: { test: { body: '<path/>'.repeat(100) } } }])
  const cases = [
    `export const x = JSON.parse(${JSON.stringify(JSON.stringify({ unrelated: 'text'.repeat(1000) }))});`,
    `export const x = { ${JSON.stringify(json)}: true };`,
    `export const x = tag\`${json}\`;`,
    `export const x = JSON.parse(\`${json}\${next()}\`);`
  ]
  for (const source of cases) expect(compactor.compactIconBundleSource(source)).toEqual({ code: source, literals: 0 })
})
