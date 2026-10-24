// Wire mirror of Studio managed-transfer-continuation. Parsing/linkage is not authority.
import { z } from 'zod'
import { collectionCanonical, collectionDigest } from './collectionApi'

const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const Id = z.uuid()
const Time = z.iso.datetime({ precision: 3, offset: false })
const same = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const deny = (message = 'Continuation provenance mismatch'): never => {
  throw new Error(message)
}
export const CONTINUATION_MAX_ENTRIES = 128
export const ContinuationCursorSchema = z.object({ sequence: z.number().int().min(1).max(CONTINUATION_MAX_ENTRIES), digest: Digest }).strict()
export const continuationPhases = ['source-ready', 'source-freeze', 'destination-execution', 'copy', 'forms-history', 'completion', 'destination-authoring', 'source-retention'] as const
const Phase = z.enum(continuationPhases)
type Phase = z.infer<typeof Phase>
const actions: Record<Phase, readonly string[]> = {
  'source-ready': ['inspect'], 'source-freeze': ['inspect', 'execute'],
  'destination-execution': ['prepare', 'inspect', 'execute'], 'copy': ['prepare', 'inspect', 'execute'],
  'forms-history': ['prepare', 'inspect', 'execute'], 'completion': ['inspect', 'execute'],
  'destination-authoring': ['inspect', 'execute'], 'source-retention': ['inspect', 'execute']
}
const effectActions = {
  'source-execution': ['upload', 'install'], 'destination-execution': ['upload', 'install'],
  'source-freeze': ['freeze'], 'destination-freeze': ['freeze'], 'copy': ['prepare'],
  'forms-history': ['import'], 'destination-authoring': ['install'], 'source-retention': ['retain']
} as const
const EffectPhase = z.enum(['source-execution', 'destination-execution', 'source-freeze', 'destination-freeze', 'copy', 'forms-history', 'destination-authoring', 'source-retention'])
const Effect = z.object({
  effectKey: Digest, phase: EffectPhase, action: z.enum(['upload', 'install', 'freeze', 'prepare', 'import', 'retain']),
  resourceDigest: Digest, requestDigest: Digest, claimDigest: Digest,
  state: z.enum(['dispatching', 'completed', 'not-dispatched']), resultDigest: Digest.nullable(), settlementDigest: Digest.nullable()
}).strict().refine(e => (effectActions[e.phase] as readonly string[]).includes(e.action)
  && (e.state === 'dispatching' ? e.resultDigest === null && e.settlementDigest === null : e.resultDigest !== null && e.settlementDigest !== null))
const Claim = z.object({ effectKey: Digest, claimDigest: Digest }).strict()
const Claims = z.array(Claim).max(32).refine(es => new Set(es.map(e => e.effectKey)).size === es.length)
const Ref = z.object({ kind: z.enum(['retained-request', 'verified-result']), digest: Digest }).strict()
export const ContinuationProgressSchema = z.object({
  formatVersion: z.literal(1), kind: z.literal('managed-transfer-retained-progress-v1'),
  operationId: Id, intentDigest: Digest, sourceScopeDigest: Digest, sourceGeneration: Id,
  destinationBindingDigest: Digest, destinationGeneration: Id, originalRecoveryHeadDigest: Digest,
  earlyInventoryDigest: Digest, sourceExecutionDigest: Digest, sourceFreezeDigest: Digest,
  phases: z.array(z.object({ phase: Phase, request: Ref.extend({ kind: z.literal('retained-request') }).strict(), result: Ref.extend({ kind: z.literal('verified-result') }).strict().nullable() }).strict()).min(1).max(8),
  effects: z.array(Effect).max(32),
  selection: z.discriminatedUnion('state', [
    z.object({ state: z.literal('source'), sourceSnapshotDigest: Digest }).strict(),
    z.object({ state: z.literal('destination'), completionDigest: Digest, destinationSnapshotDigest: Digest }).strict()
  ])
}).strict().refine(p => p.sourceGeneration !== p.destinationGeneration
  && p.effects.every((e, i) => i === 0 || p.effects[i - 1]!.effectKey < e.effectKey)
  && p.phases.every((e, i) => e.phase !== 'source-ready' && (i === 0 || continuationPhases.indexOf(p.phases[i - 1]!.phase) < continuationPhases.indexOf(e.phase)))
  && p.phases.some(e => e.phase === 'source-freeze' && e.result !== null)
  && (p.selection.state === 'source'
    ? !p.phases.some(e => e.phase === 'completion' && e.result)
    : p.phases.some(e => e.phase === 'completion' && e.result?.digest === (p.selection as { completionDigest: string }).completionDigest)))
