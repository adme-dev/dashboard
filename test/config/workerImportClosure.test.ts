import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkWorkerImports } from '../../scripts/check-worker-imports.mjs'

const directories: string[] = []
async function artifact(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'worker-import-closure-'))
  directories.push(root)
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await writeFile(path.join(root, name), contents)
  }
  return root
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('deployed Worker import closure', () => {
  it.each([
    'import { PNG } from "pngjs";',
    'import "pngjs";',
    'export { PNG } from "pngjs";',
    'export * from "pngjs";',
    'export * as codec from "pngjs";'
  ])('rejects a static bare dependency: %s', async (source) => {
    const root = await artifact({ 'index.js': 'export default {}', 'chunks/codec.js': source })
    const result = await checkWorkerImports(root)
    expect(result.errors).toContainEqual(expect.objectContaining({ file: 'chunks/codec.js', specifier: 'pngjs', reason: 'unresolved bare import' }))
  })

  it('accepts cyclic relative imports, reexports and platform modules without scanning comments or strings', async () => {
    const root = await artifact({
      'index.js': 'import "./chunk.mjs"; export * from "./chunk.mjs"; import "node:buffer"; import "cloudflare:workers"; const s = \'import "pngjs"\'; /* import "missing" */',
      'chunk.mjs': 'import "./index.js"; export const value = 1;'
    })
    expect((await checkWorkerImports(root)).errors).toEqual([])
  })

  it.each(['import "./missing.js"', 'export * from "./missing.js"', 'import("./missing.js")', 'import "../outside.js"'])('rejects absent or escaping relative modules: %s', async (source) => {
    const root = await artifact({ 'index.js': source })
    expect((await checkWorkerImports(root)).errors).toHaveLength(1)
  })

  it('allows only the bounded deferred optional dependencies, never their static imports', async () => {
    const root = await artifact({ 'index.js': 'export async function optional() { return import("@react-email/render") }' })
    const result = await checkWorkerImports(root)
    expect(result.errors).toEqual([])
    expect(result.deferredOptionalImports).toHaveLength(1)
    await writeFile(path.join(root, 'index.js'), 'import "@react-email/render"')
    expect((await checkWorkerImports(root)).errors).toHaveLength(1)
    await writeFile(path.join(root, 'index.js'), 'import("@react-email/render"); import("@react-email/render")')
    expect((await checkWorkerImports(root)).errors).toContainEqual(expect.objectContaining({ reason: 'optional dynamic import count exceeds reviewed bound (1)' }))
  })

  it.each(['import("pngjs")', 'import("gifenc")', 'import("new-optional-package")', 'import(name)', 'import("https://example.com/module.js")'])('fails closed on unreviewed dependencies: %s', async (source) => {
    const root = await artifact({ 'index.js': source })
    expect((await checkWorkerImports(root)).errors).toHaveLength(1)
  })

  it('requires a real entry file and does not guess extensions', async () => {
    const root = await artifact({ 'chunk.js': 'export {}' })
    await expect(checkWorkerImports(root)).rejects.toThrow(/index.js/)
    await writeFile(path.join(root, 'index.js'), 'import "./chunk"')
    expect((await checkWorkerImports(root)).errors).toHaveLength(1)
  })

  it.each([
    ['free require', 'export function load() { return require("pngjs") }'],
    ['non-literal free require', 'export function load(name) { return require(name) }'],
    ['createRequire binding', 'import { createRequire as e } from "node:module"; const t = e(import.meta.url); export function load() { return t("pngjs") }'],
    ['inline createRequire', 'import { createRequire } from "node:module"; export function load() { return createRequire("/")("pngjs") }'],
    ['module namespace createRequire', 'import * as m from "node:module"; const r = m.createRequire("/"); export function load() { return r("pngjs") }'],
    ['esbuild __require helper', 'var L = (e => typeof require < "u" ? require : e)(function (e) { if (typeof require < "u") return require.apply(this, arguments); throw Error(\'Dynamic require of "\' + e + \'" is not supported\') }); export const codec = L("pngjs")'],
    ['Rollup commonjsRequire helper', 'function c(e) { throw new Error(\'Could not dynamically require "\' + e + \'"\') } export function load() { return c("pngjs") }'],
    ['require shadowed only in a sibling block', 'if (false) { const require = x => x; } require("pngjs");'],
    ['require shadowed only by a for-of binding', 'for (const require of []) require("x"); require("pngjs")'],
    ['require shadowed only by a catch parameter', 'try {} catch (require) { require("x") } require("pngjs")'],
    ['require shadowed only in a switch', 'switch (a) { case 1: const require = g; require("x") } require("pngjs")'],
    ['require shadowed only by a block function', '{ function require() {} } require("pngjs")'],
    ['require shadowed only by another method parameter', 'class A { m(require) { return require("x") } n() { return require("pngjs") } }']
  ])('rejects CommonJS requires left unbundled: %s', async (_name, source) => {
    const root = await artifact({ 'index.js': 'export default {}', 'chunks/codec.js': source })
    const result = await checkWorkerImports(root)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ file: 'chunks/codec.js', reason: expect.stringMatching(/(unbundled|non-literal) .*(require|createRequire)/i) })
  })

  it('does not treat bundled CommonJS wrappers, shadowed requires or platform requires as unresolved', async () => {
    const root = await artifact({
      'index.js': [
        'var L = (e => typeof require < "u" ? require : e)(function (e) { if (typeof require < "u") return require.apply(this, arguments); throw Error(\'Dynamic require of "\' + e + \'" is not supported\') });',
        'export const zlib = L("node:zlib");',
        'function requirePngSync() { return {} } const r = requirePngSync();',
        'export function webpack(module, exports, require) { return require(12) }',
        'export function local() { var require = () => 1; return require("pngjs") }',
        'export function hoisted(a) { if (a) { var require = () => 1 } return require("pngjs") }',
        'export function block() { { let require = () => 1; return require("pngjs") } }',
        'import { createRequire as e } from "node:module"; export function reused(e) { return e("pngjs") }',
        'export const text = \'require("pngjs")\'; export const resolved = typeof require < "u" && require.resolve;'
      ].join('\n')
    })
    expect((await checkWorkerImports(root)).errors).toEqual([])
  })

  it('bounds the reviewed node-postgres pg-native require', async () => {
    const native = 'function n() { try { return require("pg-native") } catch (e) { throw e } }'
    const root = await artifact({ 'index.js': native })
    const result = await checkWorkerImports(root)
    expect(result.errors).toEqual([])
    expect(result.deferredOptionalImports).toEqual([{ file: 'index.js', specifier: 'pg-native', kind: 'CommonJS require' }])
    await writeFile(path.join(root, 'chunk.js'), native)
    expect((await checkWorkerImports(root)).errors).toEqual([expect.objectContaining({ specifier: 'pg-native', reason: 'optional require count exceeds reviewed bound (1)' })])
  })

  it.each(['data.wasm', 'data.json', 'data.cjs'])('rejects relative targets Wrangler does not upload as ES modules: %s', async (target) => {
    const root = await artifact({ 'index.js': `import "./${target}"`, [target]: 'export {}' })
    expect((await checkWorkerImports(root)).errors).toEqual([expect.objectContaining({ specifier: `./${target}`, reason: 'relative import target is not an uploaded .js/.mjs module' })])
  })

  it('keeps the real PNG codec bundled and checks imports before the immutable size gate', async () => {
    const config = await readFile(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    expect(config.match(/external: \[([^\]]+)\]/)?.[1]).not.toContain('\'pngjs\'')
    expect(config.match(/inline: \[([^\]]+)\]/)?.[1]).toContain('\'pngjs\'')
    const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'))
    expect(pkg.scripts.build).toContain('node scripts/wrap-worker.mjs && node scripts/check-worker-imports.mjs && node scripts/check-worker-size.mjs')
    expect(pkg.scripts.build).toContain('node scripts/check-worker-size.mjs && pnpm check:worker-startup')
    // The startup gate must start the artifact this build produced.
    const startup = await readFile(new URL('../workers/builtWorkerStartup.test.ts', import.meta.url), 'utf8')
    expect(startup).toContain('const artifactRoot = path.join(repositoryRoot, \'dist/_worker.js\')')
    expect(pkg.scripts['check:worker-startup']).not.toMatch(/WORKER_ARTIFACT_DIR/)
  })
})
