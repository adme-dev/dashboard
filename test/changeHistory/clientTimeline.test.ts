import { describe, expect, it, vi } from 'vitest'
import {
  CHANGE_HISTORY_ORIGINS,
  CHANGE_HISTORY_SQL,
  ChangeHistoryInputError,
  agencyMidnight,
  compareChangeEntries,
  decodeChangeHistoryCursor,
  encodeChangeHistoryCursor,
  getClientChangeHistory,
  normalizeActionAudit,
  normalizeBindingEvent,
  normalizeBudgetAudit,
  normalizeGoogleAdsPlan,
  normalizePendingAction,
  type ChangeHistoryOrigin
} from '~~/server/utils/changeHistory/clientTimeline'

const CLIENT = '3b095707-1e86-454a-9280-a504c1ccddc5'
const USER = '672c741f-646c-494e-947b-39143a2a0453'
const APPROVER = '11111111-1111-4111-8111-111111111111'
const CONNECTION = '415a8456-527f-441b-839c-dfdd5405ef8e'
const NOW = new Date('2026-11-19T04:00:00Z')

describe('normalization per source', () => {
  it('ai_pending_actions: department budget proposal → before/after, actor name, mcp channel, expiry derived', () => {
    const entry = normalizePendingAction({
      id: 'ac28975e-70fe-4bee-b56f-be8886684cd7',
      at: '2026-11-18T04:09:22.793258Z',
      client_id: CLIENT,
      user_id: USER,
      actor_name: 'Garrix Lopena',
      tool_name: 'department_budget_allocation',
      source: 'mcp',
      status: 'proposed',
      expires_at: '2026-11-19T04:09:22Z',
      resolved_payload: {
        clientId: CLIENT,
        input: {
          note: 'Nov 2026 budgets synced from monday',
          changes: [{ spendId: 'e08e71c7-bdd7-46c1-ae78-51f341051a3a', budget: 1000, expectedBudget: 0, rolling: true }]
        }
      },
      audit_outcome: 'proposed',
      audit_risk_tier: 'confirm'
    }, NOW)
    expect(entry).toMatchObject({
      id: 'ai_pending:ac28975e-70fe-4bee-b56f-be8886684cd7',
      origin: 'ai_pending_actions',
      clientId: CLIENT,
      actor: { userId: USER, name: 'Garrix Lopena', type: 'user' },
      source: 'mcp',
      actionFamily: 'budget',
      risk: 'confirm',
      status: 'proposed',
      rawStatus: 'proposed',
      approver: null,
      providerRequestId: null,
      before: [{ mediaSpendId: 'e08e71c7-bdd7-46c1-ae78-51f341051a3a', budget: 0 }],
      after: [{ mediaSpendId: 'e08e71c7-bdd7-46c1-ae78-51f341051a3a', budget: 1000, rolling: true }]
    })
    expect(entry.summary).toContain('Nov 2026 budgets')

    const later = normalizePendingAction({ id: 'ac28975e-70fe-4bee-b56f-be8886684cd7', at: 'x', client_id: CLIENT, status: 'proposed', expires_at: '2026-11-19T03:00:00Z', resolved_payload: {} }, NOW)
    expect(later.status).toBe('expired')
  })

  it('ai_pending_actions: executed single budget with approver, rollback ref and audit failure override', () => {
    const base = {
      id: 'aaaaaaaa-1111-4111-8111-111111111111', at: '2026-08-20T00:00:00.000000Z', client_id: CLIENT, user_id: USER,
      tool_name: 'propose_set_campaign_budget', source: 'god_mode_preparation', status: 'executed',
      confirmed_by: APPROVER, approver_name: 'Paul', result_ref: 'ms-1',
      resolved_payload: { kind: 'campaign_budget_allocation', campaignName: 'PMax', mediaSpendId: 'ms-1', currentBudgetAllocated: null, proposedBudgetAllocated: 2900, alertId: 'alert-7' },
      audit_outcome: 'executed', audit_rollback_ref: 'budget:ms-1:prev=null'
    }
    const entry = normalizePendingAction(base, NOW)
    expect(entry).toMatchObject({
      source: 'mcp', status: 'executed', approver: { userId: APPROVER, name: 'Paul' },
      before: { budget: null, campaign: 'PMax' }, after: { budget: 2900, campaign: 'PMax' },
      triggerRef: 'alertId:alert-7', rollbackRef: 'budget:ms-1:prev=null', resultRef: 'ms-1'
    })
    expect(normalizePendingAction({ ...base, audit_outcome: 'failed' }, NOW).status).toBe('failed')
    expect(normalizePendingAction({ ...base, status: 'rejected', audit_outcome: null }, NOW).status).toBe('rejected')
  })

  it('ai_pending_actions: bulk allocations are narrowed to the requested client\'s media spend rows', () => {
    const entry = normalizePendingAction({
      id: 'bbbbbbbb-1111-4111-8111-111111111111', at: '2026-08-26T00:00:00.000000Z', client_id: CLIENT, status: 'executed',
      tool_name: 'propose_bulk_set_campaign_budgets', source: 'god_mode_preparation',
      client_media_spend_ids: ['ms-mine'],
      resolved_payload: { kind: 'bulk_campaign_budget_allocation', allocations: [
        { mediaSpendId: 'ms-mine', campaignName: 'Mine', currentBudgetAllocated: 100, proposedBudgetAllocated: 200 },
        { mediaSpendId: 'ms-other', campaignName: 'Other client', currentBudgetAllocated: 1, proposedBudgetAllocated: 2 }
      ] }
    }, NOW)
    expect(entry.before).toEqual([{ mediaSpendId: 'ms-mine', campaign: 'Mine', budget: 100 }])
    expect(entry.after).toEqual([{ mediaSpendId: 'ms-mine', campaign: 'Mine', budget: 200 }])
  })

  it('ai_action_audit: proposal-less write → executed/failed, approver, rollback; no before/after (gap)', () => {
    const entry = normalizeActionAudit({
      id: 'cccccccc-1111-4111-8111-111111111111', at: '2026-09-01T00:00:00.000000Z', client_id: CLIENT, user_id: USER, actor_name: 'Garrix Lopena',
      confirmed_by: APPROVER, approver_name: 'Paul', tool_name: 'propose_proof_status', risk_tier: 'confirm',
      payload: { source: 'chat', argKeys: ['proofId'] }, outcome: 'rolled_back', rollback_ref: 'proof:1', result_ref: 'proof:1'
    })
    expect(entry).toMatchObject({ origin: 'ai_action_audit', status: 'cancelled', source: 'chat', risk: 'confirm', rollbackRef: 'proof:1', before: null, after: null, approver: { name: 'Paul' } })
  })

  it('google_ads_action_plans: before/after, provider request id, verification, reviewer approver, automation trigger', () => {
    const row = {
      id: 'dddddddd-1111-4111-8111-111111111111', at: '2026-11-01T00:00:00.000000Z', client_id: CLIENT, connection_id: CONNECTION,
      customer_id: '2371847203', account_name: 'Knox GWM Haval', actor_id: USER, actor_name: 'Garrix Lopena', source: 'automation',
      tool_name: 'google_ads_plan_add_negative_keywords', resource_type: 'campaign_criterion', operation: 'create',
      resource_name: 'customers/2371847203/campaigns/1', current_state: { negatives: [] }, desired_state: { negatives: ['free'] },
      risk_tier: 'low', policy_version: 'v3', policy_decision: { ruleId: 'rule-9' }, status: 'verified',
      provider_request_id: 'req-abc', verification_summary: { status: 'verified' }, result_metadata: { rollbackPlanId: 'plan-undo' },
      reviewed_by: APPROVER, reviewer_name: 'Paul', updated_at: '2026-11-01T00:05:00.000000Z'
    }
    expect(normalizeGoogleAdsPlan(row)).toMatchObject({
      id: 'gads_plan:dddddddd-1111-4111-8111-111111111111', origin: 'google_ads_action_plans', status: 'verified', rawStatus: 'verified',
      account: { connectionId: CONNECTION, platform: 'google', customerId: '2371847203', label: 'Knox GWM Haval' },
      actionFamily: 'negative_keywords', risk: 'low', source: 'automation',
      before: { negatives: [] }, after: { negatives: ['free'] }, approver: { userId: APPROVER, name: 'Paul' },
      providerRequestId: 'req-abc', triggerRef: 'ruleId:rule-9', rollbackRef: 'plan-undo', verification: { status: 'verified' }
    })
    expect(normalizeGoogleAdsPlan({ ...row, status: 'provider_rejected' }).status).toBe('failed')
    expect(normalizeGoogleAdsPlan({ ...row, status: 'pending_approval' }).status).toBe('proposed')
    expect(normalizeGoogleAdsPlan({ ...row, status: 'cancelled', rejection_reason: 'Not now' }).status).toBe('rejected')
    // Approval via the linked proposal when there is no independent reviewer.
    expect(normalizeGoogleAdsPlan({ ...row, reviewed_by: null, approval_confirmed_by: APPROVER, approval_confirmed_name: 'Paul' }).approver).toEqual({ userId: APPROVER, name: 'Paul', type: 'user' })
  })

  it('budget_audit_log: before → after, migration vs mcp batch vs ui channel', () => {
    const base = {
      id: 'eeeeeeee-1111-4111-8111-111111111111', at: '2026-08-22T12:50:44.856971Z', client_id: CLIENT, media_spend_id: 'ms-1',
      previous_budget: '0', new_budget: '1500.50', changed_by: USER, actor_name: 'Paul Giurin', connection_id: CONNECTION,
      platform: 'meta', campaign_name: 'Leads', period: '2026-08'
    }
    const ui = normalizeBudgetAudit({ ...base, note: null })
    expect(ui).toMatchObject({ origin: 'budget_audit_log', status: 'executed', source: 'ui', actionFamily: 'budget', before: { budget: 0 }, after: { budget: 1500.5 }, actor: { name: 'Paul Giurin' } })
    expect(normalizeBudgetAudit({ ...base, note: 'Imported from Latest Budget Tracker - Meta.csv' }).source).toBe('migration')
    const batch = normalizeBudgetAudit({ ...base, note: 'Reconcile [batch:58dfd0d0-4a3f-4a26-a830-8bbbc371665d]' })
    expect(batch).toMatchObject({ source: 'mcp', triggerRef: 'batch:58dfd0d0-4a3f-4a26-a830-8bbbc371665d' })
  })

  it('google_ads_account_binding_events: migration actor is a system actor, evidence becomes after', () => {
    const entry = normalizeBindingEvent({
      id: 'ffffffff-1111-4111-8111-111111111111', at: '2026-11-19T00:19:49.951467Z', client_id: CLIENT, binding_id: 'b-1',
      event_type: 'disabled', actor_type: 'migration', actor_id: '511', connection_id: CONNECTION, operating_customer_id: '2581214895',
      account_name: 'Astoria GWM', evidence: { reason: 'account_owner_changed', toClientId: 'other-client', accountRole: 'dealer' }
    })
    expect(entry).toMatchObject({
      origin: 'google_ads_account_binding_events', source: 'migration', actionFamily: 'account_binding', rawStatus: 'disabled',
      actor: { userId: null, name: 'Migration 511', type: 'system' },
      after: { eventType: 'disabled', accountRole: 'dealer', toClientId: 'other-client' }
    })
    expect(entry.summary).toContain('account owner changed')
  })

  it('never surfaces an email-shaped value as a display name', () => {
    const entry = normalizeBudgetAudit({ id: 'eeeeeeee-1111-4111-8111-111111111112', at: 'x', client_id: CLIENT, changed_by: USER, actor_name: 'paul@example.com', new_budget: 1 })
    expect(entry.actor).toEqual({ userId: USER, name: null, type: 'user' })
    expect(JSON.stringify(entry)).not.toContain('@')
  })
})

