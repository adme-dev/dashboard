import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { compactSsrMarkupSource, compactSsrMarkupDirectory, compactPublicAssetsPlugin } from '../../scripts/compact-worker-static-data.mjs'

const directories: string[] = []
async function directory() {
  const value = await mkdtemp(path.join(tmpdir(), 'worker-static-data-'))
  directories.push(value)
  return value
}
async function evaluate(source: string) {
  const file = path.join(await directory(), 'value.mjs')
  await writeFile(file, source)
  return import(pathToFileURL(file).href)
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(value => rm(value, { recursive: true, force: true })))
})
const html = '<section class="text-muted"><h1>Fantasy Limo — Melbourne 🚘</h1><p>&lt;draft&gt;\r\n</p></section>'.repeat(80)

const metadata = () => Object.fromEntries(Array.from({ length: 100 }, (_, index) => [
  `/_nuxt/route-${index}.js`,
  { type: 'text/javascript', etag: `"hash-${index}"`, mtime: '2026-09-22T00:00:00.000Z', size: index, path: `../_nuxt/route-${index}.js`, ...(index % 2 ? { encoding: null } : {}) }
]))

describe('lossless generated Worker data compaction', () => {
  it('shares compression across distinct static strings without changing their values', async () => {
    const values = Array.from({ length: 64 }, (_, index) => `<section class="campaign-summary"><h2>Campaign ${index}</h2><p>${'Stored campaign results &amp; reviewed work 🚘. '.repeat(12)}</p></section>`)
    const source = `export function render(push) { ${values.map(value => `push(${JSON.stringify(value)});`).join('')} }`
    const result = compactSsrMarkupSource(source)
    // Independent compression repeats the same dictionary for every paragraph.
    expect(Buffer.byteLength(result.code)).toBeLessThan(3500)
    const output: string[] = []
    ;(await evaluate(result.code)).render((value: string) => output.push(value))
    expect(output).toEqual(values)
    expect(compactSsrMarkupSource(result.code).code).toBe(result.code)
  })

  it.each([160, 400])('decodes bounded groups lazily and reuses them (%i repeats)', async (repeats) => {
    const values = Array.from({ length: 96 }, (_, index) => `<p data-row="${index}">${'Exact static text 🚘 &amp; \\r\\n '.repeat(repeats)}</p>`)
    const source = `export function item(index) { switch(index) { ${values.map((value, index) => `case ${index}: return String(${JSON.stringify(value)});`).join('')} } }`
    const root = await directory()
    const probe = path.join(root, 'probe.mjs')
    await writeFile(probe, `import { brotliDecompressSync as inflate } from 'node:zlib'; export const sizes = []; export function brotliDecompressSync(value) { const result = inflate(value); sizes.push(result.byteLength); return result; }`)
    const result = compactSsrMarkupSource(source)
    const module = await evaluate(result.code.replace('\'node:zlib\'', JSON.stringify(pathToFileURL(probe).href)))
    const { sizes } = await import(pathToFileURL(probe).href)
    expect(sizes).toEqual([])
    expect(module.item(0)).toBe(values[0])
    expect(module.item(1)).toBe(values[1])
    expect(sizes).toHaveLength(1)
    expect(module.item(0)).toBe(values[0])
    expect(sizes).toHaveLength(1)
    expect(module.item(values.length - 1)).toBe(values.at(-1))
    expect(sizes).toHaveLength(2)
    expect(sizes.every((size: number) => size <= 128 * 1024)).toBe(true)
    for (const index of [16, 15, 17, 94, 32, 31, 0]) expect(module.item(index)).toBe(values[index])
    expect(sizes.every((size: number) => size <= 128 * 1024)).toBe(true)
  })

  it('losslessly compacts repeated medium fragments with complete decoder overhead included', async () => {
    const fragment = '<span class="text-muted">Saved &amp; ready 🚘</span>'.repeat(8)
    expect(fragment.length).toBeLessThan(1024)
    const source = `export function render(push) { ${Array.from({ length: 12 }, () => `push(${JSON.stringify(fragment)});`).join('')} }`
    const result = compactSsrMarkupSource(source)
    expect(result.literals).toBe(12)
    expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source))
    const output: string[] = []
    ;(await evaluate(result.code)).render((value: string) => output.push(value))
    expect(output).toEqual(Array(12).fill(fragment))
    expect(compactSsrMarkupSource(result.code).code).toBe(result.code)
  })

  it('preserves complete static markup, interpolation order and named functions', async () => {
    const source = `export function render(push, next) { push(${JSON.stringify(html)}); push(next()); push(${JSON.stringify(html)}); }`
    const result = compactSsrMarkupSource(source)
    expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source) / 2)
    expect(result.literals).toBe(2)
    const module = await evaluate(result.code)
    for (let repeat = 0; repeat < 2; repeat++) {
      const output: string[] = []
      module.render((value: string) => output.push(value), () => {
        expect(output).toEqual([html])
        return '<span>escaped &amp; dynamic</span>'
      })
      expect(output.join('')).toBe(`${html}<span>escaped &amp; dynamic</span>${html}`)
    }
    expect(module.render.name).toBe('render')
    expect(compactSsrMarkupSource(result.code).code).toBe(result.code)
  })

  it('preserves HTML data properties, prototypes and ordinary mutable descriptors', async () => {
    const source = `export const data = { html: ${JSON.stringify(html)}, nested: { preview: ${JSON.stringify(html)} }, __proto__: ${JSON.stringify(html)} };`
    const result = compactSsrMarkupSource(source)
    expect(result.literals).toBe(3)
    const { data } = await evaluate(result.code)
    expect(data).toEqual({ html, nested: { preview: html } })
    expect(Object.getPrototypeOf(data)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(data, 'html')).toEqual({ value: html, writable: true, enumerable: true, configurable: true })
    data.html = 'edited preview'
    expect(data.html).toBe('edited preview')
    expect(data.nested.preview).toBe(html)
  })

  it('preserves cooked no-substitution templates and avoids shadowed names', async () => {
    const value = '<p>cooked\nline\t\\backslash ` ${literal} \u0000 \u2028</p>'.repeat(80)
    const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
    const source = `const __xfStatic0 = 10; const Buffer = false; export function render(push) { push(\`${escaped}\`); return __xfStatic0 + Number(Buffer); }`
    const result = compactSsrMarkupSource(source)
    expect(result.literals).toBe(1)
    const output: string[] = []
    expect((await evaluate(result.code)).render((text: string) => output.push(text))).toBe(10)
    expect(output).toEqual([value])
  })

  it('leaves tags, directives, keys, dynamic templates and malformed Unicode untouched', () => {
    const cases = [
      `export const x = String.raw\`${html}\`;`,
      `export const x = { ${JSON.stringify(html)}: 1 };`,
      `export const x = tag\`head ${html}\${value}\`;`,
      `export function x(push) { push(\`head ${html}\${value}\`); }`,
      `export function x(push) { push(${JSON.stringify(`${html}\uD800`)}); }`,
      `export const x = new String(${JSON.stringify(html)});`,
      'export function x(push) { push("<p>short</p>"); }'
    ]
    for (const source of cases) expect(compactSsrMarkupSource(source)).toMatchObject({ code: source, literals: 0 })
  })

  it('only compacts generated SSR chunks and is byte-stable on a second pass', async () => {
    const root = await directory()
    const build = path.join(root, 'chunks/build')
    const route = path.join(root, 'chunks/routes')
    await mkdir(build, { recursive: true })
    await mkdir(route, { recursive: true })
    const source = `export default push => push(${JSON.stringify(html)})`
    await writeFile(path.join(build, 'page.mjs'), source)
    await writeFile(path.join(route, 'api.mjs'), source)
    await writeFile(path.join(build, 'page.mjs.map'), 'unchanged-map')
    expect(await compactSsrMarkupDirectory(root)).toMatchObject({ changedFiles: 1, literals: 1 })
    expect(await readFile(path.join(route, 'api.mjs'), 'utf8')).toBe(source)
    expect(await readFile(path.join(build, 'page.mjs.map'), 'utf8')).toBe('unchanged-map')
    expect(await compactSsrMarkupDirectory(root)).toMatchObject({ changedFiles: 0, literals: 0, savedBytes: 0 })
  })

  it('preserves every public asset field and the exact default export contract', async () => {
    const assets = metadata()
    const source = `export default ${JSON.stringify(assets, null, 2)};`
    const result = compactPublicAssetsPlugin().transform(source, '\0virtual:#nitro-internal-virtual/public-assets-data')
    expect(result).not.toBeNull()
    expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source) / 2)
    expect((await evaluate(result.code)).default).toEqual(assets)
    expect(compactPublicAssetsPlugin().transform(source, '/app/public-assets-data-lookalike.mjs')).toBeNull()
  })

  it.each([
    'export default (() => ({}))();',
    'export default {}; export const unrelated = true;',
    'export default {"/asset":{"__proto__":null}};',
    'export default {"/asset":{"type":"text/plain","etag":"x","mtime":"x","size":1,"path":"x","unknown":true}};'
  ])('fails closed when the Nitro asset module contract changes', (source) => {
    expect(() => compactPublicAssetsPlugin().transform(source, '\0virtual:#nitro-internal-virtual/public-assets-data')).toThrow()
  })
})
it('losslessly compacts medium SSR literals and keeps the complete decoder cost smaller', async () => {
  const markup = '<p>preserved 🚘 &amp;\r\n</p>'.repeat(25)
  expect(markup.length).toBeGreaterThanOrEqual(256)
  expect(markup.length).toBeLessThan(1024)
  const source = `export const data = { first: ${JSON.stringify(markup)}, second: ${JSON.stringify(markup)} };`
  const compacted = compactSsrMarkupSource(source)
  expect(compacted.literals).toBe(2)
  expect(Buffer.byteLength(compacted.code)).toBeLessThan(Buffer.byteLength(source))
  expect((await evaluate(compacted.code)).data).toEqual({ first: markup, second: markup })
  expect(compactSsrMarkupSource(compacted.code).code).toBe(compacted.code)
})
it('retains literals below 128 characters even when repeated', () => {
  const markup = `<p>${'x'.repeat(120)}</p>`
  expect(markup.length).toBe(127)
  const source = `export const data = { a: ${JSON.stringify(markup)}, b: ${JSON.stringify(markup)}, c: ${JSON.stringify(markup)} };`
  expect(compactSsrMarkupSource(source)).toEqual({ code: source, literals: 0 })
})
it('preserves medium SSR property values when compression saves bytes', async () => {
  const markup = '<p>preserved</p>'.repeat(45)
  expect(markup.length).toBeLessThan(1024)
  const source = `export const data = { first: ${JSON.stringify(markup)}, second: ${JSON.stringify(markup)} };`
  const result = compactSsrMarkupSource(source)
  expect(result.literals).toBe(2)
  expect(Buffer.byteLength(result.code)).toBeLessThan(Buffer.byteLength(source))
  expect((await evaluate(result.code)).data).toEqual({ first: markup, second: markup })
})
