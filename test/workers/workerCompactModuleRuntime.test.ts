import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { Miniflare } from 'miniflare'
import { compactDeployedWorkerModules, compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'
import { compactRouteSqlDirectory, compactSsrMarkupDirectory } from '../../scripts/compact-worker-static-data.mjs'

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

it('loads one shared SQL and SSR decoder in workerd after minification and filename rewriting', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pages-shared-sql-runtime-'))
  let worker: Miniflare | undefined
  try {
    const queries = Array.from({ length: 3 }, (_, i) => `SELECT ${i}, '🚘\\n' AS label\r\nFROM sites WHERE id=$1\n${'AND active=TRUE\n'.repeat(120)}FOR UPDATE`)
    const chunks = path.join(directory, 'chunks/routes/api/nested')
    await mkdir(chunks, { recursive: true })
    for (const [index, query] of queries.entries()) {
      await writeFile(path.join(chunks, `${index}.mjs`), `export const run = args => ({ query: ${JSON.stringify(query)}, args });`)
    }
    const markup = queries.map((_, i) => `<section>${i} 🚘 &amp; exact\r\n</section>`.repeat(100))
    const build = path.join(directory, 'chunks/build')
    await mkdir(build, { recursive: true })
    for (const [index, html] of markup.entries()) {
      await writeFile(path.join(build, `${index}.mjs`), `export function render(push, next) { push(${JSON.stringify(html)}); push(next()); push(${JSON.stringify(html)}); }`)
    }
    await compactSsrMarkupDirectory(directory)
    await compactRouteSqlDirectory(directory)
    expect(await readFile(path.join(directory, 'chunks/static-data-decoder.mjs'), 'utf8')).toContain('createStaticDecoder')
    const entry = path.join(directory, 'index.js')
    await writeFile(entry, `export default { async fetch(request) {
      const args = [new URL(request.url).searchParams.get('site')];
      const modules = await Promise.all([${queries.map((_, i) => `import('./chunks/routes/api/nested/${i}.mjs')`).join(',')}]);
      const views = await Promise.all([${queries.map((_, i) => `import('./chunks/build/${i}.mjs')`).join(',')}]);
      const html = views.map(view => { let output = ''; view.render(text => output += text, () => args[0]); return output; });
      return Response.json({ queries: modules.map(module => module.run(args)), html });
    } }`)
    await compactDeployedWorkerModules(path.join(directory, 'chunks'))
    await compactWorkerModuleFilenames(directory)
    worker = new Miniflare({
      scriptPath: entry, modulesRoot: directory, modules: true,
      modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
      compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat']
    })
    for (const site of ['site-a', 'site-b']) {
      const response = await worker.dispatchFetch(`https://worker.test/?site=${site}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ queries: queries.map(query => ({ query, args: [site] })), html: markup.map(html => html + site + html) })
    }
  } finally {
    await worker?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