// ---------------------------------------------------------------------------------------------------
// An in-memory stand-in for the per-source SQL that applies the same window ($2–$6) the SQL does.

type Fixture = Record<string, any> & { at: string, entry_id: string }
const PREFIX: Record<ChangeHistoryOrigin, string> = {
  ai_pending_actions: 'ai_pending:',
  ai_action_audit: 'ai_audit:',
  google_ads_action_plans: 'gads_plan:',
  budget_audit_log: 'budget:',
  google_ads_account_binding_events: 'gads_binding:'
}
function originOf(sql: string): ChangeHistoryOrigin {
  return CHANGE_HISTORY_ORIGINS.find(origin => CHANGE_HISTORY_SQL[origin] === sql)!
}
function fakeDb(fixtures: Partial<Record<ChangeHistoryOrigin, Fixture[]>>) {
  const calls: Array<{ origin: ChangeHistoryOrigin, params: unknown[] }> = []
  const queryRows = vi.fn(async (sql: string, params: unknown[]) => {
    const origin = originOf(sql)
    calls.push({ origin, params })
    const [, start, end, cursorAt, cursorId, limit] = params as [string, string | null, string | null, string | null, string | null, number]
    return (fixtures[origin] ?? [])
      .filter(row => (!start || row.at >= start.replace(/\.\d{3}Z$/, '.000000Z')) && (!end || row.at < end.replace(/\.\d{3}Z$/, '.000000Z')))
      .filter(row => !cursorAt || row.at < cursorAt || (row.at === cursorAt && row.entry_id < cursorId!))
      .sort((a, b) => compareChangeEntries({ at: a.at, id: a.entry_id }, { at: b.at, id: b.entry_id }))
      .slice(0, limit)
  })
  return { queryRows: queryRows as any, calls }
}

