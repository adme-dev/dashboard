import type { Pool } from '@neondatabase/serverless'
import { z } from 'zod'

import { queryRows } from '~~/server/utils/db'

export type GodModeChannel = 'application' | 'mcp'
export type GodModeAuditPhase = 'attempt' | 'bypass' | 'ambiguous' | 'succeeded' | 'failed'
export type GodModeBypassedControl =
  | 'permission'
  | 'feature_flag'
  | 'release_policy'
  | 'evaluation_policy'
  | 'personal_policy'
  | 'budget'
  | 'rate_limit'
  | 'confirmation'
  | 'mcp_scope'
  | 'mcp_suite_flag'

export interface GodModeAuditEventInput {
  actorUserId: string
  correlationId: string
  sessionDigest: string
  channel: GodModeChannel
  routeOrTool: string
  phase: GodModeAuditPhase
  tenantId?: string | null
  clientId?: string | null
  entityType?: string | null
  entityId?: string | null
  bypassedControls: GodModeBypassedControl[]
  outcomeCode: string
  emergencyDisabled: boolean
}

const uuid = z.string().uuid()
const nullableUuid = uuid.nullable().optional()
const BypassedControlSchema = z.enum([
  'permission',
  'feature_flag',
  'release_policy',
  'evaluation_policy',
  'personal_policy',
  'budget',
  'rate_limit',
  'confirmation',
  'mcp_scope',
  'mcp_suite_flag'
])

const GodModeAuditEventSchema = z.object({
  actorUserId: uuid,
  correlationId: uuid,
  sessionDigest: z.string().regex(/^[0-9a-f]{64}$/),
  channel: z.enum(['application', 'mcp']),
  routeOrTool: z.string().min(1).max(160),
  phase: z.enum(['attempt', 'bypass', 'ambiguous', 'succeeded', 'failed']),
  tenantId: nullableUuid,
  clientId: nullableUuid,
  entityType: z.string().min(1).max(64).nullable().optional(),
  entityId: nullableUuid,
  bypassedControls: z.array(BypassedControlSchema).max(24),
  outcomeCode: z.string().min(1).max(64),
  emergencyDisabled: z.boolean()
}).strict()

type AuditDb = Pick<Pool, 'query'>

const defaultAuditDb = {
  query: async (sql: string, params?: unknown[]) => ({
    rows: await queryRows(sql, params as any[] | undefined)
  })
} as unknown as AuditDb

export async function appendGodModeAuditEvent(
  input: GodModeAuditEventInput,
  db: AuditDb = defaultAuditDb
): Promise<void> {
  const parsed = GodModeAuditEventSchema.parse(input)
  const event = parsed.phase === 'bypass'
    ? {
        ...parsed,
        bypassedControls: [...new Set(parsed.bypassedControls)].sort()
      }
    : parsed
  const conflictClause = event.phase === 'bypass' ? 'ON CONFLICT DO NOTHING' : ''

  await db.query(
    `INSERT INTO god_mode_audit_events (
       actor_user_id, correlation_id, session_digest, channel, route_or_tool, phase,
       tenant_id, client_id, entity_type, entity_id, bypassed_controls, outcome_code,
       emergency_disabled
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
     )
     ${conflictClause}`,
    [
      event.actorUserId,
      event.correlationId,
      event.sessionDigest,
      event.channel,
      event.routeOrTool,
      event.phase,
      event.tenantId ?? null,
      event.clientId ?? null,
      event.entityType ?? null,
      event.entityId ?? null,
      event.bypassedControls,
      event.outcomeCode,
      event.emergencyDisabled
    ]
  )
}
