import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import {
  ContinuationGrantSchema, ContinuationProgressSchema, ContinuationRequestSchema,
  ContinuationResultSchema, verifyContinuationJournal, verifyContinuationRequest,
  verifyContinuationResult, verifyContinuationPhaseEntry
} from '../../shared/pageStudio/transferRecoveryContinuation'

// This is a shared planned-wire fixture, NOT independently verified physical evidence.
const fixture = JSON.parse(readFileSync(new URL('../fixtures/transfer-recovery-continuation-journal-planned.json', import.meta.url), 'utf8'))
const now = Date.parse('2026-10-24T00:30:00.000Z')
const clone = <T>(value: T): T => structuredClone(value)
async function rechain(journal: typeof fixture.journal) {
  for (let i = 0; i < journal.length; i++) {
    journal[i].sequence = i + 1
    journal[i].previousDigest = i === 0 ? null : journal[i - 1].digest
    const { digest: _digest, ...body } = journal[i]
    journal[i].digest = await collectionDigest(body)
  }
  return journal
}

describe('retained-operation continuation wire', () => {
  it('independently parses and hashes the paired planned fixture', async () => {
    const grant = ContinuationGrantSchema.parse(fixture.grant)
    expect(await collectionDigest(grant)).toBe(fixture.grantDigest)
    expect(await collectionDigest(ContinuationProgressSchema.parse(fixture.initialProgress))).toBe(grant.progressDigest)
    for (const step of fixture.transitions) {
      const request = ContinuationRequestSchema.parse(step.request)
      const result = ContinuationResultSchema.parse(step.result)
      expect(await collectionDigest(request)).toBe(result.envelopeDigest)
      expect(await collectionDigest(ContinuationProgressSchema.parse(step.afterProgress))).toBe(result.afterProgressDigest)
    }
    const cursor = await verifyContinuationJournal(fixture.journal)
    expect(cursor).toEqual({ sequence: 10, digest: fixture.journal[9].digest })
  })

  it('rejects unknown fields and invalid time windows', () => {
    expect(ContinuationGrantSchema.safeParse({ ...fixture.grant, allowAnySite: true }).success).toBe(false)
    for (const deadline of [fixture.grant.issuedAt, '2026-10-24T02:00:00.000Z', '2026-10-24T01:00:00Z']) {
      expect(ContinuationGrantSchema.safeParse({ ...fixture.grant, deadline }).success).toBe(false)
    }
  })

  it('requires retained source-freeze and verified phase results for the supported cohort', () => {
    const progress = clone(fixture.initialProgress)
    expect(ContinuationProgressSchema.safeParse({ ...progress, phases: [] }).success).toBe(false)
    progress.phases[0].phase = 'destination-execution'
    expect(ContinuationProgressSchema.safeParse(progress).success).toBe(false)
    progress.phases = clone(fixture.initialProgress.phases)
    progress.phases[0].result.kind = 'physical-observation'
    expect(ContinuationProgressSchema.safeParse(progress).success).toBe(false)
    expect(ContinuationResultSchema.safeParse({ ...fixture.transitions[0].result, phase: 'completion' }).success).toBe(false)
  })

  it('rejects duplicate effects, invalid effect actions and fabricated completion fields', () => {
    const p = clone(fixture.initialProgress)
    p.effects.push(clone(p.effects[0]))
    expect(ContinuationProgressSchema.safeParse(p).success).toBe(false)
    p.effects.pop()
    p.effects[0].action = 'retain'
    expect(ContinuationProgressSchema.safeParse(p).success).toBe(false)
    p.effects[0] = { ...fixture.initialProgress.effects[0], resultDigest: 'a'.repeat(64) }
    expect(ContinuationProgressSchema.safeParse(p).success).toBe(false)
  })

  it('accepts only exact phase and action combinations', () => {
    const request = fixture.transitions[0].request
    for (const [phase, action] of [['source-ready', 'execute'], ['completion', 'prepare'], ['source-retention', 'prepare'], ['arbitrary-method', 'execute']]) {
      expect(ContinuationRequestSchema.safeParse({ ...request, phase, action }).success).toBe(false)
    }
  })

  it('does not authorize execution while a retained source effect is unresolved', async () => {
    const request = fixture.transitions[0].request
    await expect(verifyContinuationRequest(request, fixture.grant, fixture.initialProgress, request.expectedCursor, now)).rejects.toThrow(/unresolved/i)
    await expect(verifyContinuationRequest({ ...request, action: 'inspect' }, fixture.grant, fixture.initialProgress, request.expectedCursor, now)).resolves.toBeDefined()
  })

  it('retains not-dispatched settlements and prevents retrying their occupied effect key', async () => {
    const progress = clone(fixture.initialProgress)
    progress.effects[0] = { ...progress.effects[0], state: 'not-dispatched', resultDigest: '1'.repeat(64), settlementDigest: '2'.repeat(64) }
    expect(ContinuationProgressSchema.safeParse(progress).success).toBe(true)
    const request = { ...fixture.transitions[0].request, expectedProgressDigest: await collectionDigest(progress) }
    await expect(verifyContinuationRequest(request, fixture.grant, progress, request.expectedCursor, now)).rejects.toThrow(/unresolved/i)
  })

  it('requires distinct generations and exact selected completion evidence', () => {
    expect(ContinuationProgressSchema.safeParse({ ...fixture.initialProgress, destinationGeneration: fixture.initialProgress.sourceGeneration }).success).toBe(false)
    const progress = clone(fixture.transitions[3].afterProgress)
    progress.selection.completionDigest = '0'.repeat(64)
    expect(ContinuationProgressSchema.safeParse(progress).success).toBe(false)
  })

  it('rejects a substitute effect key even after the caller recomputes the progress digest', async () => {
    const progress = clone(fixture.initialProgress)
    progress.effects[0].effectKey = '0'.repeat(64)
    const request = { ...fixture.transitions[0].request, action: 'inspect', expectedProgressDigest: await collectionDigest(progress) }
    await expect(verifyContinuationRequest(request, fixture.grant, progress, request.expectedCursor, now)).rejects.toThrow()
  })

  it('requires a current deadline, exact cursor, operation and progress commitment', async () => {
    const request = { ...fixture.transitions[0].request, action: 'inspect' }
    for (const [change, cursor, clock] of [
      [{}, request.expectedCursor, Date.parse(fixture.grant.deadline)],
      [{}, { ...request.expectedCursor, sequence: request.expectedCursor.sequence + 1 }, now],
      [{ operationId: '9535fe52-0cb1-4b61-8ec5-4c9abdd01c15' }, request.expectedCursor, now],
      [{ expectedProgressDigest: '0'.repeat(64) }, request.expectedCursor, now]
    ] as const) {
      await expect(verifyContinuationRequest({ ...request, ...change }, fixture.grant, fixture.initialProgress, cursor, clock)).rejects.toThrow()
    }
  })

  it('rejects reordered, truncated and cross-grant journal linkage', async () => {
    for (const change of [
      (j: typeof fixture.journal) => { j[2].sequence = 4 },
      (j: typeof fixture.journal) => { j[1].body.step = 'enabled' },
      (j: typeof fixture.journal) => { j[4].body.continuationId = '9535fe52-0cb1-4b61-8ec5-4c9abdd01c15' },
      (j: typeof fixture.journal) => { j[4].body.beforeProgressDigest = '0'.repeat(64) }
    ]) {
      const journal = clone(fixture.journal)
      change(journal)
      // Rehash the whole chain: semantic checks cannot rely only on hash corruption.
      for (let i = 0; i < journal.length; i++) {
        journal[i].previousDigest = i === 0 ? null : journal[i - 1].digest
        const { digest: _digest, ...body } = journal[i]
        journal[i].digest = await collectionDigest(body)
      }
      await expect(verifyContinuationJournal(journal)).rejects.toThrow()
    }
    await expect(verifyContinuationJournal(fixture.journal.slice(1))).rejects.toThrow()
  })

  it('binds result envelopes and retained progress identities without calling them physical proof', async () => {
    const step = fixture.transitions[0]
    await expect(verifyContinuationResult(step.request, step.result, fixture.initialProgress, step.afterProgress)).resolves.toBeDefined()
    await expect(verifyContinuationResult(step.request, { ...step.result, envelopeDigest: '0'.repeat(64) }, fixture.initialProgress, step.afterProgress)).rejects.toThrow()
    const after = clone(step.afterProgress)
    after.destinationGeneration = '9535fe52-0cb1-4b61-8ec5-4c9abdd01c15'
    await expect(verifyContinuationResult(step.request, { ...step.result, afterProgressDigest: await collectionDigest(after) }, fixture.initialProgress, after)).rejects.toThrow()
  })

  it('verifies all planned result linkages without granting physical execution', async () => {
    let before = fixture.initialProgress
    for (const step of fixture.transitions) {
      await expect(verifyContinuationResult(step.request, step.result, before, step.afterProgress)).resolves.toEqual(step.result)
      before = step.afterProgress
    }
  })

  it('links every full result receipt rather than trusting a matching phase digest', async () => {
    let before = fixture.initialProgress
    for (const [index, step] of fixture.transitions.entries()) {
      const entry = fixture.journal[index + 4]
      await expect(verifyContinuationPhaseEntry(entry, step.request, step.result, before, step.afterProgress)).resolves.toEqual(entry)
      const changed = clone(entry)
      changed.body.receiptDigest = '0'.repeat(64)
      const { digest: _digest, ...body } = changed
      changed.digest = await collectionDigest(body)
      await expect(verifyContinuationPhaseEntry(changed, step.request, step.result, before, step.afterProgress)).rejects.toThrow()
      before = step.afterProgress
    }
  })

  it('rejects relinking a valid phase receipt to a different journal cursor', async () => {
    const step = fixture.transitions[0]
    for (const change of [{ sequence: 99 }, { previousDigest: 'f'.repeat(64) }]) {
      const entry = { ...clone(fixture.journal[4]), ...change }
      const { digest: _digest, ...body } = entry
      entry.digest = await collectionDigest(body)
      await expect(verifyContinuationPhaseEntry(entry, step.request, step.result, fixture.initialProgress, step.afterProgress)).rejects.toThrow()
    }
  })

  it('rejects inspection inventing new claim keys or substituting a verified phase digest', async () => {
    const step = fixture.transitions[0]
    const request = { ...step.request, action: 'inspect' }
    const result = { ...step.result, outcome: 'verified', envelopeDigest: await collectionDigest(request) }
    await expect(verifyContinuationResult(request, result, fixture.initialProgress, step.afterProgress)).rejects.toThrow()
    const before = clone(step.afterProgress)
    before.phases.at(-1).result = null
    const linkedRequest = { ...request, expectedProgressDigest: await collectionDigest(before) }
    await expect(verifyContinuationResult(linkedRequest, { ...result, envelopeDigest: await collectionDigest(linkedRequest),
      beforeProgressDigest: linkedRequest.expectedProgressDigest, resultDigest: 'f'.repeat(64) }, before, step.afterProgress)).rejects.toThrow()
  })

  it('records preparation then completion without losing earlier inspection progress', async () => {
    const journal = clone(fixture.journal)
    const prepared = clone(journal[4])
    prepared.entryId = '9535fe52-0cb1-4b61-8ec5-4c9abdd01c15'
    Object.assign(prepared.body, { action: 'prepare', outcome: 'prepared', effects: [], envelopeDigest: '1'.repeat(64), receiptDigest: '2'.repeat(64), afterProgressDigest: '3'.repeat(64) })
    journal[4].body.beforeProgressDigest = prepared.body.afterProgressDigest
    journal.splice(4, 0, prepared)
    const inspection = clone(journal[5])
    inspection.entryId = '9535fe52-0cb1-4b61-8ec5-4c9abdd01c16'
    Object.assign(inspection.body, { phase: 'source-ready', action: 'inspect', outcome: 'verified', effects: [], requestDigest: fixture.initialProgress.effects[0].requestDigest, envelopeDigest: '4'.repeat(64), receiptDigest: '5'.repeat(64), beforeProgressDigest: journal[5].body.afterProgressDigest, afterProgressDigest: '6'.repeat(64) })
    journal[6].body.beforeProgressDigest = inspection.body.afterProgressDigest
    journal.splice(6, 0, inspection)
    await expect(verifyContinuationJournal(await rechain(journal))).resolves.toEqual({ sequence: 12, digest: journal[11].digest })
    // Hash-valid duplicate preparation is not another grant to prepare.
    const duplicate = clone(prepared)
    duplicate.entryId = '9535fe52-0cb1-4b61-8ec5-4c9abdd01c17'
    Object.assign(duplicate.body, { beforeProgressDigest: prepared.body.afterProgressDigest, afterProgressDigest: '7'.repeat(64), envelopeDigest: '8'.repeat(64), receiptDigest: '9'.repeat(64) })
    journal[5].body.beforeProgressDigest = duplicate.body.afterProgressDigest
    journal.splice(5, 0, duplicate)
    await expect(verifyContinuationJournal(await rechain(journal))).rejects.toThrow()
  })

  it('rejects obsolete journal entries that omit full receipt provenance', async () => {
    const original = JSON.parse(readFileSync(new URL('../fixtures/transfer-recovery-continuation-planned.json', import.meta.url), 'utf8'))
    await expect(verifyContinuationJournal(original.journal)).rejects.toThrow()
  })

  it('rejects unrelated new phases and effects even when their hashes are internally consistent', async () => {
    const step = fixture.transitions[0]
    const phase = clone(step.afterProgress)
    phase.phases.push(clone(fixture.transitions[1].afterProgress.phases.at(-1)))
    await expect(verifyContinuationResult(step.request, { ...step.result, afterProgressDigest: await collectionDigest(phase) }, fixture.initialProgress, phase)).rejects.toThrow()
    const effect = clone(step.afterProgress)
    effect.effects.push(clone(fixture.transitions[1].afterProgress.effects.find((e: { phase: string }) => e.phase === 'copy')))
    effect.effects.sort((a: { effectKey: string }, b: { effectKey: string }) => a.effectKey.localeCompare(b.effectKey))
    await expect(verifyContinuationResult(step.request, { ...step.result, afterProgressDigest: await collectionDigest(effect) }, fixture.initialProgress, effect)).rejects.toThrow()
  })

  it('requires all changed effect claims and denies new physical effects during preparation', async () => {
    const step = fixture.transitions[0]
    await expect(verifyContinuationResult(step.request, { ...step.result, effectClaims: step.result.effectClaims.slice(1) }, fixture.initialProgress, step.afterProgress)).rejects.toThrow()
    const request = { ...step.request, action: 'prepare' }
    await expect(verifyContinuationResult(request, { ...step.result, outcome: 'prepared', envelopeDigest: await collectionDigest(request) }, fixture.initialProgress, step.afterProgress)).rejects.toThrow()
  })

  it('permits only inspected settlement of a retained dispatching claim; terminal claims remain immutable', async () => {
    const before = fixture.initialProgress
    const after = clone(before)
    after.effects[0] = { ...after.effects[0], state: 'completed', claimDigest: '3'.repeat(64), resultDigest: '4'.repeat(64), settlementDigest: '5'.repeat(64) }
    const request = { ...fixture.transitions[0].request, action: 'inspect', phase: 'source-ready', requestDigest: before.effects[0].requestDigest }
    const result = { ...fixture.transitions[0].result, phase: 'source-ready', outcome: 'verified', envelopeDigest: await collectionDigest(request), afterProgressDigest: await collectionDigest(after), effectClaims: [{ effectKey: after.effects[0].effectKey, claimDigest: after.effects[0].claimDigest }] }
    await expect(verifyContinuationResult(request, result, before, after)).resolves.toBeDefined()
    const tampered = clone(after)
    tampered.effects[1].claimDigest = '6'.repeat(64)
    await expect(verifyContinuationResult(request, { ...result, afterProgressDigest: await collectionDigest(tampered) }, before, tampered)).rejects.toThrow()
  })

  it('does not treat needs-inspection as an accepted effect receipt', () => {
    const result = fixture.transitions[0].result
    expect(ContinuationResultSchema.safeParse({ ...result, outcome: 'needs-inspection', afterProgressDigest: result.beforeProgressDigest }).success).toBe(false)
  })

  it('denies execute replay and request substitution for a retained phase', async () => {
    const step = fixture.transitions[0]
    const progress = clone(step.afterProgress)
    progress.effects[0] = { ...progress.effects[0], state: 'completed', resultDigest: '1'.repeat(64), settlementDigest: '2'.repeat(64) }
    const request = { ...step.request, expectedProgressDigest: await collectionDigest(progress) }
    await expect(verifyContinuationRequest(request, fixture.grant, progress, request.expectedCursor, now)).rejects.toThrow()
    progress.phases.at(-1).result = null
    const substituted = { ...request, requestDigest: '0'.repeat(64), expectedProgressDigest: await collectionDigest(progress) }
    await expect(verifyContinuationRequest(substituted, fixture.grant, progress, request.expectedCursor, now)).rejects.toThrow()
  })
})
