// server/utils/adsGovernance/rules.ts
// Automation rule registry. Every rule has a named owner, client scope, thresholds, a mode
// (notify → draft → auto_apply) and an expiry/review date. Version history is written by a database
// trigger on every insert/update (migration 515), so no code path can change a rule without a record.
//
// DORMANT: writes refuse unless ADS_GOVERNANCE automation is on. `auto_apply` additionally requires the
// separate autoApply switch, and is never allowed for high-risk families. No auto-apply EXECUTION path
// exists here — registering a rule changes nothing in any provider account.
import type { H3Event } from 'h3'
import { z } from 'zod'
import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { resolveAdsGovernanceConfig } from './config'
import { ADS_TIER_REQUIREMENTS, classifyAdsActionRisk, type AdsRiskTier } from './riskTiers'
import type { GovernanceActor } from './limits'

export type AutomationRuleMode = 'notify' | 'draft' | 'auto_apply'

export interface AutomationRule {
  id: string
  clientId: string
  scope: Record<string, unknown>
  family: string
  riskTier: AdsRiskTier
  thresholds: Record<string, unknown>
  mode: AutomationRuleMode
  ownerUserId: string
  expiresAt: string
  enabled: boolean
  version: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface AutomationRuleVersion {
  id: string
  ruleId: string
  version: number
  changeType: 'created' | 'updated' | 'enabled' | 'disabled'
  actorId: string
  reason: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown>
  createdAt: string
}

export class AutomationRuleError extends Error {
  constructor(public code: string, message = code) {
    super(message)
  }
}

const MAX_RULE_LIFETIME_DAYS = 366
const Json = z.record(z.string(), z.unknown()).refine(value => JSON.stringify(value).length <= 16_384, 'Too large')
const Uuid = z.string().uuid()
const Reason = z.string().trim().min(3).max(500)

export const CreateRuleSchema = z.strictObject({
  clientId: Uuid,
  scope: Json.default({}),
  family: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{0,99}$/),
  thresholds: Json.default({}),
  mode: z.enum(['notify', 'draft', 'auto_apply']),
  ownerUserId: Uuid,
  expiresAt: z.string().datetime({ offset: true }),
  reason: Reason
})

export const UpdateRuleSchema = z.strictObject({
  ruleId: Uuid,
  expectedVersion: z.number().int().positive(),
  scope: Json.optional(),
  thresholds: Json.optional(),
  mode: z.enum(['notify', 'draft', 'auto_apply']).optional(),
  ownerUserId: Uuid.optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  enabled: z.boolean().optional(),
  reason: Reason
})

const MANAGER_GROUPS = ['MARKETING_MANAGEMENT', 'ADMIN']

/** Rule authors/editors: owner, ADMIN or MARKETING_MANAGEMENT (fresh authority resolved by the caller). */
export function canManageAutomationRules(actor: GovernanceActor): boolean {
  return actor.role === 'owner' || MANAGER_GROUPS.some(group => (actor.groups ?? []).includes(group))
}

export interface RuleValidationInput {
  family: string
  mode: AutomationRuleMode
  expiresAt: string
  now: Date
  autoApplyEnabled: boolean
}

/** Pure validation of mode/tier/expiry. Returns the derived tier or a refusal code. */
export function validateAutomationRule(input: RuleValidationInput): { ok: true, tier: AdsRiskTier } | { ok: false, code: string } {
  const tier = classifyAdsActionRisk(input.family)
  if (tier === 'read') return { ok: false, code: 'ADS_RULE_FAMILY_NOT_ACTIONABLE' }
  const expires = Date.parse(input.expiresAt)
  if (!Number.isFinite(expires) || expires <= input.now.getTime()) return { ok: false, code: 'ADS_RULE_EXPIRY_REQUIRED' }
  if (expires - input.now.getTime() > MAX_RULE_LIFETIME_DAYS * 86_400_000) return { ok: false, code: 'ADS_RULE_EXPIRY_TOO_LONG' }
  if (input.mode === 'auto_apply') {
    if (!ADS_TIER_REQUIREMENTS[tier].automatable) return { ok: false, code: 'ADS_RULE_TIER_NOT_AUTOMATABLE' }
    if (!input.autoApplyEnabled) return { ok: false, code: 'ADS_RULE_AUTO_APPLY_DISABLED' }
  }
  return { ok: true, tier }
}

