import { describe, it, expect } from 'vitest'
import { computeAdoption, type AdoptionInput } from '~~/server/utils/crm/adoption'

const base: AdoptionInput = {
  activeOpps: 0,
  activeOppsWithOpenTask: 0,
  people: 0,
  peopleWithScore: 0,
  views: 0,
  viewUsers: 0,
  contacts: 0,
  merges: 0,
}

describe('computeAdoption', () => {
  it('returns all-zero metrics for an empty CRM (no division by zero / NaN)', () => {
    const m = computeAdoption(base)
    expect(m.oppTaskCoveragePct).toBe(0)
    expect(m.peopleScoredPct).toBe(0)
    expect(m.savedViewsPerUser).toBe(0)
    expect(m.duplicateRatePct).toBe(0)
    expect(Number.isNaN(m.oppTaskCoveragePct)).toBe(false)
    expect(Number.isNaN(m.duplicateRatePct)).toBe(false)
  })

  it('computes opportunity task-coverage as a percentage', () => {
    expect(computeAdoption({ ...base, activeOpps: 4, activeOppsWithOpenTask: 3 }).oppTaskCoveragePct).toBe(75)
    expect(computeAdoption({ ...base, activeOpps: 10, activeOppsWithOpenTask: 10 }).oppTaskCoveragePct).toBe(100)
  })

  it('computes people-scored as a percentage rounded to one decimal', () => {
    // 1/3 = 33.333… → 33.3
    expect(computeAdoption({ ...base, people: 3, peopleWithScore: 1 }).peopleScoredPct).toBe(33.3)
  })

  it('computes saved-views-per-user (views / distinct users)', () => {
    expect(computeAdoption({ ...base, views: 9, viewUsers: 3 }).savedViewsPerUser).toBe(3)
    // 5 views / 2 users = 2.5
    expect(computeAdoption({ ...base, views: 5, viewUsers: 2 }).savedViewsPerUser).toBe(2.5)
  })

  it('returns 0 views-per-user when no user has saved a view', () => {
    expect(computeAdoption({ ...base, views: 7, viewUsers: 0 }).savedViewsPerUser).toBe(0)
  })

  it('computes duplicate rate as merges / (contacts + merges)', () => {
    // 5 merged away out of (95 surviving contacts + 5 merges) = 5/100 = 5%
    expect(computeAdoption({ ...base, contacts: 95, merges: 5 }).duplicateRatePct).toBe(5)
  })

  it('echoes the raw counts for display', () => {
    const input = { ...base, activeOpps: 4, activeOppsWithOpenTask: 3, people: 3, peopleWithScore: 1 }
    expect(computeAdoption(input).raw).toEqual(input)
  })
})
