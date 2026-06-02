import { describe, it, expect } from 'vitest'
import { rankTargets, normalizeGuestEmail, isTargetInCandidates } from '~~/server/utils/crm/meetingBridge'
import type { CandidatePerson, CandidateOpp } from '~~/server/utils/crm/meetingBridge'

const person = (over: Partial<CandidatePerson> = {}): CandidatePerson => ({
  person_id: 'p1', client_id: 'c1', company_id: 'co1', company_name: 'Acme Inc', email: 'jane@acme.com', display_name: 'Jane Doe', ...over,
})
const opp = (over: Partial<CandidateOpp> = {}): CandidateOpp => ({
  opportunity_id: 'o1', client_id: 'c1', person_id: 'p1', company_id: 'co1', name: 'Acme renewal',
  updated_at: '2026-06-01T00:00:00.000Z', ...over,
})

describe('normalizeGuestEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeGuestEmail('  Jane@ACME.com ')).toBe('jane@acme.com')
  })
})

describe('rankTargets', () => {
  it('zero matches → empty', () => {
    expect(rankTargets({ candidatePeople: [], candidateOpps: [] })).toEqual([])
  })

  it('one person, one client, no opp → person target, high confidence', () => {
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [] })
    expect(t.target_type).toBe('person')
    expect(t.target_id).toBe('p1')
    expect(t.client_id).toBe('c1')
    expect(t.matched_email).toBe('jane@acme.com')
    expect(t.confidence).toBe('high')
    expect(t.alternatives.some(a => a.target_type === 'company' && a.target_id === 'co1')).toBe(true)
  })

  it('one person with an open opp → opp target, person+company in alternatives', () => {
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [opp()] })
    expect(t.target_type).toBe('opportunity')
    expect(t.target_id).toBe('o1')
    expect(t.confidence).toBe('high')
    expect(t.alternatives.some(a => a.target_type === 'person' && a.target_id === 'p1')).toBe(true)
  })

  it('multiple open opps → most-recently-updated wins, others are alternatives', () => {
    const older = opp({ opportunity_id: 'o-old', name: 'Old', updated_at: '2026-05-01T00:00:00.000Z' })
    const newer = opp({ opportunity_id: 'o-new', name: 'New', updated_at: '2026-06-02T00:00:00.000Z' })
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [older, newer] })
    expect(t.target_id).toBe('o-new')
    expect(t.alternatives.some(a => a.target_id === 'o-old')).toBe(true)
  })

  it('no person-opp but a company-opp exists → company-opp is the target', () => {
    const companyOpp = opp({ opportunity_id: 'o-co', person_id: null, company_id: 'co1' })
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [companyOpp] })
    expect(t.target_type).toBe('opportunity')
    expect(t.target_id).toBe('o-co')
  })

  it('two people in the same client → ambiguous, one proposal each', () => {
    const people = [person(), person({ person_id: 'p2', email: 'bob@acme.com', display_name: 'Bob Roe' })]
    const out = rankTargets({ candidatePeople: people, candidateOpps: [] })
    expect(out).toHaveLength(2)
    expect(out.every(t => t.confidence === 'ambiguous')).toBe(true)
  })

  it('two people across different clients → ambiguous', () => {
    const people = [person(), person({ person_id: 'p2', client_id: 'c2', company_id: 'co2', email: 'x@other.com', display_name: 'X' })]
    const out = rankTargets({ candidatePeople: people, candidateOpps: [] })
    expect(out).toHaveLength(2)
    expect(out.every(t => t.confidence === 'ambiguous')).toBe(true)
  })

  it('dedupes a person matched by two different guest emails', () => {
    const out = rankTargets({
      candidatePeople: [person(), person({ email: 'jane.doe@acme.com' })],
      candidateOpps: [],
    })
    expect(out).toHaveLength(1)
  })

  it('excludes an opp whose person_id matches but client_id differs', () => {
    const foreignOpp = opp({ opportunity_id: 'o-foreign', client_id: 'c2' })
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [foreignOpp] })
    expect(t.target_type).toBe('person')   // no in-client opp → falls back to person
    expect(t.target_id).toBe('p1')
  })

  it('excludes a company-opp whose company_id does not match', () => {
    const otherCompanyOpp = opp({ opportunity_id: 'o-other', person_id: null, company_id: 'co-NOPE' })
    const [t] = rankTargets({ candidatePeople: [person()], candidateOpps: [otherCompanyOpp] })
    expect(t.target_type).toBe('person')
    expect(t.target_id).toBe('p1')
  })
})

describe('isTargetInCandidates', () => {
  const proposals = rankTargets({ candidatePeople: [person()], candidateOpps: [opp()] })
  // proposals[0] = opportunity o1 (primary); alternatives include person p1 + company co1.

  it('accepts the primary target', () => {
    expect(isTargetInCandidates(proposals, { client_id: 'c1', target_type: 'opportunity', target_id: 'o1' })).toBe(true)
  })

  it('accepts an alternative target (the person)', () => {
    expect(isTargetInCandidates(proposals, { client_id: 'c1', target_type: 'person', target_id: 'p1' })).toBe(true)
  })

  it('rejects a target not in the candidate set', () => {
    expect(isTargetInCandidates(proposals, { client_id: 'c1', target_type: 'opportunity', target_id: 'o-NOPE' })).toBe(false)
  })

  it('rejects a target with the right id but a different client (cross-tenant injection)', () => {
    expect(isTargetInCandidates(proposals, { client_id: 'c2', target_type: 'opportunity', target_id: 'o1' })).toBe(false)
  })
})
