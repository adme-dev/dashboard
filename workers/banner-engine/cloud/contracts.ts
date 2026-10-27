// One coordination atom across PhotoCraft AND VectorCraft; not a Worker export.
export const AGGREGATE_NAME = 'banner-craft-aggregate-v1'

/** All digests are immutable sha256:<64 lowercase hex>, never tags or bearer tokens. */
export interface Generation {
  generationId: string
  bootId: string
  outerImageDigest: string
  innerImageDigest: string
}

export interface AttemptIdentity extends Generation {
  jobId: string
  attemptId: string
  capabilityId: string
  capabilityDigest: string
  payloadDigest: string
  innerContainerId: string
}

export interface Termination {
  generation: Generation
  terminated: true
  deliveryFenced: true
  scratchRemoved: true
  receiptDigest: string
}

export interface Evidence {
  identity: AttemptIdentity
  authority: { status: 'succeeded' | 'failed' | 'cancelled' | 'uncertain', receiptDigest: string }
  native: { status: 'succeeded' | 'failed' | 'not-observed', receiptDigest: string }
  output: { status: 'accepted' | 'rejected' | 'not-produced' | 'unknown', receiptDigest: string }
  cleanup: { innerTerminated: true, scratchRemoved: true, deliveryFenced: true, receiptDigest: string }
}

export interface AttemptRecord {
  identity: AttemptIdentity
  state: 'consumed' | 'delivered' | 'uncertain' | 'settled'
  evidence?: Evidence
}

export interface SlotRecord {
  generation: Generation | null
  attempt: AttemptIdentity | null
}

/** Subset of Cloudflare DurableObjectStorage/Transaction; no network I/O in transactions. */
export interface Transaction {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}
export interface Storage {
  get<T>(key: string): Promise<T | undefined>
  transaction<T>(body: (tx: Transaction) => Promise<T>): Promise<T>
  sync(): Promise<void>
}

/**
 * Private service-binding contract, NOT caller-provided callbacks or public HTTP.
 * Implementations independently resolve current authority and the trusted registry.
 * Receipt verifiers must retrieve independently retained evidence by digest, compare
 * EVERY identity, and never treat booleans supplied by a caller as verification.
 */
export interface TrustedAdapter {
  authorize(identity: AttemptIdentity): Promise<AttemptIdentity>
  verifyGeneration(generation: Generation): Promise<boolean>
  verifyTermination(termination: Termination): Promise<boolean>
  verifyEvidence(evidence: Evidence): Promise<boolean>
  /**
   * Exactly one delivery; no retry, redirect, cold-start, or generation reassignment.
   * Receiver checks exact live boot and consumed identity, verifies payload bytes,
   * and permanently fences closed attempts against delayed in-flight delivery.
   * Never return credentials, payload bytes, logs, or arbitrary provider errors.
   */
  forward(identity: AttemptIdentity): Promise<void>
}
