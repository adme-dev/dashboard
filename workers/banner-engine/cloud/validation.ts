import type { AttemptIdentity, Evidence, Generation, Termination } from './contracts'

type ObjectValue = Record<string, unknown>
function object(value: unknown, keys: string[]): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-record')
  const record = value as ObjectValue
  if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))) throw new Error('invalid-record-keys')
  return record
}
export function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(value)) throw new Error('invalid-identifier')
  return value
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('invalid-digest')
  return value
}
function positive(value: unknown): true {
  if (value !== true) throw new Error('positive-evidence-required')
  return true
}
const generationKeys = ['generationId', 'bootId', 'outerImageDigest', 'innerImageDigest']
function generationFields(record: ObjectValue): Generation {
  return {
    generationId: identifier(record.generationId), bootId: identifier(record.bootId),
    outerImageDigest: digest(record.outerImageDigest), innerImageDigest: digest(record.innerImageDigest)
  }
}
export function parseGeneration(value: unknown): Generation {
  return generationFields(object(value, generationKeys))
}
export function parseIdentity(value: unknown): AttemptIdentity {
  const record = object(value, [...generationKeys, 'jobId', 'attemptId', 'capabilityId', 'capabilityDigest', 'payloadDigest', 'innerContainerId'])
  return {
    ...generationFields(record), jobId: identifier(record.jobId), attemptId: identifier(record.attemptId),
    capabilityId: identifier(record.capabilityId), capabilityDigest: digest(record.capabilityDigest),
    payloadDigest: digest(record.payloadDigest), innerContainerId: identifier(record.innerContainerId)
  }
}
export function parseTermination(value: unknown): Termination {
  const record = object(value, ['generation', 'terminated', 'deliveryFenced', 'scratchRemoved', 'receiptDigest'])
  return {
    generation: parseGeneration(record.generation), terminated: positive(record.terminated),
    deliveryFenced: positive(record.deliveryFenced), scratchRemoved: positive(record.scratchRemoved), receiptDigest: digest(record.receiptDigest)
  }
}
function fact<T extends string>(value: unknown, allowed: readonly T[]): { status: T, receiptDigest: string } {
  const record = object(value, ['status', 'receiptDigest'])
  const status = allowed.find(item => item === record.status)
  if (!status) throw new Error('invalid-evidence-status')
  return { status, receiptDigest: digest(record.receiptDigest) }
}
export function parseEvidence(value: unknown): Evidence {
  const record = object(value, ['identity', 'authority', 'native', 'output', 'cleanup'])
  const cleanup = object(record.cleanup, ['innerTerminated', 'scratchRemoved', 'deliveryFenced', 'receiptDigest'])
  return {
    identity: parseIdentity(record.identity),
    authority: fact(record.authority, ['succeeded', 'failed', 'cancelled', 'uncertain'] as const),
    native: fact(record.native, ['succeeded', 'failed', 'not-observed'] as const),
    output: fact(record.output, ['accepted', 'rejected', 'not-produced', 'unknown'] as const),
    cleanup: { innerTerminated: positive(cleanup.innerTerminated), scratchRemoved: positive(cleanup.scratchRemoved), deliveryFenced: positive(cleanup.deliveryFenced), receiptDigest: digest(cleanup.receiptDigest) }
  }
}

/** Inputs must first be parsed into canonical field order; never compare arbitrary JSON. */
export function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
export function generationOf(identity: AttemptIdentity): Generation {
  return generationFields({ ...identity })
}
