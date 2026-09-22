import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { workerProcessCompatibilityPlugin } from '../../scripts/worker-process-compatibility.mjs'

const require = createRequire(import.meta.url)
const nitroRequire = createRequire(require.resolve('nitropack/package.json'))
const sourcePath = path.join(path.dirname(nitroRequire.resolve('unenv/package.json')), 'dist/runtime/polyfill/process.mjs')
const source = readFileSync(sourcePath, 'utf8')
function load(code: string, original: unknown, fallback: unknown) {
  const executable = code.replace('import processModule from "node:process";', '').replace('export default globalThis.process;', 'globalThis.process;')
  return runInNewContext(executable, { processModule: fallback, globalThis: { process: original } })
}
class ProcessWithPrivateGetters {
  #stream = { write: () => true }
  env = { PRESERVED: 'value' }
  get stderr() { return this.#stream }
}

describe('Worker process proxy compatibility', () => {
  it('reproduces the installed upstream fallback getter failure', () => {
    const result = load(source, { env: {} }, new ProcessWithPrivateGetters())
    expect(() => result.stderr).toThrow(/private member/)
  })
  it('uses the fallback instance as the receiver for its private getters', () => {
    const fallback = new ProcessWithPrivateGetters()
    const original = { env: { LIVE: 'present' } }
    const fixed = workerProcessCompatibilityPlugin().transform(source, sourcePath)
    expect(fixed).not.toBeNull()
    const result = load(fixed.code, original, fallback)
    expect(result.stderr).toBe(fallback.stderr)
    expect(result.env).toBe(original.env)
    result.env.LIVE = 'changed'
    expect(original.env.LIVE).toBe('changed')
  })
  it('uses an existing process as the receiver for its private getters', () => {
    const original = new ProcessWithPrivateGetters()
    const result = load(workerProcessCompatibilityPlugin().transform(source, sourcePath).code, original, {})
    expect(result.stderr).toBe(original.stderr)
    expect(result.env).toBe(original.env)
  })
  it('retains fallback-only operation when there is no existing process', () => {
    const fallback = new ProcessWithPrivateGetters()
    expect(load(workerProcessCompatibilityPlugin().transform(source, sourcePath).code, undefined, fallback)).toBe(fallback)
  })
  it('ignores application lookalikes and fails closed on an upstream implementation change', () => {
    const plugin = workerProcessCompatibilityPlugin()
    expect(plugin.transform(source, '/app/process.mjs')).toBeNull()
    expect(() => plugin.transform('export default {};', sourcePath)).toThrow(/review/)
  })
})
