import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { compactSsrMarkupDirectory, compactStaticTextDataDirectory, compactStaticTextDataSource } from '../../scripts/compact-worker-static-data.mjs'

const execFileAsync = promisify(execFile)
const directories: string[] = []
async function directory() {
  const value = await mkdtemp(path.join(tmpdir(), 'worker-static-text-'))
  directories.push(value)
  return value
}
async function evaluate(source: string, name = 'value.mjs') {
  const file = path.join(await directory(), name)
  await writeFile(file, source)
  return import(pathToFileURL(file).href)
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(value => rm(value, { recursive: true, force: true })))
})

// Tool and feature copy: Unicode, escapes and line separators must survive exactly.
const prose = (index: number) => `Tool ${index} — reviews campaign pacing for “Fantasy Limo” 🚘, quoting \\"budgets\\" and 'notes'.\r\n\tLine\u2028separator \\u0000 \u0000 ${'Stored descriptions explain exactly what the marketing tool reads and proposes. '.repeat(3)}`
const icons = JSON.stringify([{ prefix: 'lucide', icons: Object.fromEntries(Array.from({ length: 120 }, (_, index) => [`icon-${index}`, { width: 24, height: 24, body: `<path fill="none" stroke="currentColor" d="M${index} 4h16v16H4z"/>` }])) }])