export const ContinuationGrantSchema = z.object({
  formatVersion: z.literal(1), kind: z.literal('managed-transfer-continuation-v1'),
  operationId: Id, intentDigest: Digest, continuationId: Id,
  predecessor: z.object({ grantDigest: Digest.nullable(), originalRecoveryHeadDigest: Digest, journal: ContinuationCursorSchema.nullable() }).strict(),
  reviewDigest: Digest, ownerConsentDigest: Digest, operatorConsentDigest: Digest, authorityDigest: Digest,
  descriptorDigest: Digest, progressDigest: Digest, allowedThrough: z.literal('source-retention'), issuedAt: Time, deadline: Time
}).strict().refine(g => Date.parse(g.deadline) > Date.parse(g.issuedAt)
  && Date.parse(g.deadline) - Date.parse(g.issuedAt) <= 3_600_000
  && (g.predecessor.grantDigest === null) === (g.predecessor.journal === null))
export const ContinuationRequestSchema = z.object({
  formatVersion: z.literal(1), kind: z.literal('managed-transfer-continuation-action-v1'),
  operationId: Id, intentDigest: Digest, continuationId: Id, grantDigest: Digest,
  expectedCursor: ContinuationCursorSchema, expectedProgressDigest: Digest,
  phase: Phase, action: z.enum(['prepare', 'inspect', 'execute']), invocationId: Id, requestDigest: Digest
}).strict().refine(r => actions[r.phase].includes(r.action))
export const ContinuationResultSchema = z.object({
  formatVersion: z.literal(1), kind: z.literal('managed-transfer-continuation-result-v1'),
  envelopeDigest: Digest, continuationId: Id, grantDigest: Digest, phase: Phase,
  outcome: z.enum(['prepared', 'verified', 'complete', 'needs-inspection']), resultDigest: Digest,
  effectClaims: Claims, beforeProgressDigest: Digest, afterProgressDigest: Digest
}).strict().refine(r => r.outcome !== 'needs-inspection'
  || (r.beforeProgressDigest === r.afterProgressDigest && r.effectClaims.length === 0))
  .refine(r => r.phase !== 'completion' || r.effectClaims.length === 0)

const JournalBase = { operationId: Id, sequence: z.number().int().min(1).max(CONTINUATION_MAX_ENTRIES), entryId: Id, previousDigest: Digest.nullable(), digest: Digest }
const Bound = { continuationId: Id, grantDigest: Digest }
export const ContinuationJournalEntrySchema = z.discriminatedUnion('kind', [
  z.object({ ...JournalBase, kind: z.literal('grant'), body: ContinuationGrantSchema }).strict(),
  z.object({ ...JournalBase, kind: z.literal('admission'), body: z.object({ ...Bound, step: z.enum(['prepared', 'applied', 'enabled']), receiptDigest: Digest }).strict() }).strict(),
  z.object({ ...JournalBase, kind: z.literal('phase'), body: z.object({
    ...Bound, phase: Phase, action: z.enum(['prepare', 'inspect', 'execute']),
    outcome: z.enum(['prepared', 'verified', 'complete']), envelopeDigest: Digest, receiptDigest: Digest,
    requestDigest: Digest, resultDigest: Digest, effects: Claims, beforeProgressDigest: Digest, afterProgressDigest: Digest
  }).strict().refine(b => actions[b.phase].includes(b.action)
    && b.outcome === { prepare: 'prepared', inspect: 'verified', execute: 'complete' }[b.action]
    && (b.phase !== 'completion' || b.effects.length === 0)
    && (b.action !== 'prepare' || b.effects.length === 0)) }).strict(),
  z.object({ ...JournalBase, kind: z.literal('revocation'), body: z.object({ ...Bound, reason: z.enum(['operator', 'owner', 'authority-changed']), authorityDigest: Digest }).strict() }).strict()
])

