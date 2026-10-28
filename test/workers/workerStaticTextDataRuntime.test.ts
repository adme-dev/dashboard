import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Miniflare } from 'miniflare'
import { expect, it } from 'vitest'
import { compactSsrMarkupDirectory, compactStaticTextDataDirectory } from '../../scripts/compact-worker-static-data.mjs'
import { compactDeployedWorkerModules, compactWorkerModuleFilenames } from '../../scripts/compact-worker-module.mjs'

it('serves identical descriptions, feature copy and icon JSON through actual Workers after full compaction', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'pages-static-text-runtime-'))
  let worker: Miniflare | undefined
  const description = (index: number) => `Tool ${index} — reads “Fantasy Limo” 🚘 pacing.\r\n\tQuotes \\"budgets\\" \u2028 \u0000 ${'It proposes reviewed marketing changes and never applies them silently. '.repeat(3)}`
  const tools = Array.from({ length: 20 }, (_, index) => ({ name: `tool_${index}`, description: description(index) }))
  const content = Array.from({ length: 6 }, (_, index) => `Feature ${index}: ${'Staff review drafts, approvals and immutable releases before publishing. '.repeat(4)}`)
  const icons = [{ prefix: 'lucide', icons: Object.fromEntries(Array.from({ length: 80 }, (_, index) => [`icon-${index}`, { width: 24, height: 24, body: `<path fill="none" d="M${index} 4h16v16H4z"/>` }])) }]
  const markup = '<section><h1>Fantasy 🚘</h1><p>&lt;Saved&gt;</p></section>'.repeat(20)
  try {
    const write = async (file: string, source: string) => {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
      await writeFile(path.join(directory, file), source)
    }
    // The peer reads tool metadata through an import cycle before nitro.mjs runs.
    await write('chunks/nitro/nitro.mjs', `import { early } from '../routes/peer.mjs';
export function listTools() { return [${tools.map(tool => `{ name: ${JSON.stringify(tool.name)}, description: ${JSON.stringify(tool.description)} }`).join(',')}]; }
export const cycle = () => early;`)
    await write('chunks/routes/peer.mjs', `import { listTools } from '../nitro/nitro.mjs'; export const early = listTools().slice(0, 2);`)
    await write('chunks/build/features.mjs', `export const details = [${content.map(text => `{ title: "Feature", content: ${JSON.stringify(text)} }`).join(',')}];
export const render = push => push(${JSON.stringify(markup)});`)
    for (let index = 0; index < 3; index++) await write(`chunks/build/page-${index}.mjs`, `export const render = push => push(${JSON.stringify(markup)});`)
    await write('chunks/virtual/entry.mjs', `let initialized = false; export function init(add) { if (initialized) return; const collections = JSON.parse(${JSON.stringify(JSON.stringify(icons))}); for (const collection of collections) for (const [name, data] of Object.entries(collection.icons)) add(collection.prefix + ':' + name, data); initialized = true; }`)
    const entry = path.join(directory, 'index.js')
    await writeFile(entry, `import { listTools, cycle } from './chunks/nitro/nitro.mjs';
import { details, render } from './chunks/build/features.mjs';
import { init } from './chunks/virtual/entry.mjs';
const added = {};
export default { fetch() {
  init((name, data) => { added[name] = data; }); init(() => { throw new Error('initialized twice'); });
  let html = ''; render(value => html += value);
  return Response.json({ tools: listTools(), early: cycle(), details, added, html });
} };`)
    expect(await compactSsrMarkupDirectory(directory)).toMatchObject({ changedFiles: 4 })
    expect(await compactStaticTextDataDirectory(directory)).toMatchObject({ changedFiles: 3, literals: 27 })
    await compactDeployedWorkerModules(directory)
    await compactWorkerModuleFilenames(directory)
    expect(await readFile(entry, 'utf8')).toContain('./chunks/m/')
    worker = new Miniflare({
      scriptPath: entry, modulesRoot: directory, modules: true,
      modulesRules: [{ type: 'ESModule', include: ['**/*.js', '**/*.mjs'] }],
      compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat']
    })
    for (let request = 0; request < 2; request++) {
      const response = await worker.dispatchFetch('https://worker.test/')
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        tools,
        early: tools.slice(0, 2),
        details: content.map(text => ({ title: 'Feature', content: text })),
        added: Object.fromEntries(Object.entries(icons[0].icons).map(([name, data]) => [`lucide:${name}`, data])),
        html: markup
      })
    }
  } finally {
    await worker?.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