interface RuleRow {
  id: string
  client_id: string
  scope: Record<string, unknown>
  family: string
  risk_tier: AdsRiskTier
  thresholds: Record<string, unknown>
  mode: AutomationRuleMode
  owner_user_id: string
  expires_at: string | Date
  enabled: boolean
  version: number
  created_by: string
  updated_by: string
  created_at: string | Date
  updated_at: string | Date
}

const iso = (value: string | Date) => value instanceof Date ? value.toISOString() : new Date(value).toISOString()

function toRule(row: RuleRow): AutomationRule {
  return {
    id: row.id,
    clientId: row.client_id,
    scope: row.scope ?? {},
    family: row.family,
    riskTier: row.risk_tier,
    thresholds: row.thresholds ?? {},
    mode: row.mode,
    ownerUserId: row.owner_user_id,
    expiresAt: iso(row.expires_at),
    enabled: row.enabled,
    version: Number(row.version),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  }
}

function requireWritable(event: H3Event | undefined, actor: GovernanceActor) {
  const config = resolveAdsGovernanceConfig(event)
  if (!config.automation) throw new AutomationRuleError('ADS_GOVERNANCE_DISABLED', 'Ads automation governance is disabled.')
  if (!canManageAutomationRules(actor)) throw new AutomationRuleError('ADS_RULE_MANAGER_REQUIRED', 'Only the owner, an admin or a marketing manager can manage automation rules.')
  return config
}

const RULE_COLUMNS = 'id, client_id, scope, family, risk_tier, thresholds, mode, owner_user_id, expires_at, enabled, version, created_by, updated_by, created_at, updated_at'

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

async function assertOwnerAndClient(db: Db, ownerUserId: string, clientId: string) {
  const owner = (await db.query('SELECT id FROM team_members WHERE id = $1 AND is_active = TRUE', [ownerUserId])).rows[0]
  if (!owner) throw new AutomationRuleError('ADS_RULE_OWNER_INVALID', 'The rule owner must be an active team member.')
  const client = (await db.query('SELECT id FROM agency_clients WHERE id = $1 AND is_active = TRUE', [clientId])).rows[0]
  if (!client) throw new AutomationRuleError('ADS_RULE_CLIENT_INVALID', 'The rule client must be an active client.')
}

export async function createAutomationRule(event: H3Event | undefined, actor: GovernanceActor, raw: unknown, now = new Date()): Promise<AutomationRule> {
  const config = requireWritable(event, actor)
  const input = CreateRuleSchema.parse(raw)
  const verdict = validateAutomationRule({ family: input.family, mode: input.mode, expiresAt: input.expiresAt, now, autoApplyEnabled: config.autoApply })
  if ('code' in verdict) throw new AutomationRuleError(verdict.code)
  return transactionWithoutRetry(async (db) => {
    await assertOwnerAndClient(db as unknown as Db, input.ownerUserId, input.clientId)
    const row = (await db.query(`INSERT INTO ads_automation_rules
        (client_id, scope, family, risk_tier, thresholds, mode, owner_user_id, expires_at, created_by, updated_by, change_reason)
      VALUES ($1,$2::jsonb,$3,$4,$5::jsonb,$6,$7,$8,$9,$9,$10) RETURNING ${RULE_COLUMNS}`, [
      input.clientId, JSON.stringify(input.scope), input.family, verdict.tier, JSON.stringify(input.thresholds),
      input.mode, input.ownerUserId, input.expiresAt, actor.id, input.reason
    ])).rows[0] as RuleRow
    return toRule(row)
  })
}

