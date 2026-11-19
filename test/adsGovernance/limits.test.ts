/* eslint-disable @typescript-eslint/no-explicit-any -- partial DB fixtures */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), config: { automation: false, autoApply: false } }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: m.queryOne,
  transactionWithoutRetry: async (fn: any) => fn({ query: m.query })
}))
vi.mock('~~/server/utils/adsGovernance/config', () => ({ resolveAdsGovernanceConfig: () => m.config }))

const {
  evaluateAutomationLimits, reserveAutomatedExecution, isAdsAutomationHalted, canSetKillSwitch, setAutomationKillSwitch
} = await import('~~/server/utils/adsGovernance/limits')

const window = { timezone: 'Australia/Melbourne', startHour: 9, endHour: 17, days: [1, 2, 3, 4, 5] }
const controls = (overrides: Record<string, unknown> = {}) => ({
  killSwitchEngaged: false, killSwitchReason: null, maxBudgetChangePct: 20, maxChangesPerAccountPerDay: 3, businessWindow: window, ...overrides
})
const thu10 = new Date('2026-11-18T23:00:00Z') // Thu 10:00 AEDT
const sat10 = new Date('2026-11-20T23:00:00Z') // Sat 10:00 AEDT
const usage = (overrides: Record<string, unknown> = {}) => ({ accountChanges: 0, campaignBudgetBaseline: null, ...overrides })

const controlsRow = (overrides: Record<string, unknown> = {}) => ({
  kill_switch_engaged: false, kill_switch_reason: null, max_budget_change_pct: '20.00', max_changes_per_account_per_day: 3,
  business_timezone: 'Australia/Melbourne', business_start_hour: 9, business_end_hour: 17, business_days: [1, 2, 3, 4, 5], ...overrides
})
const clientId = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  m.config = { automation: false, autoApply: false }
})

describe('evaluateAutomationLimits (pure)', () => {
  it('allows a low-risk change inside every limit', () => {
    expect(evaluateAutomationLimits(controls(), { family: 'negative_keywords' }, usage(), thu10)).toEqual({ allowed: true, tier: 'low' })
  })

  it('the kill switch refuses before anything else, with a clear code', () => {
    const decision = evaluateAutomationLimits(controls({ killSwitchEngaged: true, killSwitchReason: 'Incident' }), { family: 'negative_keywords' }, usage(), thu10)
    expect(decision).toMatchObject({ allowed: false, code: 'ADS_AUTOMATION_KILL_SWITCH' })
    expect((decision as any).message).toContain('Incident')
  })

  it('high and read families are never automatable', () => {
    expect(evaluateAutomationLimits(controls(), { family: 'remove_campaign' }, usage(), thu10)).toMatchObject({ allowed: false, code: 'ADS_TIER_NOT_AUTOMATABLE', tier: 'high' })
    expect(evaluateAutomationLimits(controls(), { family: 'unknown_family' }, usage(), thu10)).toMatchObject({ allowed: false, code: 'ADS_TIER_NOT_AUTOMATABLE' })
    expect(evaluateAutomationLimits(controls(), { family: 'google_ads_list_campaigns' }, usage(), thu10)).toMatchObject({ allowed: false, code: 'ADS_TIER_NOT_AUTOMATABLE' })
  })

  it('refuses outside the Melbourne business-hours window', () => {
    expect(evaluateAutomationLimits(controls(), { family: 'negative_keywords' }, usage(), sat10)).toMatchObject({ allowed: false, code: 'ADS_OUTSIDE_BUSINESS_HOURS' })
  })

  it('caps automated changes per account per day', () => {
    expect(evaluateAutomationLimits(controls(), { family: 'negative_keywords' }, usage({ accountChanges: 2 }), thu10)).toMatchObject({ allowed: true })
    expect(evaluateAutomationLimits(controls(), { family: 'negative_keywords' }, usage({ accountChanges: 3 }), thu10)).toMatchObject({ allowed: false, code: 'ADS_ACCOUNT_DAILY_CHANGE_LIMIT' })
  })

  it('caps the cumulative ±% budget change per campaign per day against the day baseline', () => {
    expect(evaluateAutomationLimits(controls(), { family: 'budget', budget: { before: 100, after: 120 } }, usage(), thu10)).toMatchObject({ allowed: true, tier: 'medium' })
    expect(evaluateAutomationLimits(controls(), { family: 'budget', budget: { before: 100, after: 80 } }, usage(), thu10)).toMatchObject({ allowed: true })
    expect(evaluateAutomationLimits(controls(), { family: 'budget', budget: { before: 100, after: 120.5 } }, usage(), thu10)).toMatchObject({ allowed: false, code: 'ADS_BUDGET_CHANGE_LIMIT' })
    // Two +15% steps: the second is measured from the 100 baseline (132.25 → +32%).
    expect(evaluateAutomationLimits(controls(), { family: 'budget', budget: { before: 115, after: 132.25 } }, usage({ campaignBudgetBaseline: 100 }), thu10)).toMatchObject({ allowed: false, code: 'ADS_BUDGET_CHANGE_LIMIT' })
    expect(evaluateAutomationLimits(controls(), { family: 'budget', budget: { before: 0, after: 10 } }, usage(), thu10)).toMatchObject({ allowed: false, code: 'ADS_BUDGET_CHANGE_LIMIT' })
    expect(evaluateAutomationLimits(controls(), { family: 'budget', budget: { before: Number.NaN, after: 10 } }, usage(), thu10)).toMatchObject({ allowed: false, code: 'ADS_BUDGET_INVALID' })
  })
})

