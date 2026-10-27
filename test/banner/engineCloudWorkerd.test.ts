import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'
import { afterEach, describe, expect, it } from 'vitest'

const hash = (value: string) => `sha256:${value.repeat(64)}`
const generation = { generationId: 'generation-1', bootId: 'boot-1', outerImageDigest: hash('a'), innerImageDigest: hash('b') }
const identity = { ...generation, jobId: 'job-1', attemptId: 'attempt-1', capabilityId: 'photocraft', capabilityDigest: hash('c'), payloadDigest: hash('d'), innerContainerId: 'inner-1' }
const evidence = {
  identity,
  authority: { status: 'succeeded', receiptDigest: hash('e') },
  native: { status: 'succeeded', receiptDigest: hash('f') },
  output: { status: 'accepted', receiptDigest: hash('1') },
  cleanup: { innerTerminated: true, scratchRemoved: true, deliveryFenced: true, receiptDigest: hash('2') }
}

// Test-only HTTP dispatcher and synthetic adapter. Production has no HTTP RPC route.
// Both the controller and fake transport ledger use actual workerd SQLite DO storage.
const harness = `
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers';
import { CloudExecutionObject, CloudExecutionControl, UnconfiguredCloudAdapter } from './worker';
import { AGGREGATE_NAME } from './contracts';
import { CloudExecutionController } from './controller';
export { CloudExecutionObject, CloudExecutionControl, UnconfiguredCloudAdapter };
export class FaultControl extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.fault = null;
    this.control = new CloudExecutionController({
      get: key => ctx.storage.get(key),
      transaction: body => ctx.storage.transaction(async tx => {
        const value = await body(tx);
        if (this.fault === 'commit') throw new Error('injected-rollback');
        return value;
      }),
      sync: async () => { await ctx.storage.sync(); if (this.fault === 'after-commit') throw new Error('injected-post-commit-crash'); }
    }, env.BANNER_ENGINE_ADAPTER, true);
  }
  configureFault(fault) { this.fault = fault; }
  registerGeneration(...args) { return this.control.registerGeneration(...args); }
  execute(...args) { return this.control.execute(...args); }
  recordEvidence(...args) { return this.control.recordEvidence(...args); }
  readAttempt(...args) { return this.control.readAttempt(...args); }
  readSlot() { return this.control.readSlot(); }
}
export class ProofAdapter extends DurableObject {
  async authorize(identity) { return identity; }
  async verifyGeneration() { return true; }
  async verifyTermination() { return true; }
  async verifyEvidence() { return true; }
  async configure(mode) { await this.ctx.storage.put('mode', mode); }
  async forward(identity) {
    const recorded = await this.env.BANNER_ENGINE_CONTROL.getByName(AGGREGATE_NAME).readAttempt(identity.jobId, identity.attemptId);
    if (!recorded || recorded.state !== 'consumed') throw new Error('forward-before-consume');
    const count = await this.ctx.storage.get('count') || 0;
    await this.ctx.storage.put('count', count + 1);
    if (await this.ctx.storage.get('mode') === 'lost-ack') throw new Error('lost-ack');
    if (await this.ctx.storage.get('mode') === 'fail-outcome-write') await this.env.BANNER_ENGINE_CONTROL.getByName(AGGREGATE_NAME).configureFault('commit');
  }
  async count() { return await this.ctx.storage.get('count') || 0; }
}
export class ProofAdapterEntrypoint extends WorkerEntrypoint {
  stub() { return this.env.PROOF_ADAPTER.getByName('transport'); }
  authorize(value) { return this.stub().authorize(value); }
  verifyGeneration(value) { return this.stub().verifyGeneration(value); }
  verifyTermination(value) { return this.stub().verifyTermination(value); }
  verifyEvidence(value) { return this.stub().verifyEvidence(value); }
  forward(value) { return this.stub().forward(value); }
}
export default {
  async fetch(request, env) {
    const { action, args = [] } = await request.json();
    const stub = env.BANNER_ENGINE_CONTROL.getByName(AGGREGATE_NAME);
    try {
      let result;
      if (action === 'count') result = await env.PROOF_ADAPTER.getByName('transport').count();
      else if (action === 'mode') result = await env.PROOF_ADAPTER.getByName('transport').configure(...args);
      else if (action === 'wrong-object') result = await env.BANNER_ENGINE_CONTROL.getByName('wrong').readSlot();
      else if (action === 'configureFault') result = await stub.configureFault(...args);
      else if (['registerGeneration','execute','recordEvidence','readAttempt','readSlot'].includes(action)) result = await env.CONTROL_RPC[action](...args);
      else throw new Error('unknown-action');
      return Response.json(result ?? null);
    } catch (error) { return Response.json({ error: error.message }, { status: 409 }); }
  }
};
`

