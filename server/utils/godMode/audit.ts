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
  /** Bounded, recursively redacted arguments for MCP action self-audit. Empty for reads. */
  actionArguments?: Record<string, unknown>
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
  emergencyDisabled: z.boolean(),
  actionArguments: z.record(z.string(), z.unknown()).optional().default({})
}).strict()

const SENSITIVE_ARGUMENT_KEY = /(secret|token|password|authorization|cookie|credential|api[_-]?key|private[_-]?key)/i
const MAX_ARGUMENT_DEPTH = 4
const MAX_ARGUMENT_KEYS = 40
const MAX_ARRAY_ITEMS = 20
const MAX_STRING_LENGTH = 500

function boundedArgumentValue(value: unknown, depth: number): unknown {
  if (depth >= MAX_ARGUMENT_DEPTH) return '[TRUNCATED]'
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map(item => boundedArgumentValue(item, depth + 1))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_ARGUMENT_KEYS)
        .map(([key, item]) => [
          key.slice(0, 120),
          SENSITIVE_ARGUMENT_KEY.test(key) ? '[REDACTED]' : boundedArgumentValue(item, depth + 1)
        ])
    )
  }
  return String(value).slice(0, MAX_STRING_LENGTH)
}

/** Preserve enough intent for an action audit without ever persisting credentials or unbounded bodies. */
export function summarizeGodModeActionArguments(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {}
  const bounded = boundedArgumentValue(args, 0) as Record<string, unknown>
  if (new TextEncoder().encode(JSON.stringify(bounded)).byteLength <= 12_000) return bounded

  const source = args as Record<string, unknown>
  const preferredKeys = ['clientId', 'client_id', 'title', 'name', 'prompt', 'text', 'proposalId', 'campaignId', 'adId']
  return {
    ...Object.fromEntries(preferredKeys
      .filter(key => key in source)
      .map(key => [key, SENSITIVE_ARGUMENT_KEY.test(key) ? '[REDACTED]' : boundedArgumentValue(source[key], 1)])),
    argumentKeys: Object.keys(source).slice(0, MAX_ARGUMENT_KEYS),
    truncated: true
  }
}

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
       emergency_disabled, action_arguments
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
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
      event.emergencyDisabled,
      JSON.stringify(event.actionArguments)
    ]
  )
}
