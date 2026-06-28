import { describe, it, expect } from 'vitest'
import { validateBriefForConversion } from '~~/server/utils/briefConversion/gatekeeper'

// The gatekeeper encodes the "industry-standard" required-field contract for an ad job:
// a resolved channel/campaign type, a typed budget, and a deadline. Per the confirmed
// operating model it is AI-fills-gaps / human-confirms: it never hard-blocks here, it
// returns gaps + deterministic proposals. `ok` = no REQUIRED gap left unfilled by a proposal.

describe('validateBriefForConversion — ad job', () => {
  const adBase = {
    isAdTemplate: true,
    campaignType: 'G_PMaxInventory',
    allocations: [{ amount: 700 }],
    budgetMin: 500,
    budgetMax: 700,
    requestedDeadline: '2026-07-01',
  }

  it('passes a complete ad brief with no gaps', () => {
    const r = validateBriefForConversion(adBase)
    expect(r.ok).toBe(true)
    expect(r.gaps).toEqual([])
  })

  it('flags a missing campaign type as a required gap with no auto-proposal (cannot guess a code)', () => {
    const r = validateBriefForConversion({ ...adBase, campaignType: null })
    const gap = r.gaps.find(g => g.field === 'campaignType')
    expect(gap?.severity).toBe('required')
    expect(r.proposals.find(p => p.field === 'campaignType')).toBeUndefined()
    expect(r.ok).toBe(false) // required gap, unfilled → needs human
  })

  it('proposes a typed allocation when a budget exists but no allocation was captured', () => {
    const r = validateBriefForConversion({ ...adBase, allocations: [] })
    const proposal = r.proposals.find(p => p.field === 'budgetAllocation')
    expect(proposal).toBeDefined()
    expect(proposal?.proposedValue).toMatchObject({ amount: 700 })
    // a required gap that IS filled by a proposal → ok stays true
    expect(r.ok).toBe(true)
  })

  it('flags a required budget gap (unfilled) when there is neither an allocation nor a budget', () => {
    const r = validateBriefForConversion({
      ...adBase, allocations: [], budgetMin: null, budgetMax: null,
    })
    expect(r.gaps.find(g => g.field === 'budget')?.severity).toBe('required')
    expect(r.ok).toBe(false)
  })

  it('treats a missing deadline as recommended (not required) — does not block ok', () => {
    const r = validateBriefForConversion({ ...adBase, requestedDeadline: null })
    expect(r.gaps.find(g => g.field === 'requestedDeadline')?.severity).toBe('recommended')
    expect(r.ok).toBe(true)
  })
})

describe('validateBriefForConversion — non-ad job', () => {
  it('does not require a campaign type or budget for a non-ad template', () => {
    const r = validateBriefForConversion({
      isAdTemplate: false,
      campaignType: null,
      allocations: [],
      budgetMin: null,
      budgetMax: null,
      requestedDeadline: null,
    })
    expect(r.gaps.some(g => g.severity === 'required')).toBe(false)
    expect(r.ok).toBe(true)
  })
})
