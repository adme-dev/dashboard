import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
import { CloudExecutionController } from './controller'
import { AGGREGATE_NAME } from './contracts'
import type { AttemptIdentity, Evidence, Generation, Termination, TrustedAdapter } from './contracts'

export class CloudExecutionObject extends DurableObject<Cloudflare.Env> {
  #controller: CloudExecutionController

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env)
    if (!ctx.id.equals(env.BANNER_ENGINE_CONTROL.idFromName(AGGREGATE_NAME))) throw new Error('invalid-aggregate-object')
    this.#controller = new CloudExecutionController(ctx.storage, env.BANNER_ENGINE_ADAPTER, env.BANNER_ENGINE_CLOUD_ENABLED === 'true')
  }

  registerGeneration(generation: Generation, termination?: Termination) { return this.#controller.registerGeneration(generation, termination) }
  execute(identity: AttemptIdentity) { return this.#controller.execute(identity) }
  recordEvidence(evidence: Evidence) { return this.#controller.recordEvidence(evidence) }
  readAttempt(jobId: string, attemptId: string) { return this.#controller.readAttempt(jobId, attemptId) }
  readSlot() { return this.#controller.readSlot() }
}

/** The shipped binding is deliberately incapable of authorizing or forwarding work. */
export class UnconfiguredCloudAdapter extends WorkerEntrypoint<Cloudflare.Env> implements TrustedAdapter {
  async authorize(_identity: AttemptIdentity): Promise<AttemptIdentity> { throw new Error('cloud-adapter-unconfigured') }
  async verifyGeneration(_generation: Generation): Promise<boolean> { return false }
  async verifyTermination(_termination: Termination): Promise<boolean> { return false }
  async verifyEvidence(_evidence: Evidence): Promise<boolean> { return false }
  async forward(_identity: AttemptIdentity): Promise<void> { throw new Error('cloud-adapter-unconfigured') }
}

/** Bind this named entrypoint only to the trusted control-plane Worker. */
export class CloudExecutionControl extends WorkerEntrypoint<Cloudflare.Env> {
  #stub() { return this.env.BANNER_ENGINE_CONTROL.getByName(AGGREGATE_NAME) }
  registerGeneration(generation: Generation, termination?: Termination) { return this.#stub().registerGeneration(generation, termination) }
  execute(identity: AttemptIdentity) { return this.#stub().execute(identity) }
  recordEvidence(evidence: Evidence) { return this.#stub().recordEvidence(evidence) }
  readAttempt(jobId: string, attemptId: string) { return this.#stub().readAttempt(jobId, attemptId) }
  readSlot() { return this.#stub().readSlot() }
}

export default {
  fetch() { return new Response('Not found', { status: 404 }) }
}
