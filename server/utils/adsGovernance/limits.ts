// server/utils/adsGovernance/limits.ts
// Hard limits + global kill switch for AUTOMATED ad-account execution.
//
// `evaluateAutomationLimits` is pure. `reserveAutomatedExecution` is the DB-backed gate every automated
// execution must pass: it re-reads the kill switch and limits inside a transaction, serialises per
// account with an advisory lock, and records a `reserved` ledger row only when every check passes.
// Any storage failure refuses (fail closed). Manual, human-approved executions are NOT gated here —
// their gates are the independent review boundaries.
import type { H3Event } from 'h3'
import { queryOneFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { resolveAdsGovernanceConfig } from './config'
import { DEFAULT_BUSINESS_WINDOW, isWithinBusinessHours, type BusinessWindow } from './businessTime'
import { ADS_TIER_REQUIREMENTS, classifyAdsActionRisk, type AdsRiskTier } from './riskTiers'

export type AutomationRefusalCode
  = | 'ADS_GOVERNANCE_DISABLED'
    | 'ADS_AUTOMATION_KILL_SWITCH'
    | 'ADS_AUTOMATION_CONTROLS_UNAVAILABLE'
    | 'ADS_TIER_NOT_AUTOMATABLE'
    | 'ADS_OUTSIDE_BUSINESS_HOURS'
    | 'ADS_ACCOUNT_DAILY_CHANGE_LIMIT'
    | 'ADS_BUDGET_CHANGE_LIMIT'
    | 'ADS_BUDGET_INVALID'

export interface AutomationControls {
  killSwitchEngaged: boolean
  killSwitchReason: string | null
  maxBudgetChangePct: number
  maxChangesPerAccountPerDay: number
  businessWindow: BusinessWindow
}

export interface AutomationActionFacts {
  family: string
  /** Proposed budget change, if the family changes a campaign budget. */
  budget?: { before: number, after: number }
}

export interface AutomationUsageToday {
  /** Automated changes already reserved/succeeded today (local day) for this account. */
  accountChanges: number
  /** First recorded `budget_before` today for this campaign (the daily baseline), if any. */
  campaignBudgetBaseline: number | null
}

export type AutomationDecision
  = | { allowed: true, tier: AdsRiskTier }
    | { allowed: false, code: AutomationRefusalCode, tier: AdsRiskTier, message: string }

const refuse = (code: AutomationRefusalCode, tier: AdsRiskTier, message: string): AutomationDecision => ({ allowed: false, code, tier, message })

/** Pure evaluation of every hard limit. Order: kill switch → tier → window → account cap → budget. */
export function evaluateAutomationLimits(
  controls: AutomationControls,
  action: AutomationActionFacts,
  usage: AutomationUsageToday,
  now: Date
): AutomationDecision {
  const tier = classifyAdsActionRisk(action.family)
  if (controls.killSwitchEngaged) {
    return refuse('ADS_AUTOMATION_KILL_SWITCH', tier, `Automation is stopped by the global kill switch${controls.killSwitchReason ? `: ${controls.killSwitchReason}` : ''}.`)
  }
  if (tier === 'read' || !ADS_TIER_REQUIREMENTS[tier].automatable) {
    return refuse('ADS_TIER_NOT_AUTOMATABLE', tier, `${action.family} (${tier} risk) can never be executed automatically.`)
  }
  if (!isWithinBusinessHours(now, controls.businessWindow)) {
    return refuse('ADS_OUTSIDE_BUSINESS_HOURS', tier, 'Automated changes only run inside the business-hours window.')
  }
  if (usage.accountChanges >= controls.maxChangesPerAccountPerDay) {
    return refuse('ADS_ACCOUNT_DAILY_CHANGE_LIMIT', tier, `This account already had ${usage.accountChanges} automated change(s) today.`)
  }
  if (action.budget) {
    const { before, after } = action.budget
    if (![before, after].every(value => Number.isFinite(value) && value >= 0)) {
      return refuse('ADS_BUDGET_INVALID', tier, 'Budget amounts must be finite and non-negative.')
    }
    const baseline = usage.campaignBudgetBaseline ?? before
    if (baseline <= 0) {
      return refuse('ADS_BUDGET_CHANGE_LIMIT', tier, 'A zero baseline budget cannot be changed automatically.')
    }
    // Cumulative against the day's first baseline, so many small steps cannot exceed the cap.
    const pct = Math.abs(after - baseline) / baseline * 100
    if (pct > controls.maxBudgetChangePct + 1e-9) {
      return refuse('ADS_BUDGET_CHANGE_LIMIT', tier, `Budget change of ${pct.toFixed(1)}% exceeds the ${controls.maxBudgetChangePct}% daily limit.`)
    }
  }
  return { allowed: true, tier }
}

interface ControlsRow {
  kill_switch_engaged: boolean
  kill_switch_reason: string | null
  max_budget_change_pct: string | number
  max_changes_per_account_per_day: number
  business_timezone: string
  business_start_hour: number
  business_end_hour: number
  business_days: number[]
}

export function controlsFromRow(row: ControlsRow | null | undefined): AutomationControls | null {
  if (!row) return null
  const days = Array.isArray(row.business_days) ? row.business_days.map(Number) : DEFAULT_BUSINESS_WINDOW.days
  return {
    killSwitchEngaged: row.kill_switch_engaged !== false,
    killSwitchReason: row.kill_switch_reason ?? null,
    maxBudgetChangePct: Number(row.max_budget_change_pct),
    maxChangesPerAccountPerDay: Number(row.max_changes_per_account_per_day),
    businessWindow: {
      timezone: row.business_timezone || DEFAULT_BUSINESS_WINDOW.timezone,
      startHour: Number(row.business_start_hour),
      endHour: Number(row.business_end_hour),
      days
    }
  }
}

const CONTROLS_SQL = `SELECT kill_switch_engaged, kill_switch_reason, max_budget_change_pct, max_changes_per_account_per_day,
  business_timezone, business_start_hour, business_end_hour, business_days FROM ads_automation_controls WHERE id = 'global'`

export async function readAutomationControls(): Promise<AutomationControls | null> {
  return controlsFromRow(await queryOneFresh<ControlsRow>(CONTROLS_SQL))
}

/**
 * True when automation must stop: governance on AND (kill switch engaged OR controls unreadable).
 * With governance off this returns false so the existing, separately-flagged Google Ads automation
 * runners behave exactly as before (dormant hook).
 */
export async function isAdsAutomationHalted(event?: H3Event): Promise<boolean> {
  if (!resolveAdsGovernanceConfig(event).automation) return false
  try {
    const controls = await readAutomationControls()
    return !controls || controls.killSwitchEngaged
  } catch {
    return true
  }
}

export interface ReserveAutomatedExecutionInput {
  ruleId?: string | null
  clientId: string
  platform: 'google_ads' | 'meta'
  accountId: string
  campaignId?: string | null
  family: string
  budget?: { before: number, after: number }
}

export type ReserveResult = { ok: true, executionId: string, tier: AdsRiskTier } | { ok: false, code: AutomationRefusalCode, message: string }

/** DB-backed gate for every automated execution. Refuses with a stable code; never throws for policy. */
export async function reserveAutomatedExecution(
  event: H3Event | undefined,
  input: ReserveAutomatedExecutionInput,
  now: Date = new Date()
): Promise<ReserveResult> {
  if (!resolveAdsGovernanceConfig(event).automation) {
    return { ok: false, code: 'ADS_GOVERNANCE_DISABLED', message: 'Ads automation governance is disabled.' }
  }
  try {
    return await transactionWithoutRetry(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ads-automation:${input.platform}:${input.accountId}`])
      const controls = controlsFromRow((await db.query(`${CONTROLS_SQL} FOR SHARE`)).rows[0] as ControlsRow | undefined)
      if (!controls) return { ok: false, code: 'ADS_AUTOMATION_CONTROLS_UNAVAILABLE', message: 'Automation controls are unavailable.' } as const
      const dayStart = `date_trunc('day', NOW() AT TIME ZONE $3) AT TIME ZONE $3`
      const usage = (await db.query(`SELECT
          COUNT(*) FILTER (WHERE status IN ('reserved','succeeded'))::int AS account_changes,
          (SELECT budget_before FROM ads_automation_executions b WHERE b.platform = $1 AND b.account_id = $2
             AND b.campaign_id IS NOT DISTINCT FROM $4 AND $4::text IS NOT NULL AND b.budget_before IS NOT NULL
             AND b.status IN ('reserved','succeeded') AND b.created_at >= ${dayStart}
           ORDER BY b.created_at ASC LIMIT 1) AS baseline
        FROM ads_automation_executions WHERE platform = $1 AND account_id = $2 AND created_at >= ${dayStart}`,
      [input.platform, input.accountId, controls.businessWindow.timezone, input.campaignId ?? null])).rows[0] as { account_changes: number, baseline: string | null } | undefined
      const decision = evaluateAutomationLimits(controls, { family: input.family, budget: input.budget }, {
        accountChanges: Number(usage?.account_changes ?? 0),
        campaignBudgetBaseline: usage?.baseline == null ? null : Number(usage.baseline)
      }, now)
      if ('code' in decision) return { ok: false, code: decision.code, message: decision.message } as const
      const row = (await db.query(`INSERT INTO ads_automation_executions
          (rule_id, client_id, platform, account_id, campaign_id, family, risk_tier, budget_before, budget_after)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [
        input.ruleId ?? null, input.clientId, input.platform, input.accountId, input.campaignId ?? null,
        input.family, decision.tier, input.budget?.before ?? null, input.budget?.after ?? null
      ])).rows[0] as { id: string }
      return { ok: true, executionId: row.id, tier: decision.tier } as const
    })
  } catch {
    return { ok: false, code: 'ADS_AUTOMATION_CONTROLS_UNAVAILABLE', message: 'Automation controls could not be verified.' }
  }
}

