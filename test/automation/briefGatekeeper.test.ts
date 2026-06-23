// test/automation/briefGatekeeper.test.ts
import { describe, expect, it } from 'vitest'
import { decideBriefGate, DEFAULT_BRIEF_GATE, planGatekeeperActions } from '~~/server/utils/automation/briefGatekeeper'
import type { BriefCompletenessScore } from '~~/server/utils/aiBriefScoring'

function score(overrides: Partial<BriefCompletenessScore> = {}): BriefCompletenessScore {
  return {
    overall: 90,
    breakdown: { requiredFieldsScore: 100, optionalFieldsScore: 80, contentQualityScore: 90 },
    fieldScores: [
      { fieldKey: 'objective', fieldLabel: 'Campaign Objective', score: 100, isRequired: true },
      { fieldKey: 'audience', fieldLabel: 'Target Audience', score: 100, isRequired: true },
      { fieldKey: 'notes', fieldLabel: 'Extra Notes', score: 0, isRequired: false },
    ],
    recommendations: [],
    ...overrides,
  }
}

describe('decideBriefGate', () => {
  it('passes a brief with all required fields filled and good quality', () => {
    const d = decideBriefGate(score())
    expect(d.gate).toBe('pass')
    expect(d.requiredComplete).toBe(true)
    expect(d.missingRequired).toHaveLength(0)
  })

  it('flags needs_info when a required field is missing, and lists it', () => {
    const d = decideBriefGate(score({
      breakdown: { requiredFieldsScore: 50, optionalFieldsScore: 80, contentQualityScore: 60 },
      fieldScores: [
        { fieldKey: 'objective', fieldLabel: 'Campaign Objective', score: 100, isRequired: true },
        { fieldKey: 'audience', fieldLabel: 'Target Audience', score: 0, isRequired: true },
      ],
    }))
    expect(d.gate).toBe('needs_info')
    expect(d.requiredComplete).toBe(false)
    expect(d.missingRequired).toEqual([{ fieldKey: 'audience', fieldLabel: 'Target Audience' }])
    expect(d.message).toMatch(/Target Audience/)
  })

  it('flags needs_info on a quality floor even when all required fields are present', () => {
    // required all filled (score>0) but weak → low overall
    const d = decideBriefGate(score({
      overall: 55,
      breakdown: { requiredFieldsScore: 100, optionalFieldsScore: 20, contentQualityScore: 40 },
      fieldScores: [
        { fieldKey: 'objective', fieldLabel: 'Campaign Objective', score: 20, isRequired: true },
        { fieldKey: 'audience', fieldLabel: 'Target Audience', score: 50, isRequired: true },
      ],
    }))
    expect(d.gate).toBe('needs_info')
    expect(d.requiredComplete).toBe(true) // present, just weak
    expect(d.missingRequired).toHaveLength(0)
    expect(d.message).toMatch(/quality|detail|below/i)
  })

  it('respects a custom minOverall threshold', () => {
    const s = score({ overall: 75, breakdown: { requiredFieldsScore: 100, optionalFieldsScore: 50, contentQualityScore: 70 } })
    expect(decideBriefGate(s, { minOverall: 70 }).gate).toBe('pass')
    expect(decideBriefGate(s, { minOverall: 80 }).gate).toBe('needs_info')
  })

  it('carries through the scorer recommendations and the default threshold', () => {
    const d = decideBriefGate(score({ recommendations: ['Fill in "Budget" to improve brief completeness'] }))
    expect(d.threshold).toBe(DEFAULT_BRIEF_GATE.minOverall)
    expect(d.recommendations).toContain('Fill in "Budget" to improve brief completeness')
  })

  it('does not treat weak-but-filled required fields (score>0) as missing', () => {
    const d = decideBriefGate(score({
      fieldScores: [
        { fieldKey: 'objective', fieldLabel: 'Campaign Objective', score: 20, isRequired: true },
      ],
      breakdown: { requiredFieldsScore: 100, optionalFieldsScore: 100, contentQualityScore: 80 },
      overall: 88,
    }))
    expect(d.missingRequired).toHaveLength(0)
    expect(d.gate).toBe('pass')
  })
})

describe('planGatekeeperActions', () => {
  const needsInfo = decideBriefGate(score({
    overall: 50,
    breakdown: { requiredFieldsScore: 50, optionalFieldsScore: 0, contentQualityScore: 40 },
    fieldScores: [{ fieldKey: 'audience', fieldLabel: 'Target Audience', score: 0, isRequired: true }],
    recommendations: ['Fill in "Target Audience" to improve brief completeness'],
  }))
  const passing = decideBriefGate(score())

  it('on needs_info: sets needs_info, writes a comment, notifies the submitter', () => {
    const p = planGatekeeperActions({ decision: needsInfo, currentStatus: 'submitted' })
    expect(p.setStatus).toBe('needs_info')
    expect(p.comment).toMatch(/Target Audience/)
    expect(p.comment).toMatch(/Fill in/) // recommendation bullet
    expect(p.notifySubmitter).toBe(true)
    expect(p.assignTo).toBeNull()
    expect(p.noop).toBe(false)
  })

  it('on needs_info when already needs_info: no redundant status change, still comments', () => {
    const p = planGatekeeperActions({ decision: needsInfo, currentStatus: 'needs_info' })
    expect(p.setStatus).toBeNull()
    expect(p.comment).toBeTruthy()
    expect(p.notifySubmitter).toBe(true)
  })

  it('on pass: auto-assigns to the template target when unassigned', () => {
    const p = planGatekeeperActions({ decision: passing, currentStatus: 'submitted', autoAssignTo: 'tm-1', currentAssignee: null })
    expect(p.assignTo).toBe('tm-1')
    expect(p.setStatus).toBeNull()
    expect(p.comment).toBeNull()
    expect(p.noop).toBe(false)
  })

  it('on pass: does not reassign an already-assigned brief', () => {
    const p = planGatekeeperActions({ decision: passing, currentStatus: 'submitted', autoAssignTo: 'tm-1', currentAssignee: 'tm-9' })
    expect(p.assignTo).toBeNull()
    expect(p.noop).toBe(true)
  })

  it('on pass with no template auto-assign target: full no-op', () => {
    const p = planGatekeeperActions({ decision: passing, currentStatus: 'submitted' })
    expect(p).toMatchObject({ setStatus: null, comment: null, notifySubmitter: false, assignTo: null, noop: true })
  })

  it('never auto-acts on a brief with no scorable fields (vacuous 100%), even with an assign target', () => {
    const p = planGatekeeperActions({ decision: passing, currentStatus: 'submitted', autoAssignTo: 'tm-1', currentAssignee: null, hasScorableFields: false })
    expect(p).toMatchObject({ setStatus: null, comment: null, notifySubmitter: false, assignTo: null, noop: true })
  })
})
