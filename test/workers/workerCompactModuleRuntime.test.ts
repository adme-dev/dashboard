import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'

it('loads compact .js static, dynamic and re-exported modules with Pages Worker-directory rules', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pages-compact-runtime-'))
  let worker: Miniflare | undefined
  try {
    const chunks = path.join(directory, 'chunks', 'generated')
    await mkdir(chunks, { recursive: true })
    await writeFile(path.join(chunks, 'value.mjs'), 'export const value = 40')
    await writeFile(path.join(chunks, 'reexport.mjs'), 'export { value } from "./value.mjs"')
    await writeFile(path.join(chunks, 'route.mjs'), 'import { value } from "./reexport.mjs"; export default () => value + 2')
    const entry = path.join(directory, 'index.js')
    await writeFile(entry, `import { value } from './chunks/generated/value.mjs'
      export default { async fetch() {
        const { default: route } = await import('./chunks/generated/route.mjs')
        return Response.json({ value, result: route() })
      } }`)
    await compactWorkerModuleFilenames(directory)
    expect((await readdir(path.join(directory, 'chunks', 'm'))).sort()).toEqual(['0.js', '1.js', '2.js'])
    const before = await readFile(entry, 'utf8')
    await expect(compactWorkerModuleFilenames(directory)).resolves.toMatchObject({ renamedFiles: 0 })
    expect(await readFile(entry, 'utf8')).toBe(before)
    worker = new Miniflare({
      scriptPath: entry,
      modulesRoot: directory,
      modules: true,
      // Mirrors Wrangler's produceWorkerBundleForWorkerJSDirectory and pages dev.
      modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
      compatibilityDate: '2024-12-01'
    })
    const response = await worker.dispatchFetch('https://worker.test/')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ value: 40, result: 42 })
  } finally {
    await worker?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