async function verifyEffectKeys(progress: z.infer<typeof ContinuationProgressSchema>) {
  for (const { effectKey, phase, action, resourceDigest } of progress.effects) {
    if (effectKey !== await collectionDigest({ operationId: progress.operationId, phase, action, resourceDigest })) deny('Retained physical effect identity changed')
  }
}

/** Pure causal linkage only. Caller independently proves session, consent, persisted
 * phase records and current physical observations before appending anything. */
export async function verifyContinuationJournal(input: unknown) {
  const entries = z.array(ContinuationJournalEntrySchema).min(1).max(CONTINUATION_MAX_ENTRIES).parse(structuredClone(input))
  let current: z.infer<typeof ContinuationGrantSchema> | undefined
  let grantDigest = '', progressDigest = '', mode = 'none'
  const ids = new Set<string>(), grants = new Set<string>()
  const phaseRequests = new Map<string, string>(), terminal = new Set<string>(), prepared = new Set<string>()
  const envelopes = new Set<string>(), receipts = new Set<string>()
  for (const [i, entry] of entries.entries()) {
    const { digest, ...body } = entry
    if (entry.sequence !== i + 1 || entry.operationId !== entries[0]!.operationId
      || entry.previousDigest !== (i ? entries[i - 1]!.digest : null) || ids.has(entry.entryId)
      || await collectionDigest(body) !== digest) deny()
    ids.add(entry.entryId)
    if (entry.kind === 'grant') {
      const next = entry.body
      const prior = i ? { sequence: i, digest: entries[i - 1]!.digest } : null
      if (next.operationId !== entry.operationId || grants.has(next.continuationId)
        || next.predecessor.grantDigest !== (current ? grantDigest : null)
        || !same(next.predecessor.journal, prior)
        || (current && (next.intentDigest !== current.intentDigest || next.predecessor.originalRecoveryHeadDigest !== current.predecessor.originalRecoveryHeadDigest))) deny()
      current = next
      grantDigest = await collectionDigest(next)
      progressDigest = next.progressDigest
      mode = 'grant'
      grants.add(next.continuationId)
      continue
    }
    if (!current || entry.body.continuationId !== current.continuationId || entry.body.grantDigest !== grantDigest) deny()
    if (entry.kind === 'admission') {
      const expected = { prepared: 'grant', applied: 'prepared', enabled: 'applied' }[entry.body.step]
      if (mode !== expected) deny()
      mode = entry.body.step
    } else if (entry.kind === 'revocation') {
      if (mode === 'revoked') deny()
      mode = 'revoked'
    } else {
      const body = entry.body
      if (mode !== 'enabled' || entry.body.beforeProgressDigest !== progressDigest
        || body.afterProgressDigest === progressDigest || envelopes.has(body.envelopeDigest) || receipts.has(body.receiptDigest)
        || (phaseRequests.has(body.phase) && phaseRequests.get(body.phase) !== body.requestDigest)
        || (body.action !== 'inspect' && terminal.has(body.phase))
        || (body.action === 'prepare' && prepared.has(body.phase))) deny()
      phaseRequests.set(body.phase, body.requestDigest)
      envelopes.add(body.envelopeDigest)
      receipts.add(body.receiptDigest)
      if (body.action === 'prepare') prepared.add(body.phase)
      if (body.action === 'execute') terminal.add(body.phase)
      progressDigest = entry.body.afterProgressDigest
    }
  }
  const last = entries.at(-1)!
  return { sequence: last.sequence, digest: last.digest }
}