function budgetRow(n: number, at: string): Fixture {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  return { id, at, entry_id: `budget:${id}`, client_id: CLIENT, new_budget: n, previous_budget: n - 1 }
}
function bindingRow(n: number, at: string): Fixture {
  const id = `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`
  return { id, at, entry_id: `gads_binding:${id}`, client_id: CLIENT, event_type: 'seeded', actor_type: 'migration', actor_id: '511', evidence: {} }
}

describe('ordering and cursor pagination', () => {
  const tie = '2026-11-19T00:32:21.805977Z'
  const fixtures = {
    budget_audit_log: [budgetRow(1, '2026-08-20T07:47:24.438483Z'), budgetRow(2, '2026-08-22T12:50:44.856971Z'), budgetRow(3, tie), budgetRow(4, '2026-10-01T00:00:00.000000Z')],
    google_ads_account_binding_events: [bindingRow(1, tie), bindingRow(2, tie), bindingRow(3, '2026-09-01T00:00:00.000001Z')]
  }

  it('merges sources newest-first with a stable id tiebreak and walks every page exactly once', async () => {
    const db = fakeDb(fixtures)
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const page = await getClientChangeHistory({ clientId: CLIENT, limit: 2, cursor }, { ...db, now: () => NOW })
      seen.push(...page.entries.map(entry => entry.id))
      expect(page.entries.length).toBeLessThanOrEqual(2)
      cursor = page.nextCursor
      expect(page.more).toBe(cursor !== null)
      pages++
    } while (cursor && pages < 20)

    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
    const all = await getClientChangeHistory({ clientId: CLIENT, limit: 100 }, db)
    expect(all.entries.map(entry => entry.id)).toEqual(seen)
    // Equal timestamps (one migration statement) order by id descending, deterministically.
    expect(seen.slice(0, 3)).toEqual([
      `gads_binding:${bindingRow(2, tie).id}`,
      `gads_binding:${bindingRow(1, tie).id}`,
      `budget:${budgetRow(3, tie).id}`
    ])
    expect(all.more).toBe(false)
    expect(all.nextCursor).toBeNull()
  })

  it('passes one identical parameter layout to every source and fetches limit + 1', async () => {
    const db = fakeDb(fixtures)
    await getClientChangeHistory({ clientId: CLIENT.toUpperCase(), connectionId: CONNECTION, limit: 5 }, db)
    expect(db.calls.map(call => call.origin).sort()).toEqual([...CHANGE_HISTORY_ORIGINS].sort())
    for (const call of db.calls) expect(call.params).toEqual([CLIENT, null, null, null, null, 6, CONNECTION])
  })

  it('every source statement references all seven parameters and the shared keyset window', () => {
    for (const origin of CHANGE_HISTORY_ORIGINS) {
      const sql = CHANGE_HISTORY_SQL[origin]
      for (let n = 1; n <= 7; n++) expect(sql).toContain(`$${n}`)
      expect(sql).toContain('ORDER BY src.at_ts DESC, src.entry_id COLLATE "C" DESC')
      expect(sql).toContain(`'${PREFIX[origin]}'`)
      expect(sql).not.toMatch(/\bemail\b/i)
    }
  })

  it('applies the inclusive agency-local date range', async () => {
    const db = fakeDb(fixtures)
    const page = await getClientChangeHistory({ clientId: CLIENT, startDate: '2026-08-21', endDate: '2026-08-31', limit: 50 }, db)
    expect(page.entries.map(entry => entry.id)).toEqual([`budget:${budgetRow(2, '').id}`])
    const [, start, end] = db.calls[0]!.params
    expect(start).toBe(agencyMidnight('2026-08-21'))
    expect(end).toBe(agencyMidnight('2026-09-01'))
    expect(agencyMidnight('2026-08-21')).toBe('2026-08-20T14:00:00.000Z') // AEST (UTC+10)
    expect(agencyMidnight('2026-11-19')).toBe('2026-11-18T13:00:00.000Z') // AEDT (UTC+11)
  })

  it('restricts to requested sources and rejects bad input', async () => {
    const db = fakeDb(fixtures)
    const page = await getClientChangeHistory({ clientId: CLIENT, origins: ['budget_audit_log'] }, db)
    expect(page.origins).toEqual(['budget_audit_log'])
    expect(page.entries.every(entry => entry.origin === 'budget_audit_log')).toBe(true)
    await expect(getClientChangeHistory({ clientId: 'nope' }, db)).rejects.toBeInstanceOf(ChangeHistoryInputError)
    await expect(getClientChangeHistory({ clientId: CLIENT, cursor: 'garbage' }, db)).rejects.toBeInstanceOf(ChangeHistoryInputError)
    await expect(getClientChangeHistory({ clientId: CLIENT, startDate: '2026-09-02', endDate: '2026-09-01' }, db)).rejects.toBeInstanceOf(ChangeHistoryInputError)
    await expect(getClientChangeHistory({ clientId: CLIENT, connectionId: 'x' }, db)).rejects.toBeInstanceOf(ChangeHistoryInputError)
  })

  it('round-trips the cursor with microsecond precision', () => {
    const cursor = encodeChangeHistoryCursor({ at: tie, id: `budget:${budgetRow(3, tie).id}` })
    expect(decodeChangeHistoryCursor(cursor)).toEqual({ at: tie, id: `budget:${budgetRow(3, tie).id}` })
    expect(decodeChangeHistoryCursor(null)).toBeNull()
  })
})
