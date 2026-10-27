import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const harness = `
import { NativeCanary, NativeCanaryControl } from './worker';
export { NativeCanaryControl };
export class ProofCanary extends NativeCanary {
  async executeContainer(record) {
    if ((await this.status()).state !== 'consumed') throw new Error('not-consumed-before-start');
    if (this.env.MODE === 'before-start') throw new Error('crash-before-start');
    await this.ctx.storage.put('starts', (await this.ctx.storage.get('starts') || 0) + 1);
    if (this.env.MODE === 'lost-ack') throw new Error('lost-ack');
    return { syntheticTransportOnly: true };
  }
  async destroyContainer() {}
  async starts() { return await this.ctx.storage.get('starts') || 0; }
  async stopForTest() { return this.alarm(); }
  async bypassForTest() { return super.executeContainer({}, null); }
}
export default { async fetch(request, env) {
  const { action, args = [] } = await request.json();
  try {
    const stub = env.NATIVE_CANARY.getByName(action === 'wrong-name' ? 'wrong' : 'banner-native-canary-once-v1');
    let result;
    if (action === 'run') result = await env.CONTROL.run(...args);
    else if (action === 'stop') result = await stub.stopForTest();
    else if (action === 'count') result = await stub.starts();
    else if (action === 'bypass') result = await stub.bypassForTest();
    else result = await stub.status();
    return Response.json(result ?? null);
  } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
}};
`
const instances: Miniflare[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(instances.splice(0).map(instance => instance.dispose()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(mode = 'success', enabled = true) {
  const directory = await mkdtemp(join(tmpdir(), 'banner-native-canary-test-'))
  directories.push(directory)
  const bundle = await build({ stdin: { contents: harness, resolveDir: resolve('workers/banner-engine/canary'),
    loader: 'ts', sourcefile: 'test-harness.ts' }, bundle: true, format: 'esm', platform: 'browser',
  external: ['cloudflare:workers'], write: false })
  const start = () => {
    const mf = new Miniflare({ modules: true, name: 'canary-proof', script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-07-01', durableObjectsPersist: directory,
      durableObjects: { NATIVE_CANARY: { className: 'ProofCanary', useSQLite: true } },
      serviceBindings: { CONTROL: { name: 'canary-proof', entrypoint: 'NativeCanaryControl' } },
      bindings: { BANNER_NATIVE_CANARY_ENABLED: enabled ? 'true' : 'false', MODE: mode,
        BANNER_NATIVE_CANARY_PACKAGE_SHA256: 'a'.repeat(64),
        BANNER_NATIVE_CANARY_OUTER_IMAGE: `registry.cloudflare.com/${'b'.repeat(32)}/banner-engine-native-canary@sha256:${'c'.repeat(64)}` }
    })
    instances.push(mf)
    return mf
  }
  let runtime = start()
  return {
    async call(action: string, args: unknown[] = []) {
      const response = await runtime.dispatchFetch('http://test/', { method: 'POST', body: JSON.stringify({ action, args }) })
      return { status: response.status, value: await response.json() }
    },
    async restart() {
      await runtime.dispose()
      instances.splice(instances.indexOf(runtime), 1)
      runtime = start()
    }
  }
}

describe('native canary actual Durable Object consumption', () => {
  it('concurrent RPC and runtime restart spend only one invocation', async () => {
    const proof = await fixture()
    await Promise.all([proof.call('run'), proof.call('run'), proof.call('run')])
    expect((await proof.call('run')).value).toMatchObject({ state: 'finished' })
    expect((await proof.call('count')).value).toBe(1)
    await proof.restart()
    expect((await proof.call('run')).value).toMatchObject({ state: 'finished' })
    expect((await proof.call('count')).value).toBe(1)
  }, 30000)
  it.each(['before-start', 'lost-ack'])('never restarts spent invocation after %s and runtime restart', async (mode) => {
    const proof = await fixture(mode)
    expect((await proof.call('run')).value).toMatchObject({ state: 'uncertain' })
    await proof.restart()
    expect((await proof.call('run')).value).toMatchObject({ state: 'uncertain' })
    expect((await proof.call('count')).value).toBe(mode === 'before-start' ? 0 : 1)
  }, 30000)
  it('rejects disabled admission, caller work, and another object identity', async () => {
    const proof = await fixture('success', false)
    expect((await proof.call('run')).status).toBe(409)
    expect((await proof.call('run', [{ command: 'foo' }])).status).toBe(409)
    expect((await proof.call('wrong-name')).status).toBe(409)
    expect((await proof.call('count')).value).toBe(0)
  }, 30000)
  it('alarm cannot release permanent consumption or rerun an uncertain job', async () => {
    const proof = await fixture('lost-ack')
    await proof.call('run')
    expect((await proof.call('stop')).status).toBe(200)
    await proof.restart()
    expect((await proof.call('run')).value).toMatchObject({ state: 'stopped', outerDestroyed: true })
    expect((await proof.call('count')).value).toBe(1)
  }, 30000)
  it('RPC cannot forge the private execution ticket and bypass consumption', async () => {
    const proof = await fixture()
    expect((await proof.call('bypass')).value).toEqual({ error: 'canary-private-execution' })
    expect((await proof.call('count')).value).toBe(0)
  }, 30000)
  it('production HTTP entrypoint has no invocation route', async () => {
    const bundle = await build({ entryPoints: [resolve('workers/banner-engine/canary/worker.ts')],
      bundle: true, format: 'esm', platform: 'browser', external: ['cloudflare:workers'], write: false })
    const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0]!.text, compatibilityDate: '2026-07-01' })
    instances.push(runtime)
    for (const path of ['/', '/run', '/ready']) {
      expect((await runtime.dispatchFetch(`http://test${path}`, { method: 'POST' })).status).toBe(404)
    }
  }, 30000)
})
