import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'
import { compactSsrMarkupDirectory, compactPublicAssetsPlugin } from '../../scripts/compact-worker-static-data.mjs'
import { compactDeployedWorkerModules, compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'

it('serves identical SSR bytes and metadata through actual Workers after the full compaction chain', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pages-static-runtime-'))
  let worker: Miniflare | undefined
  const markup = '<section><h1>Fantasy 🚘</h1><p>&lt;Saved draft&gt;\nLine two</p></section>'.repeat(100)
  const metadata = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [
    `/image-${i}.png`, { type: 'image/png', etag: `"${i}"`, mtime: '2026-09-22T00:00:00.000Z', size: 100 + i, path: `../image-${i}.png`, encoding: i % 2 ? null : 'br' }
  ]))
  try {
    const build = path.join(directory, 'chunks/build')
    await mkdir(build, { recursive: true })
    await writeFile(path.join(build, 'page.mjs'), `export const templates = { preview: ${JSON.stringify(markup)} }; export default function render(push) { push(${JSON.stringify(markup)}); }`)
    const assetSource = compactPublicAssetsPlugin().transform(`export default ${JSON.stringify(metadata)};`, '\0virtual:#nitro-internal-virtual/public-assets-data')
    expect(assetSource).not.toBeNull()
    await writeFile(path.join(build, 'assets.mjs'), assetSource.code)
    const entry = path.join(directory, 'index.js')
    await writeFile(entry, `import render, { templates } from './chunks/build/page.mjs';
import assets from './chunks/build/assets.mjs';
export default { fetch(request) {
  if (new URL(request.url).pathname === '/assets') return Response.json(assets);
  if (new URL(request.url).pathname === '/template') return new Response(templates.preview);
  let html = ''; render(value => html += value); return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
} };`)
    expect(await compactSsrMarkupDirectory(directory)).toMatchObject({ changedFiles: 1, literals: 2 })
    await compactDeployedWorkerModules(directory)
    await compactWorkerModuleFilenames(directory)
    expect((await readFile(entry, 'utf8'))).toContain('./chunks/m/')
    worker = new Miniflare({
      scriptPath: entry, modulesRoot: directory, modules: true,
      modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
      compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat']
    })
    for (let request = 0; request < 2; request++) {
      const response = await worker.dispatchFetch('https://worker.test/')
      expect(response.status).toBe(200)
      expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(markup))
    }
    expect(await (await worker.dispatchFetch('https://worker.test/template')).text()).toBe(markup)
    expect(await (await worker.dispatchFetch('https://worker.test/assets')).json()).toEqual(metadata)
  } finally {
    await worker?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