export async function updateAutomationRule(event: H3Event | undefined, actor: GovernanceActor, raw: unknown, now = new Date()): Promise<AutomationRule> {
  const config = requireWritable(event, actor)
  const input = UpdateRuleSchema.parse(raw)
  return transactionWithoutRetry(async (db) => {
    const current = (await db.query(`SELECT ${RULE_COLUMNS} FROM ads_automation_rules WHERE id = $1 FOR UPDATE`, [input.ruleId])).rows[0] as RuleRow | undefined
    if (!current) throw new AutomationRuleError('ADS_RULE_NOT_FOUND')
    if (Number(current.version) !== input.expectedVersion) throw new AutomationRuleError('ADS_RULE_VERSION_CONFLICT', 'The rule changed; reload and retry.')
    const mode = input.mode ?? current.mode
    const expiresAt = input.expiresAt ?? iso(current.expires_at)
    const enabled = input.enabled ?? current.enabled
    // Disabling is always allowed (it can only reduce automation); anything else is fully re-validated.
    const disablingOnly = enabled === false && input.mode === undefined && input.expiresAt === undefined
      && input.scope === undefined && input.thresholds === undefined && input.ownerUserId === undefined
    if (!disablingOnly) {
      const verdict = validateAutomationRule({ family: current.family, mode, expiresAt, now, autoApplyEnabled: config.autoApply })
      if ('code' in verdict) throw new AutomationRuleError(verdict.code)
    }
    const ownerUserId = input.ownerUserId ?? current.owner_user_id
    if (input.ownerUserId !== undefined) await assertOwnerAndClient(db as unknown as Db, ownerUserId, current.client_id)
    const row = (await db.query(`UPDATE ads_automation_rules SET scope = $2::jsonb, thresholds = $3::jsonb, mode = $4,
        owner_user_id = $5, expires_at = $6, enabled = $7, updated_by = $8, change_reason = $9
      WHERE id = $1 RETURNING ${RULE_COLUMNS}`, [
      input.ruleId, JSON.stringify(input.scope ?? current.scope), JSON.stringify(input.thresholds ?? current.thresholds),
      mode, ownerUserId, expiresAt, enabled, actor.id, input.reason
    ])).rows[0] as RuleRow
    return toRule(row)
  })
}

/** Read-side: rules visible for `clientIds` (null = all). Expired rules are reported, never "active". */
export async function listAutomationRules(clientIds: string[] | null, clientId?: string): Promise<Array<AutomationRule & { active: boolean }>> {
  const rows = await queryRowsFresh<RuleRow>(`SELECT ${RULE_COLUMNS} FROM ads_automation_rules
    WHERE ($1::uuid[] IS NULL OR client_id = ANY($1)) AND ($2::uuid IS NULL OR client_id = $2)
    ORDER BY updated_at DESC LIMIT 200`, [clientIds, clientId ?? null])
  const now = Date.now()
  return rows.map(toRule).map(rule => ({ ...rule, active: isRuleActive(rule, now) }))
}

export function isRuleActive(rule: Pick<AutomationRule, 'enabled' | 'expiresAt'>, now = Date.now()): boolean {
  return rule.enabled && Date.parse(rule.expiresAt) > now
}

interface VersionRow {
  id: string
  rule_id: string
  version: number
  change_type: AutomationRuleVersion['changeType']
  actor_id: string
  reason: string | null
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown>
  created_at: string | Date
}

export async function getAutomationRuleVersions(ruleId: string): Promise<AutomationRuleVersion[]> {
  Uuid.parse(ruleId)
  const rows = await queryRowsFresh<VersionRow>('SELECT id, rule_id, version, change_type, actor_id, reason, before_state, after_state, created_at FROM ads_automation_rule_versions WHERE rule_id = $1 ORDER BY version ASC', [ruleId])
  return rows.map(row => ({
    id: row.id, ruleId: row.rule_id, version: Number(row.version), changeType: row.change_type, actorId: row.actor_id,
    reason: row.reason, before: row.before_state, after: row.after_state, createdAt: iso(row.created_at)
  }))
}

export async function getAutomationRule(ruleId: string): Promise<AutomationRule | null> {
  Uuid.parse(ruleId)
  const row = await queryOneFresh<RuleRow>(`SELECT ${RULE_COLUMNS} FROM ads_automation_rules WHERE id = $1`, [ruleId])
  return row ? toRule(row) : null
}
