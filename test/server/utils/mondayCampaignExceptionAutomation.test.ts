import { describe, expect, it } from 'vitest'
import {
  hasOpenCampaignDataHalt,
  findExpiredOfferDate,
  hasMondayAutomationWriteScopes,
  parseRecommendedDailyBudget,
  validateSafeBudgetRebase,
  CAMPAIGN_EXCEPTION_COLUMNS,
} from '~~/server/utils/mondayCampaignExceptionAutomation'
import type { MondayItem } from '~~/server/utils/mondayClient'

function item(values: Record<string, string>): MondayItem {
  return {
    id: 'item-1', name: 'Exception', board_id: '18427394520', state: 'active',
    created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z',
    column_values: Object.entries(values).map(([id, text]) => ({ id, type: 'text', text }))
  }
}

const safe = {
  exceptionType: 'Underpacing',
  confidence: 'Safe to auto-apply',
  campaignId: '24035354817',
  firstServedDate: '2026-07-01',
  period: '2026-08',
  pacingRatio: 0.68,
  proposedDailyBudget: 76.71,
  boardRecommendedDailyBudget: 76.71,
  monthlyBudget: 1500,
  daysInMonth: 31,
  dailyBudgetActionSupported: true,
  globalHalt: false,
} as const

describe('Monday Campaign Exceptions automation', () => {
  it('parses the real board recommendation wording', () => {
    expect(parseRecommendedDailyBudget('Raise the daily to about A$76.71/day against a current run rate near A$33/day.')).toBe(76.71)
    expect(parseRecommendedDailyBudget('Split this between two campaigns.')).toBeNull()
  })

  it('accepts only the narrow green full-month daily-rebase envelope', () => {
    expect(validateSafeBudgetRebase(safe)).toEqual({ ok: true })
    expect(validateSafeBudgetRebase({ ...safe, globalHalt: true })).toMatchObject({ ok: false, reason: expect.stringContaining('Global halt') })
    expect(validateSafeBudgetRebase({ ...safe, campaignId: '' })).toMatchObject({ ok: false, reason: expect.stringContaining('Campaign ID') })
    expect(validateSafeBudgetRebase({ ...safe, firstServedDate: '2026-08-02' })).toMatchObject({ ok: false, reason: expect.stringContaining('full month') })
    expect(validateSafeBudgetRebase({ ...safe, pacingRatio: 0.24 })).toMatchObject({ ok: false, reason: expect.stringContaining('safe 0.55–0.80') })
    expect(validateSafeBudgetRebase({ ...safe, proposedDailyBudget: 100 })).toMatchObject({ ok: false, reason: expect.stringContaining('disagrees') })
    expect(validateSafeBudgetRebase({ ...safe, proposedDailyBudget: 97, boardRecommendedDailyBudget: 97 })).toMatchObject({ ok: false, reason: expect.stringContaining('2×') })
  })

  it('treats an open sync/coverage exception as a global write halt', () => {
    expect(hasOpenCampaignDataHalt([item({
      [CAMPAIGN_EXCEPTION_COLUMNS.exceptionType]: 'Sync Stale / Coverage Drop',
      [CAMPAIGN_EXCEPTION_COLUMNS.status]: 'Open',
    })])).toBe(true)
    expect(hasOpenCampaignDataHalt([item({
      [CAMPAIGN_EXCEPTION_COLUMNS.exceptionType]: 'Sync Stale / Coverage Drop',
      [CAMPAIGN_EXCEPTION_COLUMNS.status]: 'Actioned',
    })])).toBe(false)
  })

  it('uses the policy rule to detect passed offer deadlines in rolling ad copy', () => {
    const now = new Date('2026-08-21T00:00:00.000Z')
    expect(findExpiredOfferDate('Stamp Duty Sale offer ends 31 July', now)).toBe('2026-07-31')
    expect(findExpiredOfferDate('Drive-away offer valid until 31/07/2026', now)).toBe('2026-07-31')
    expect(findExpiredOfferDate('Offer valid until September 30', now)).toBeNull()
    expect(findExpiredOfferDate('Model year 2025 — enquire now', now)).toBeNull()
    expect(findExpiredOfferDate('Offer valid until 30 September 2026. Artwork updated 31 July 2026.', now)).toBeNull()
  })

  it('blocks legacy OAuth grants until both write scopes are re-consented', () => {
    expect(hasMondayAutomationWriteScopes({ authMethod: 'oauth', grantedScopes: ['boards:read'] })).toBe(false)
    expect(hasMondayAutomationWriteScopes({ authMethod: 'oauth', grantedScopes: ['boards:write', 'updates:write'] })).toBe(true)
    expect(hasMondayAutomationWriteScopes({ authMethod: 'token', grantedScopes: [] })).toBe(true)
  })
})