describe('lossless static text data compaction', () => {
  it('encodes description/content values, describe() text and JSON.parse input with exact values', async () => {
    const values = Array.from({ length: 24 }, (_, index) => prose(index))
    const source = `const z = { string: () => ({ describe(text) { return { text }; } }) };
export const tools = [${values.slice(0, 8).map((value, index) => `{ name: "tool_${index}", description: ${JSON.stringify(value)} }`).join(',')}];
export const features = { details: [${values.slice(8, 16).map(value => `{ title: "Short", "content": ${JSON.stringify(value)} }`).join(',')}] };
export const schema = [${values.slice(16).map(value => `z.string().describe(${JSON.stringify(value)})`).join(',')}];
export function collections() { return JSON.parse(${JSON.stringify(icons)}); }`
    const result = compactStaticTextDataSource(source)
    expect(result.literals).toBe(25)
    expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source) / 2)
    const module = await evaluate(result.code)
    const original = await evaluate(source, 'original.mjs')
    expect(module.tools).toEqual(original.tools)
    expect(module.features).toEqual(original.features)
    expect(module.schema).toEqual(original.schema)
    expect(module.collections()).toEqual(JSON.parse(icons))
    expect(module.tools.map((tool: { description: string }) => tool.description)).toEqual(values.slice(0, 8))
    expect(Object.getOwnPropertyDescriptor(module.tools[0], 'description')).toEqual({ value: values[0], writable: true, enumerable: true, configurable: true })
    expect(Object.keys(module.features.details[0])).toEqual(['title', 'content'])
    expect(compactStaticTextDataSource(result.code)).toEqual({ code: result.code, literals: 0 })
  })

  it('preserves cooked no-substitution templates and avoids shadowed names', async () => {
    const value = `cooked\nline\t\\backslash \` \${literal} \u0000 \u2028 ${prose(1)}`.repeat(4)
    // Escape CR too: template cooking would otherwise normalize a raw CRLF.
    const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${').replace(/\r/g, '\\r')
    const source = `const __xfStatic0 = 10; const Buffer = false; export const tool = { description: \`${escaped}\` }; export const sum = __xfStatic0 + Number(Buffer);`
    const result = compactStaticTextDataSource(source)
    expect(result.literals).toBe(1)
    const module = await evaluate(result.code)
    expect(module.tool.description).toBe(value)
    expect(module.tool.description).toBe((await evaluate(source, 'original.mjs')).tool.description)
    expect(module.sum).toBe(10)
  })

  it('keeps surrounding evaluation order, reviver calls and property order', async () => {
    const value = prose(7).repeat(3)
    const source = `export const log = [];
const step = (id) => (log.push(id), id);
export const tool = { first: step(1), description: ${JSON.stringify(value)}, last: step(2) };
export const parsed = JSON.parse(${JSON.stringify(icons)}, (key, item) => (key === 'width' && log.push('reviver'), item));`
    const result = compactStaticTextDataSource(source)
    expect(result.literals).toBe(2)
    const module = await evaluate(result.code)
    const original = await evaluate(source, 'original.mjs')
    expect(module.log).toEqual(original.log)
    expect(module.log.slice(0, 2)).toEqual([1, 2])
    expect(Object.keys(module.tool)).toEqual(['first', 'description', 'last'])
    expect(module.tool.description).toBe(value)
    expect(module.parsed).toEqual(original.parsed)
  })

  it('serves early calls from an import cycle before the module body runs', async () => {
    const root = await directory()
    const value = prose(3).repeat(3)
    const toolSource = `import './peer.mjs';
export function describeTool() { return { description: ${JSON.stringify(value)} }; }`
    const result = compactStaticTextDataSource(toolSource)
    expect(result.literals).toBe(1)
    await writeFile(path.join(root, 'tool.mjs'), result.code)
    await writeFile(path.join(root, 'peer.mjs'), `import { describeTool } from './tool.mjs'; export const early = describeTool();`)
    // Vitest's module runner does not reproduce native ESM cycle TDZ; use Node.
    const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '-e',
      `const peer = await import(${JSON.stringify(pathToFileURL(path.join(root, 'tool.mjs')).href)}).then(() => import(${JSON.stringify(pathToFileURL(path.join(root, 'peer.mjs')).href)})); process.stdout.write(JSON.stringify(peer.early))`])
    expect(JSON.parse(stdout)).toEqual({ description: value })
  })

  it('decodes lazily, once per bounded group', async () => {
    const values = Array.from({ length: 40 }, (_, index) => prose(index).repeat(4))
    const source = `export function tool(index) { switch (index) { ${values.map((value, index) => `case ${index}: return { description: ${JSON.stringify(value)} };`).join('')} } }`
    const root = await directory()
    const probe = path.join(root, 'probe.mjs')
    await writeFile(probe, `import { brotliDecompressSync as inflate } from 'node:zlib'; export const sizes = []; export function brotliDecompressSync(value) { const result = inflate(value); sizes.push(result.byteLength); return result; }`)
    const result = compactStaticTextDataSource(source)
    expect(result.literals).toBe(40)
    const module = await evaluate(result.code.replace('\'node:zlib\'', JSON.stringify(pathToFileURL(probe).href)))
    const { sizes } = await import(pathToFileURL(probe).href)
    expect(sizes).toEqual([])
    expect(module.tool(0).description).toBe(values[0])
    expect(module.tool(15).description).toBe(values[15])
    expect(sizes).toHaveLength(1)
    expect(module.tool(16).description).toBe(values[16])
    expect(sizes).toHaveLength(2)
    for (const index of [39, 0, 17, 32, 31]) expect(module.tool(index).description).toBe(values[index])
    expect(sizes).toHaveLength(3)
    expect(sizes.every((size: number) => size <= 128 * 1024)).toBe(true)
  })

  it('leaves executable source, keys, directives, other properties, dynamic templates and malformed Unicode untouched', () => {
    const value = JSON.stringify(prose(2).repeat(4))
    const cases = [
      `export const x = { title: ${value}, class: ${value}, statusMessage: ${value}, message: ${value} };`,
      `export const x = { ["description"]: ${value} };`,
      `export const x = { [${value}]: 1, description: 1 };`,
      `export class X { description = ${value}; static content = ${value}; }`,
      `export const x = { get description() { return ${value}; } };`,
      `export const x = { description: tag\`${prose(2).repeat(4)}\` };`,
      `export const x = { description: \`${prose(2).repeat(4).replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\${value}\` };`,
      `export const x = { description: ${value} + suffix };`,
      `export const x = { description: ${JSON.stringify(`${prose(2).repeat(4)}\uD800`)} };`,
      `export const x = { description: "Reads pacing." };`,
      `export const x = eval(${value});`,
      `export const x = Function(${value});`,
      `export const x = new Function(${value});`,
      `export const x = setTimeout(${value});`,
      `export const x = import(${value});`,
      `export const x = schema.parse(${value});`,
      `export const x = JSON["parse"](${value});`,
      `export const x = JSON.parse(input, ${value});`,
      `export const x = z.string().describe(input, ${value});`,
      `export const x = new Intl.DisplayNames(${value});`,
      `${value};\nexport const x = 1;`,
      `export function x() { ${value}; return 1; }`
    ]
    for (const source of cases) expect(compactStaticTextDataSource(source)).toEqual({ code: source, literals: 0 })
  })

  it('scans generated server modules, shares the existing decoder and is byte-stable', async () => {
    const root = await directory()
    const files = {
      nitro: path.join(root, 'chunks/nitro/nitro.mjs'),
      route: path.join(root, 'chunks/routes/api/tools.get.mjs'),
      page: path.join(root, 'chunks/build/features.mjs'),
      entry: path.join(root, 'chunks/virtual/entry.mjs'),
      shared: path.join(root, 'chunks/_/library.mjs'),
      manifest: path.join(root, 'chunks/virtual/precomputed.mjs')
    }
    const html = `<section><p>${prose(4)}</p></section>`.repeat(4)
    const tool = (index: number) => `export const tools = [${Array.from({ length: 6 }, (_, item) => `{ description: ${JSON.stringify(prose(index * 10 + item))} }`).join(',')}];`
    const sources = {
      nitro: tool(1),
      route: tool(2),
      page: `export const page = { details: [{ content: ${JSON.stringify(prose(30).repeat(2))} }] }; export const render = push => push(${JSON.stringify(html)});`,
      entry: `export function init() { return JSON.parse(${JSON.stringify(icons)}); }`,
      shared: tool(4),
      manifest: `/* XEROFLOW_COMPACT_PRECOMPUTED */ ${tool(5)}`
    }
    for (const [key, file] of Object.entries(files)) {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, sources[key as keyof typeof sources])
    }
    await writeFile(`${files.nitro}.map`, 'unchanged-map')
    for (let index = 0; index < 4; index++) await writeFile(path.join(root, `chunks/build/markup-${index}.mjs`), `export const render = push => push(${JSON.stringify(html)});`)
    // The SSR pass runs first in wrap-worker and owns the shared helper.
    expect(await compactSsrMarkupDirectory(root)).toMatchObject({ changedFiles: 5, literals: 5 })
    const decoder = await readFile(path.join(root, 'chunks/static-data-decoder.mjs'), 'utf8')
    const result = await compactStaticTextDataDirectory(root)
    expect(result).toMatchObject({ changedFiles: 4, literals: 14 })
    expect(result.savedBytes).toBeGreaterThan(0)
    expect(await readFile(path.join(root, 'chunks/static-data-decoder.mjs'), 'utf8')).toBe(decoder)
    expect(await readFile(files.shared, 'utf8')).toBe(sources.shared)
    expect(await readFile(files.manifest, 'utf8')).toBe(sources.manifest)
    expect(await readFile(`${files.nitro}.map`, 'utf8')).toBe('unchanged-map')
    for (const key of ['nitro', 'route', 'page', 'entry'] as const) {
      const code = await readFile(files[key], 'utf8')
      expect(code).toContain('static-data-decoder.mjs')
      expect(code).toContain('XEROFLOW_STATIC_TEXT_DATA')
    }
    const entry = await import(pathToFileURL(files.entry).href)
    expect(entry.init()).toEqual(JSON.parse(icons))
    const page = await import(pathToFileURL(files.page).href)
    const output: string[] = []
    page.render((value: string) => output.push(value))
    expect(output).toEqual([html])
    expect(page.page.details[0].content).toBe(prose(30).repeat(2))
    const nitro = await import(pathToFileURL(files.nitro).href)
    expect(nitro.tools.map((item: { description: string }) => item.description)).toEqual(Array.from({ length: 6 }, (_, item) => prose(10 + item)))
    expect(await compactStaticTextDataDirectory(root)).toEqual({ changedFiles: 0, literals: 0, savedBytes: 0 })
  })
})