export interface GovernanceActor {
  id: string
  /** Fresh system role (e.g. `owner`). */
  role: string | null | undefined
  /** Fresh permission groups. */
  groups: readonly string[] | null | undefined
}

const STOP_GROUPS = ['MARKETING_MANAGEMENT', 'MANAGEMENT', 'ADMIN']

/** Anyone with manager authority may ENGAGE the stop; only the owner may RELEASE it. */
export function canSetKillSwitch(actor: GovernanceActor, engaged: boolean): boolean {
  if (actor.role === 'owner') return true
  return engaged && STOP_GROUPS.some(group => (actor.groups ?? []).includes(group))
}

/**
 * Engage/release the global kill switch; records an append-only control event in the same transaction.
 * Engaging works even while governance is otherwise disabled (stopping must always be possible).
 */
export async function setAutomationKillSwitch(actor: GovernanceActor, engaged: boolean, reason: string): Promise<AutomationControls> {
  const trimmed = String(reason ?? '').trim()
  if (!trimmed || trimmed.length > 500) throw new Error('ADS_KILL_SWITCH_REASON_REQUIRED')
  if (!canSetKillSwitch(actor, engaged)) throw new Error(engaged ? 'ADS_KILL_SWITCH_MANAGER_REQUIRED' : 'ADS_KILL_SWITCH_OWNER_REQUIRED')
  return transactionWithoutRetry(async (db) => {
    const before = (await db.query(`${CONTROLS_SQL} FOR UPDATE`)).rows[0] as ControlsRow | undefined
    const after = (await db.query(`INSERT INTO ads_automation_controls (id, kill_switch_engaged, kill_switch_reason, updated_by, updated_at)
        VALUES ('global', $1, $2, $3, NOW())
        ON CONFLICT (id) DO UPDATE SET kill_switch_engaged = EXCLUDED.kill_switch_engaged,
          kill_switch_reason = EXCLUDED.kill_switch_reason, updated_by = EXCLUDED.updated_by, updated_at = NOW()
        RETURNING kill_switch_engaged, kill_switch_reason, max_budget_change_pct, max_changes_per_account_per_day,
          business_timezone, business_start_hour, business_end_hour, business_days`, [engaged, trimmed, actor.id])).rows[0] as ControlsRow
    await db.query('INSERT INTO ads_automation_control_events (actor_id, before_state, after_state) VALUES ($1, $2::jsonb, $3::jsonb)',
      [actor.id, before ? JSON.stringify(before) : null, JSON.stringify(after)])
    return controlsFromRow(after)!
  })
}
