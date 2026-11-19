/* eslint-disable @typescript-eslint/no-explicit-any -- partial DB fixtures */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ query: vi.fn(), rows: vi.fn(), one: vi.fn(), config: { automation: false, autoApply: false } }))
vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: m.rows,
  queryOneFresh: m.one,
  transactionWithoutRetry: async (fn: any) => fn({ query: m.query })
}))
vi.mock('~~/server/utils/adsGovernance/config', () => ({ resolveAdsGovernanceConfig: () => m.config }))

const { createAutomationRule, updateAutomationRule, validateAutomationRule, canManageAutomationRules, isRuleActive } = await import('~~/server/utils/adsGovernance/rules')

const clientId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const ruleId = '44444444-4444-4444-8444-444444444444'
const manager = { id: '33333333-3333-4333-8333-333333333333', role: 'account_manager', groups: ['MARKETING_MANAGEMENT'] }
const now = new Date('2026-11-19T00:00:00Z')
const future = '2027-02-01T00:00:00.000Z'
const ruleRow = (overrides: Record<string, unknown> = {}) => ({
  id: ruleId, client_id: clientId, scope: {}, family: 'negative_keywords', risk_tier: 'low', thresholds: {}, mode: 'draft',
  owner_user_id: ownerId, expires_at: future, enabled: true, version: 1, created_by: manager.id, updated_by: manager.id,
  created_at: now.toISOString(), updated_at: now.toISOString(), ...overrides
})
const create = (overrides: Record<string, unknown> = {}) => ({ clientId, family: 'negative_keywords', mode: 'draft', ownerUserId: ownerId, expiresAt: future, reason: 'Wasted search terms', ...overrides })

beforeEach(() => {
  vi.clearAllMocks()
  m.config = { automation: false, autoApply: false }
  // Owner/client existence checks and rule reads/writes all see one row.
  m.query.mockImplementation(async () => ({ rows: [ruleRow()] }))
})

describe('automation rule registry', () => {
  it('is dormant: every write refuses while governance is off and never touches the database', async () => {
    await expect(createAutomationRule(undefined, manager, create(), now)).rejects.toMatchObject({ code: 'ADS_GOVERNANCE_DISABLED' })
    await expect(updateAutomationRule(undefined, manager, { ruleId, expectedVersion: 1, enabled: false, reason: 'Stop it' }, now)).rejects.toMatchObject({ code: 'ADS_GOVERNANCE_DISABLED' })
    expect(m.query).not.toHaveBeenCalled()
  })

  it('rejects auto_apply unless the separate auto-apply switch is on, and always for high risk', async () => {
    m.config = { automation: true, autoApply: false }
    await expect(createAutomationRule(undefined, manager, create({ mode: 'auto_apply' }), now)).rejects.toMatchObject({ code: 'ADS_RULE_AUTO_APPLY_DISABLED' })
    m.config = { automation: true, autoApply: true }
    await expect(createAutomationRule(undefined, manager, create({ mode: 'auto_apply', family: 'remove_campaign' }), now)).rejects.toMatchObject({ code: 'ADS_RULE_TIER_NOT_AUTOMATABLE' })
    expect(m.query).not.toHaveBeenCalled()
  })

  it('requires a manager, an owner, scope and an unexpired bounded review date', async () => {
    m.config = { automation: true, autoApply: false }
    await expect(createAutomationRule(undefined, { ...manager, groups: ['MEDIA_BUYING'] }, create(), now)).rejects.toMatchObject({ code: 'ADS_RULE_MANAGER_REQUIRED' })
    expect(validateAutomationRule({ family: 'budget', mode: 'notify', expiresAt: '2026-11-18T00:00:00Z', now, autoApplyEnabled: false })).toEqual({ ok: false, code: 'ADS_RULE_EXPIRY_REQUIRED' })
    expect(validateAutomationRule({ family: 'budget', mode: 'notify', expiresAt: '2028-11-18T00:00:00Z', now, autoApplyEnabled: false })).toEqual({ ok: false, code: 'ADS_RULE_EXPIRY_TOO_LONG' })
    expect(validateAutomationRule({ family: 'google_ads_list_campaigns', mode: 'notify', expiresAt: future, now, autoApplyEnabled: false })).toEqual({ ok: false, code: 'ADS_RULE_FAMILY_NOT_ACTIONABLE' })
    expect(validateAutomationRule({ family: 'budget', mode: 'draft', expiresAt: future, now, autoApplyEnabled: false })).toEqual({ ok: true, tier: 'medium' })
  })

  it('creates a draft rule with a server-derived tier (version history is written by the DB trigger)', async () => {
    m.config = { automation: true, autoApply: false }
    const rule = await createAutomationRule(undefined, manager, create(), now)
    expect(rule).toMatchObject({ id: ruleId, riskTier: 'low', mode: 'draft', ownerUserId: ownerId, version: 1 })
    const insert = m.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO ads_automation_rules'))!
    expect(insert[1]).toEqual(expect.arrayContaining(['low', manager.id, 'Wasted search terms']))
  })

  it('optimistic versioning: a stale expectedVersion is refused', async () => {
    m.config = { automation: true, autoApply: false }
    m.query.mockImplementation(async () => ({ rows: [ruleRow({ version: 3 })] }))
    await expect(updateAutomationRule(undefined, manager, { ruleId, expectedVersion: 2, mode: 'notify', reason: 'Downgrade' }, now)).rejects.toMatchObject({ code: 'ADS_RULE_VERSION_CONFLICT' })
  })

  it('disabling is always allowed, even for an already-expired rule', async () => {
    m.config = { automation: true, autoApply: false }
    m.query.mockImplementation(async (sql: string) => ({ rows: [ruleRow({ expires_at: '2026-01-01T00:00:00Z', enabled: sql.startsWith('UPDATE') ? false : true })] }))
    await expect(updateAutomationRule(undefined, manager, { ruleId, expectedVersion: 1, enabled: false, reason: 'Retire' }, now)).resolves.toMatchObject({ enabled: false })
  })

  it('authority and activity helpers', () => {
    expect(canManageAutomationRules({ id: 'x', role: 'owner', groups: [] })).toBe(true)
    expect(canManageAutomationRules({ id: 'x', role: 'admin', groups: ['ADMIN'] })).toBe(true)
    expect(canManageAutomationRules({ id: 'x', role: 'media_buyer', groups: ['MANAGEMENT'] })).toBe(false)
    expect(isRuleActive({ enabled: true, expiresAt: future }, now.getTime())).toBe(true)
    expect(isRuleActive({ enabled: true, expiresAt: '2026-01-01T00:00:00Z' }, now.getTime())).toBe(false)
  })
})