const instances: Miniflare[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(instances.splice(0).map(instance => instance.dispose()))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(options: { enabled?: boolean, faults?: boolean, unconfigured?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'engine-cloud-workerd-'))
  directories.push(directory)
  const bundle = await build({
    stdin: { contents: harness, resolveDir: resolve('workers/banner-engine/cloud'), sourcefile: 'proof-harness.ts', loader: 'ts' },
    bundle: true, format: 'esm', platform: 'browser', external: ['cloudflare:workers'], write: false
  })
  const start = () => {
    const mf = new Miniflare({
      name: 'cloud-proof', modules: true, script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-07-01', // Installed workerd is July 2026; production manifest is current.
      durableObjectsPersist: directory,
      bindings: { BANNER_ENGINE_CLOUD_ENABLED: options.enabled === false ? 'false' : 'true' },
      durableObjects: {
        BANNER_ENGINE_CONTROL: { className: options.faults ? 'FaultControl' : 'CloudExecutionObject', useSQLite: true },
        PROOF_ADAPTER: { className: 'ProofAdapter', useSQLite: true }
      },
      serviceBindings: {
        BANNER_ENGINE_ADAPTER: { name: 'cloud-proof', entrypoint: options.unconfigured ? 'UnconfiguredCloudAdapter' : 'ProofAdapterEntrypoint' },
        CONTROL_RPC: { name: 'cloud-proof', entrypoint: 'CloudExecutionControl' }
      }
    })
    instances.push(mf)
    return mf
  }
  let mf = start()
  return {
    async restart() {
      await mf.dispose()
      instances.splice(instances.indexOf(mf), 1)
      mf = start()
    },
    async call(action: string, ...args: unknown[]) {
      const response = await mf.dispatchFetch('http://local-proof/', { method: 'POST', body: JSON.stringify({ action, args }) })
      return { status: response.status, value: await response.json() }
    }
  }
}

