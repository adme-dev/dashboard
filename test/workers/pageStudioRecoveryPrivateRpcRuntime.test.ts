import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'
import { Miniflare, Response as LocalResponse } from 'miniflare'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { captureRecoveryRpc } from '../../server/utils/pageStudio/recoveryPrivateRpc'

let runtime: Miniflare, directory: string, outbound = 0
beforeAll(async () => {
  directory = await mkdtemp(path.resolve('.nuxt/recovery-rpc-'))
  const caller = path.join(directory, 'caller.mjs')
  const config = JSON.parse(await readFile('workers/page-studio-management/wrangler.production.jsonc', 'utf8'))
  await build({ bundle: true, format: 'esm', platform: 'neutral', target: 'esnext', logLevel: 'silent',
    outfile: caller, stdin: { resolveDir: process.cwd(), contents: `
      import { captureRecoveryRpc } from '${path.resolve('server/utils/pageStudio/recoveryPrivateRpc.ts')}';
      export default { async fetch(request, env) {
        const freshWrappers = env.AUTHORITY.echo !== env.AUTHORITY.echo;
        const capability = captureRecoveryRpc(env.AUTHORITY, 'echo');
        try {
          capability.assertCurrent();
          const result = await capability.call('exact-private-request');
          capability.assertCurrent();
          return Response.json({ freshWrappers, result });
        } catch { return Response.json({ freshWrappers, denied: true }, { status: 409 }); }
      } }`
    } })
  const deny = () => {
    outbound++
    return new LocalResponse(null, { status: 500 })
  }
  runtime = new Miniflare({ workers: [
    { name: 'caller', modules: true, scriptPath: caller, compatibilityDate: config.compatibility_date,
      serviceBindings: { AUTHORITY: { name: 'authority', entrypoint: 'Authority' } }, outboundService: deny },
    { name: 'authority', modules: true, compatibilityDate: config.compatibility_date, outboundService: deny,
      script: `import { WorkerEntrypoint } from 'cloudflare:workers';
        export class Authority extends WorkerEntrypoint { echo(value) { return { value, marker: this.env.MARKER }; } }
        export default { fetch() { return new Response(null, { status: 404 }); } };`,
      bindings: { MARKER: 'private-test' } }
  ] })
  await runtime.ready
}, 60000)
afterAll(async () => {
  await runtime?.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})

it('captures the real native RPC callable once despite fresh wrappers and retains its receiver', async () => {
  const response = await (await runtime.getWorker('caller')).fetch('https://private.invalid')
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ freshWrappers: true,
    result: { value: 'exact-private-request', marker: 'private-test' } })
  expect(outbound).toBe(0)
})
it('retains ordinary method receiver and rejects replacement without invoking it', async () => {
  const receiver = { value: 'original', echo() {
    return Promise.resolve(this.value)
  } }
  const capability = captureRecoveryRpc(receiver, 'echo')!
  expect(await capability.call()).toBe('original')
  receiver.echo = vi.fn()
  expect(() => capability.assertCurrent()).toThrow()
  expect(() => capability.call()).toThrow()
  expect(receiver.echo).not.toHaveBeenCalled()
})
it('rejects own accessors before invoking them', () => {
  const getter = vi.fn(() => vi.fn())
  const receiver = Object.defineProperty({}, 'echo', { get: getter })
  expect(() => captureRecoveryRpc(receiver, 'echo')).toThrow()
  expect(getter).not.toHaveBeenCalled()
})
it('rejects a new own shadow of a native-style callable', () => {
  const receiver = new Proxy({} as Record<string, unknown>, {
    get: () => () => Promise.resolve('original')
  })
  const capability = captureRecoveryRpc(receiver, 'echo')!
  Object.defineProperty(receiver, 'echo', { value: vi.fn(), configurable: true })
  expect(() => capability.assertCurrent()).toThrow()
})
it('rejects descriptor drift and reports missing methods without inventing a fallback', () => {
  const receiver = { echo: () => Promise.resolve('original') }
  const capability = captureRecoveryRpc(receiver, 'echo')!
  Object.defineProperty(receiver, 'echo', { writable: false })
  expect(() => capability.assertCurrent()).toThrow()
  expect(captureRecoveryRpc(undefined, 'echo')).toBeNull()
  expect(captureRecoveryRpc({}, 'echo')).toBeNull()
})
