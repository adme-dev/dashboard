import type { AttemptIdentity, AttemptRecord, Evidence, Generation, SlotRecord, Storage, Termination, TrustedAdapter } from './contracts'
import { equal, generationOf, identifier, parseEvidence, parseGeneration, parseIdentity, parseTermination } from './validation'

const SLOT = 'v1/slot'
const emptySlot = (): SlotRecord => ({ generation: null, attempt: null })
const attemptKey = (jobId: string, attemptId: string) => `v1/attempt/${identifier(jobId)}/${identifier(attemptId)}`

/** No alarms, leases, expiry, deletion, retry, force-unlock, or filesystem authority. */
export class CloudExecutionController {
  constructor(private readonly storage: Storage, private readonly adapter: TrustedAdapter, private readonly enabled = false) {}

  private requireEnabled() { if (this.enabled !== true) throw new Error('cloud-execution-disabled') }

  async readSlot(): Promise<SlotRecord> { return await this.storage.get<SlotRecord>(SLOT) ?? emptySlot() }
  async readAttempt(jobId: string, attemptId: string): Promise<AttemptRecord | undefined> {
    return this.storage.get<AttemptRecord>(attemptKey(jobId, attemptId))
  }

  async registerGeneration(input: Generation, priorTermination?: Termination): Promise<SlotRecord> {
    this.requireEnabled()
    const generation = parseGeneration(input)
    const termination = priorTermination === undefined ? undefined : parseTermination(priorTermination)
    if (await this.adapter.verifyGeneration(generation) !== true) throw new Error('untrusted-generation')
    if (termination && await this.adapter.verifyTermination(termination) !== true) throw new Error('untrusted-termination')
    const result = await this.storage.transaction(async (tx) => {
      const slot = await tx.get<SlotRecord>(SLOT) ?? emptySlot()
      if (equal(slot.generation, generation)) return slot
      const generationKey = `v1/generation/${generation.generationId}`
      const bootKey = `v1/boot/${generation.bootId}`
      if (await tx.get(generationKey) || await tx.get(bootKey)) throw new Error('generation-reused')
      if (slot.attempt) throw new Error('slot-held')
      if (slot.generation && (!termination || !equal(slot.generation, termination.generation))) throw new Error('termination-required')
      if (!slot.generation && termination) throw new Error('unexpected-termination')
      const next: SlotRecord = { generation, attempt: null }
      // Retain the exact old termination evidence permanently alongside the old generation.
      if (termination) await tx.put(`v1/termination/${termination.generation.generationId}`, termination)
      await tx.put(generationKey, generation)
      await tx.put(bootKey, generation)
      await tx.put(SLOT, next)
      return next
    })
    await this.storage.sync()
    return result
  }

  async execute(input: AttemptIdentity): Promise<AttemptRecord> {
    const identity = parseIdentity(input)
    const key = attemptKey(identity.jobId, identity.attemptId)
    const existing = await this.storage.get<AttemptRecord>(key)
    // Read-only replay remains possible after disabling claims or changing authority.
    if (existing) {
      if (!equal(existing.identity, identity)) throw new Error('identity-conflict')
      return existing
    }
    this.requireEnabled()
    const trusted = parseIdentity(await this.adapter.authorize(identity))
    if (!equal(trusted, identity)) throw new Error('authority-mismatch')
    const decision = await this.storage.transaction(async (tx) => {
      const prior = await tx.get<AttemptRecord>(key)
      if (prior) {
        if (!equal(prior.identity, identity)) throw new Error('identity-conflict')
        return { forward: false, record: prior }
      }
      const slot = await tx.get<SlotRecord>(SLOT) ?? emptySlot()
      if (!equal(slot.generation, generationOf(identity))) throw new Error('generation-mismatch')
      if (slot.attempt) throw new Error('slot-held')
      const innerKey = `v1/inner/${identity.generationId}/${identity.innerContainerId}`
      if (await tx.get(innerKey)) throw new Error('inner-identity-reused')
      const record: AttemptRecord = { identity, state: 'consumed' }
      await tx.put(key, record)
      await tx.put(innerKey, identity)
      await tx.put(SLOT, { ...slot, attempt: identity })
      return { forward: true, record }
    })
    if (!decision.forward) return decision.record
    // Outside the transaction: commit/output gate PLUS explicit flush precede transport.
    // A crash or lost reply here consumes the permission permanently, even if unstarted.
    await this.storage.sync()
    let state: 'delivered' | 'uncertain' = 'delivered'
    try {
      await this.adapter.forward(identity)
    } catch {
      state = 'uncertain'
    }
    const result = await this.storage.transaction(async (tx) => {
      const record = await tx.get<AttemptRecord>(key)
      if (!record || !equal(record.identity, identity)) throw new Error('durable-record-missing')
      // A late transport acknowledgement must never regress already-recorded evidence.
      if (record.state !== 'consumed') return record
      const updated: AttemptRecord = { ...record, state }
      await tx.put(key, updated)
      return updated
    })
    await this.storage.sync()
    return result
  }

  async recordEvidence(input: Evidence): Promise<AttemptRecord> {
    // Recovery can close already-consumed work while admission is disabled.
    const evidence = parseEvidence(input)
    if (await this.adapter.verifyEvidence(evidence) !== true) throw new Error('untrusted-evidence')
    const key = attemptKey(evidence.identity.jobId, evidence.identity.attemptId)
    const result = await this.storage.transaction(async (tx) => {
      const record = await tx.get<AttemptRecord>(key)
      if (!record || !equal(record.identity, evidence.identity)) throw new Error('identity-conflict')
      if (record.evidence) {
        if (!equal(record.evidence, evidence)) throw new Error('evidence-conflict')
        return record
      }
      const slot = await tx.get<SlotRecord>(SLOT)
      if (!slot || !equal(slot.attempt, evidence.identity)) throw new Error('slot-identity-conflict')
      const settled: AttemptRecord = { ...record, state: 'settled', evidence }
      // One atomic commit stores outcome+positive fenced cleanup and frees capacity.
      await tx.put(key, settled)
      await tx.put(SLOT, { ...slot, attempt: null })
      return settled
    })
    await this.storage.sync()
    return result
  }
}