describe('cloud controller in local workerd with SQLite Durable Objects', () => {
  it('the actual shipped worker exposes no public execution or evidence endpoint', async () => {
    const bundle = await build({ entryPoints: ['workers/banner-engine/cloud/worker.ts'], bundle: true, format: 'esm', platform: 'browser', external: ['cloudflare:workers'], write: false })
    const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0]!.text, compatibilityDate: '2026-07-01' })
    instances.push(mf)
    for (const path of ['/execute', '/registerGeneration', '/recordEvidence']) {
      const response = await mf.dispatchFetch(`http://local-proof${path}`, { method: 'POST', body: JSON.stringify(evidence) })
      expect(response.status).toBe(404)
    }
  }, 30000)

  it('routes both engines through the fixed aggregate, consumes before RPC and replays across runtime restart', async () => {
    const proof = await fixture()
    expect((await proof.call('registerGeneration', generation)).status).toBe(200)
    const results = await Promise.all(Array.from({ length: 10 }, () => proof.call('execute', identity)))
    expect(results.every(result => result.status === 200)).toBe(true)
    expect(await proof.call('count')).toEqual({ status: 200, value: 1 })
    expect((await proof.call('execute', { ...identity, jobId: 'job-2', attemptId: 'attempt-2', capabilityId: 'vectorcraft', innerContainerId: 'inner-2' })).status).toBe(409)
    await proof.restart()
    expect((await proof.call('execute', identity)).value).toMatchObject({ state: 'delivered' })
    expect(await proof.call('count')).toEqual({ status: 200, value: 1 })
    expect((await proof.call('readSlot')).value).toMatchObject({ attempt: identity })
    expect((await proof.call('wrong-object')).status).toBe(409)
  }, 30000)

  it('retains uncertain delivery across restart, then atomically records evidence and releases', async () => {
    const proof = await fixture()
    await proof.call('registerGeneration', generation)
    await proof.call('mode', 'lost-ack')
    expect((await proof.call('execute', identity)).value).toMatchObject({ state: 'uncertain' })
    await proof.restart()
    expect((await proof.call('execute', identity)).value).toMatchObject({ state: 'uncertain' })
    expect((await proof.call('recordEvidence', evidence)).value).toMatchObject({ state: 'settled', evidence })
    await proof.restart()
    expect((await proof.call('execute', identity)).value).toMatchObject({ state: 'settled', evidence })
    expect((await proof.call('readSlot')).value).toMatchObject({ attempt: null })
    expect(await proof.call('count')).toEqual({ status: 200, value: 1 })
  }, 30000)

  it('real storage rollback cannot partly consume or forward', async () => {
    const proof = await fixture({ faults: true })
    await proof.call('registerGeneration', generation)
    await proof.call('configureFault', 'commit')
    expect((await proof.call('execute', identity)).value).toEqual({ error: 'injected-rollback' })
    await proof.restart()
    expect((await proof.call('readAttempt', identity.jobId, identity.attemptId)).value).toBeNull()
    expect((await proof.call('readSlot')).value).toMatchObject({ attempt: null })
    expect(await proof.call('count')).toEqual({ status: 200, value: 0 })
    expect((await proof.call('execute', identity)).value).toMatchObject({ state: 'delivered' })
    expect(await proof.call('count')).toEqual({ status: 200, value: 1 })
  }, 30000)

  it('a post-commit interruption cannot forward after runtime restart', async () => {
    const proof = await fixture({ faults: true })
    await proof.call('registerGeneration', generation)
    await proof.call('configureFault', 'after-commit')
    expect((await proof.call('execute', identity)).value).toEqual({ error: 'injected-post-commit-crash' })
    await proof.restart()
    expect((await proof.call('execute', identity)).value).toMatchObject({ state: 'consumed' })
    expect((await proof.call('readSlot')).value).toMatchObject({ attempt: identity })
    expect(await proof.call('count')).toEqual({ status: 200, value: 0 })
  }, 30000)

  it('forwarded work stays consumed when the acknowledgement write rolls back before restart', async () => {
    const proof = await fixture({ faults: true })
    await proof.call('registerGeneration', generation)
    await proof.call('mode', 'fail-outcome-write')
    expect((await proof.call('execute', identity)).value).toEqual({ error: 'injected-rollback' })
    await proof.restart()
    expect((await proof.call('execute', identity)).value).toMatchObject({ state: 'consumed' })
    expect((await proof.call('readSlot')).value).toMatchObject({ attempt: identity })
    expect(await proof.call('count')).toEqual({ status: 200, value: 1 })
  }, 30000)

  it.each([{ enabled: false }, { unconfigured: true }])('fails closed with shipped admission or adapter settings %j', async (settings) => {
    const proof = await fixture(settings)
    expect((await proof.call('registerGeneration', generation)).status).toBe(409)
    expect((await proof.call('execute', identity)).status).toBe(409)
    expect(await proof.call('count')).toEqual({ status: 200, value: 0 })
  }, 30000)

  it('rolls back settlement evidence and slot release together on actual DO storage', async () => {
    const proof = await fixture({ faults: true })
    await proof.call('registerGeneration', generation)
    await proof.call('execute', identity)
    await proof.call('configureFault', 'commit')
    expect((await proof.call('recordEvidence', evidence)).value).toEqual({ error: 'injected-rollback' })
    await proof.restart()
    expect((await proof.call('readSlot')).value).toMatchObject({ attempt: identity })
    expect((await proof.call('readAttempt', identity.jobId, identity.attemptId)).value).toEqual({ identity, state: 'delivered' })
    expect((await proof.call('recordEvidence', evidence)).value).toMatchObject({ state: 'settled', evidence })
    expect((await proof.call('readSlot')).value).toMatchObject({ attempt: null })
  }, 30000)

  it('retains the old generation until positive termination evidence and rejects reused boots', async () => {
    const proof = await fixture()
    await proof.call('registerGeneration', generation)
    const next = { ...generation, generationId: 'generation-2', bootId: 'boot-2' }
    expect((await proof.call('registerGeneration', next)).value).toEqual({ error: 'termination-required' })
    expect((await proof.call('registerGeneration', next, {
      generation, terminated: true, deliveryFenced: true, scratchRemoved: true, receiptDigest: hash('4')
    })).status).toBe(200)
    await proof.restart()
    expect((await proof.call('registerGeneration', generation, {
      generation: next, terminated: true, deliveryFenced: true, scratchRemoved: true, receiptDigest: hash('5')
    })).value).toEqual({ error: 'generation-reused' })
    expect((await proof.call('execute', identity)).value).toEqual({ error: 'generation-mismatch' })
  }, 30000)
})