/** Current cursor/progress must come from trusted reads, never the request itself.
 * This checks wire linkage; it does not grant execution or replace native authority. */
export async function verifyContinuationRequest(input: unknown, grantInput: unknown, progressInput: unknown, currentCursor: unknown, now: number) {
  const request = ContinuationRequestSchema.parse(structuredClone(input))
  const grant = ContinuationGrantSchema.parse(structuredClone(grantInput))
  const progress = ContinuationProgressSchema.parse(structuredClone(progressInput))
  await verifyEffectKeys(progress)
  const cursor = ContinuationCursorSchema.parse(currentCursor)
  if (!Number.isFinite(now) || now < Date.parse(grant.issuedAt) || now >= Date.parse(grant.deadline)
    || !same(cursor, request.expectedCursor) || request.grantDigest !== await collectionDigest(grant)
    || request.expectedProgressDigest !== await collectionDigest(progress)
    || request.continuationId !== grant.continuationId || request.operationId !== grant.operationId
    || request.operationId !== progress.operationId || request.intentDigest !== grant.intentDigest
    || request.intentDigest !== progress.intentDigest || grant.predecessor.originalRecoveryHeadDigest !== progress.originalRecoveryHeadDigest) deny()
  if (request.action !== 'inspect') {
    if (progress.effects.some(e => e.state !== 'completed')) deny('Unresolved retained effect requires inspection')
    const retained = progress.phases.find(p => p.phase === request.phase)
    if (retained && (retained.result || retained.request.digest !== request.requestDigest)) deny('Retained phase requires inspection')
    const required: Partial<Record<Phase, Phase[]>> = {
      'destination-execution': ['source-freeze'], 'copy': ['destination-execution'], 'forms-history': ['copy'],
      'completion': ['copy', 'forms-history'], 'destination-authoring': ['completion'], 'source-retention': ['completion', 'destination-authoring']
    }
    if ((required[request.phase] ?? []).some(phase => !progress.phases.some(p => p.phase === phase && p.result))) deny('Required phase is not verified')
    const destination = request.phase === 'destination-authoring' || request.phase === 'source-retention'
    if ((progress.selection.state === 'destination') !== destination) deny('Wrong active selection')
  }
  return request
}

/** Binds the result and preserves retained identities. Physical receipts still
 * require their existing phase-specific validators and independent readback. */