describe('DB-backed gate', () => {
  const input = { clientId, platform: 'google_ads' as const, accountId: '1234567890', campaignId: '10', family: 'budget', budget: { before: 100, after: 110 } }

  it('is dormant: refuses with ADS_GOVERNANCE_DISABLED and never touches the database while off', async () => {
    await expect(reserveAutomatedExecution(undefined, input, thu10)).resolves.toMatchObject({ ok: false, code: 'ADS_GOVERNANCE_DISABLED' })
    await expect(isAdsAutomationHalted()).resolves.toBe(false)
    expect(m.query).not.toHaveBeenCalled()
    expect(m.queryOne).not.toHaveBeenCalled()
  })

  it('checks the kill switch row on every automated execution and records nothing when engaged', async () => {
    m.config = { automation: true, autoApply: false }
    m.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('FROM ads_automation_controls') ? [controlsRow({ kill_switch_engaged: true })] : [{ account_changes: 0, baseline: null }] }))
    await expect(reserveAutomatedExecution(undefined, input, thu10)).resolves.toMatchObject({ ok: false, code: 'ADS_AUTOMATION_KILL_SWITCH' })
    expect(m.query.mock.calls.some(([sql]) => /INSERT INTO ads_automation_executions/.test(sql))).toBe(false)
  })

  it('reserves a ledger row under a per-account lock when every limit passes', async () => {
    m.config = { automation: true, autoApply: false }
    m.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes('FROM ads_automation_controls')
        ? [controlsRow()]
        : sql.includes('INSERT INTO ads_automation_executions') ? [{ id: 'exec-1' }] : [{ account_changes: 1, baseline: '100' }]
    }))
    await expect(reserveAutomatedExecution(undefined, input, thu10)).resolves.toEqual({ ok: true, executionId: 'exec-1', tier: 'medium' })
    expect(m.query.mock.calls[0]?.[1]).toEqual(['ads-automation:google_ads:1234567890'])
  })

  it('fails closed when the controls row is missing or storage errors', async () => {
    m.config = { automation: true, autoApply: false }
    m.query.mockResolvedValue({ rows: [] })
    await expect(reserveAutomatedExecution(undefined, input, thu10)).resolves.toMatchObject({ ok: false, code: 'ADS_AUTOMATION_CONTROLS_UNAVAILABLE' })
    m.query.mockRejectedValue(new Error('db down'))
    await expect(reserveAutomatedExecution(undefined, input, thu10)).resolves.toMatchObject({ ok: false, code: 'ADS_AUTOMATION_CONTROLS_UNAVAILABLE' })
    m.queryOne.mockResolvedValue(null)
    await expect(isAdsAutomationHalted()).resolves.toBe(true)
    m.queryOne.mockRejectedValue(new Error('db down'))
    await expect(isAdsAutomationHalted()).resolves.toBe(true)
    m.queryOne.mockResolvedValue(controlsRow())
    await expect(isAdsAutomationHalted()).resolves.toBe(false)
  })
})

describe('kill switch authority', () => {
  const actor = (role: string, groups: string[] = []) => ({ id: '33333333-3333-4333-8333-333333333333', role, groups })
  it('managers may engage; only the owner may release', () => {
    expect(canSetKillSwitch(actor('account_manager', ['MARKETING_MANAGEMENT']), true)).toBe(true)
    expect(canSetKillSwitch(actor('account_manager', ['MARKETING_MANAGEMENT']), false)).toBe(false)
    expect(canSetKillSwitch(actor('admin', ['ADMIN']), false)).toBe(false)
    expect(canSetKillSwitch(actor('owner'), false)).toBe(true)
    expect(canSetKillSwitch(actor('media_buyer', ['MEDIA_BUYING']), true)).toBe(false)
  })

  it('writes the control row and an append-only event together', async () => {
    m.query.mockImplementation(async () => ({ rows: [controlsRow({ kill_switch_engaged: true, kill_switch_reason: 'Stop' })] }))
    await expect(setAutomationKillSwitch(actor('owner'), true, 'Stop')).resolves.toMatchObject({ killSwitchEngaged: true })
    expect(m.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO ads_automation_control_events'))).toBe(true)
    await expect(setAutomationKillSwitch(actor('admin', ['ADMIN']), false, 'Resume')).rejects.toThrow('ADS_KILL_SWITCH_OWNER_REQUIRED')
    await expect(setAutomationKillSwitch(actor('owner'), false, ' ')).rejects.toThrow('ADS_KILL_SWITCH_REASON_REQUIRED')
  })
})