export async function verifyContinuationResult(requestInput: unknown, resultInput: unknown, beforeInput: unknown, afterInput: unknown) {
  const request = ContinuationRequestSchema.parse(structuredClone(requestInput))
  const result = ContinuationResultSchema.parse(structuredClone(resultInput))
  const before = ContinuationProgressSchema.parse(structuredClone(beforeInput))
  const after = ContinuationProgressSchema.parse(structuredClone(afterInput))
  await verifyEffectKeys(before)
  await verifyEffectKeys(after)
  const immutable = ['operationId', 'intentDigest', 'sourceScopeDigest', 'sourceGeneration', 'destinationBindingDigest', 'destinationGeneration', 'originalRecoveryHeadDigest', 'earlyInventoryDigest', 'sourceExecutionDigest', 'sourceFreezeDigest'] as const
  if (result.envelopeDigest !== await collectionDigest(request) || result.continuationId !== request.continuationId
    || result.grantDigest !== request.grantDigest || result.phase !== request.phase
    || result.beforeProgressDigest !== await collectionDigest(before) || result.afterProgressDigest !== await collectionDigest(after)
    || request.expectedProgressDigest !== result.beforeProgressDigest || request.operationId !== before.operationId
    || request.intentDigest !== before.intentDigest || immutable.some(key => before[key] !== after[key])) deny()
  if (result.outcome === 'needs-inspection') {
    if (!same(before, after)) deny()
    return result
  }
  const expected = { prepare: 'prepared', inspect: 'verified', execute: 'complete' }[request.action]
  if (result.outcome !== expected) deny()
  for (const old of before.effects) {
    const next = after.effects.find(e => e.effectKey === old.effectKey)
    if (!next || old.requestDigest !== next.requestDigest
      || old.resourceDigest !== next.resourceDigest || old.phase !== next.phase || old.action !== next.action
      || (old.state !== 'dispatching' && !same(old, next))
      || (old.state === 'dispatching' && next.state === 'dispatching' && !same(old, next))) deny()
  }
  for (const old of before.phases) {
    const next = after.phases.find(p => p.phase === old.phase)
    if (!next || !same(old.request, next.request) || (old.result && !same(old, next))) deny()
  }
  const changedPhases = after.phases.filter(p => !same(p, before.phases.find(old => old.phase === p.phase) ?? null))
  if (changedPhases.some(p => p.phase !== request.phase || p.request.digest !== request.requestDigest
    || (result.outcome === 'verified' && p.result !== null && p.result.digest !== result.resultDigest))
  || (request.action === 'prepare' && changedPhases.some(p => p.result !== null))) deny()
  const allowedEffectPhases: readonly string[] = request.phase === 'destination-execution'
    ? ['destination-execution', 'destination-freeze']
    : request.phase === 'source-ready' ? ['source-execution'] : [request.phase]
  const changedEffects = after.effects.filter(e => !same(e, before.effects.find(old => old.effectKey === e.effectKey) ?? null))
  if (changedEffects.some(e => !allowedEffectPhases.includes(e.phase) || e.requestDigest !== request.requestDigest
    || (request.action === 'inspect' && !before.effects.some(old => old.effectKey === e.effectKey)))
  || (request.action === 'prepare' && changedEffects.length > 0)) deny()
  for (const effect of changedEffects) {
    if (!result.effectClaims.some(c => c.effectKey === effect.effectKey && c.claimDigest === effect.claimDigest)) deny()
  }
  if (!same(before.selection, after.selection) && !(request.phase === 'completion' && request.action === 'execute'
    && before.selection.state === 'source' && after.selection.state === 'destination' && after.selection.completionDigest === result.resultDigest)) deny()
  for (const claim of result.effectClaims) {
    const effect = after.effects.find(e => e.effectKey === claim.effectKey)
    if (!effect || effect.claimDigest !== claim.claimDigest || effect.requestDigest !== request.requestDigest
      || !allowedEffectPhases.includes(effect.phase) || (result.outcome === 'complete' && effect.state !== 'completed')) deny()
  }
  if (request.phase === 'completion' && result.effectClaims.length !== 0) deny()
  if (result.outcome === 'complete' && !after.phases.some(p => p.phase === request.phase && p.request.digest === request.requestDigest && p.result?.digest === result.resultDigest)) deny()
  return result
}

/** Validate the full retained result before linking it into the journal. */
export async function verifyContinuationPhaseEntry(entryInput: unknown, requestInput: unknown, resultInput: unknown, before: unknown, after: unknown) {
  const entry = ContinuationJournalEntrySchema.parse(entryInput)
  const request = ContinuationRequestSchema.parse(requestInput)
  const result = await verifyContinuationResult(request, resultInput, before, after)
  if (entry.kind !== 'phase' || result.outcome === 'needs-inspection'
    || entry.previousDigest !== request.expectedCursor.digest || entry.sequence !== request.expectedCursor.sequence + 1
    || entry.operationId !== request.operationId || !same(entry.body, {
    continuationId: request.continuationId, grantDigest: request.grantDigest, phase: request.phase,
    action: request.action, outcome: result.outcome, envelopeDigest: result.envelopeDigest,
    receiptDigest: await collectionDigest(result), requestDigest: request.requestDigest,
    resultDigest: result.resultDigest, effects: result.effectClaims,
    beforeProgressDigest: result.beforeProgressDigest, afterProgressDigest: result.afterProgressDigest
  }) || result.beforeProgressDigest === result.afterProgressDigest) deny()
  const { digest, ...body } = entry
  if (digest !== await collectionDigest(body)) deny()
  return entry
}
