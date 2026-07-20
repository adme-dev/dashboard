import {
  queryOne as defaultQueryOne,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import {
  TransferStatusSchema,
  canTransitionTransfer,
  type TransferStatus
} from '../../../shared/types/send'
import {
  canAccessSendTransfer,
  type SendActor,
  type SendTransferAccessRecord
} from './access'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const MAX_METADATA_DEPTH = 8
const MAX_METADATA_ENTRIES = 1000
const FORBIDDEN_METADATA_KEYS = new Set([
  'authorization',
  'cookie',
  'ipaddress',
  'managementtoken',
  'password',
  'rawtoken',
  'sharetoken',
  'signedurl'
])
const OPAQUE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const SIGNED_URL_RE = /^https?:\/\/[^\s]+(?:X-Amz-(?:Algorithm|Credential|Signature)|[?&](?:sig|signature|token)=)/i

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function sanitizeMetadataValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  budget: { remaining: number }
): JsonValue {
  if (depth > MAX_METADATA_DEPTH) throw new Error('Send event metadata exceeds maximum depth')
  if (value === null) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    return OPAQUE_TOKEN_RE.test(value) || SIGNED_URL_RE.test(value) ? '[REDACTED]' : value
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Send event metadata must be JSON-safe')
    return value
  }
  if (typeof value !== 'object') throw new Error('Send event metadata must be JSON-safe')
  if (seen.has(value)) throw new Error('Send event metadata must be JSON-safe')
  seen.add(value)

  if (Array.isArray(value)) {
    const output = value.map((item) => {
      budget.remaining--
      if (budget.remaining < 0) throw new Error('Send event metadata is too large')
      return sanitizeMetadataValue(item, depth + 1, seen, budget)
    })
    seen.delete(value)
    return output
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Send event metadata must be JSON-safe')
  }

  const output: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    budget.remaining--
    if (budget.remaining < 0) throw new Error('Send event metadata is too large')
    if (FORBIDDEN_METADATA_KEYS.has(normalizedKey(key))) continue
    output[key] = sanitizeMetadataValue(item, depth + 1, seen, budget)
  }
  seen.delete(value)
  return output
}

export function sanitizeSendEventMetadata(metadata: Record<string, unknown>): Record<string, JsonValue> {
  return sanitizeMetadataValue(
    metadata,
    0,
    new WeakSet(),
    { remaining: MAX_METADATA_ENTRIES }
  ) as Record<string, JsonValue>
}

interface SendTransferRow {
  id: string
  tenant_id: string | null
  client_id: string | null
  project_id: string | null
  sender_class: string
  owner_team_member_id: string | null
  public_sender_id: string | null
  status: string
  version: number | string
  title: string
  expires_at: Date | string
  created_at: Date | string
  updated_at: Date | string
}

export interface SendTransfer extends SendTransferAccessRecord {
  tenantId: string | null
  projectId: string | null
  status: TransferStatus
  version: number
  title: string
  expiresAt: string
  createdAt: string
  updatedAt: string
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapTransfer(row: SendTransferRow): SendTransfer {
  const senderClass = row.sender_class === 'workspace' || row.sender_class === 'public'
    ? row.sender_class
    : null
  if (!senderClass) throw new Error('Invalid Send sender class in canonical row')

  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    projectId: row.project_id,
    senderClass,
    ownerTeamMemberId: row.owner_team_member_id,
    publicSenderId: row.public_sender_id,
    status: TransferStatusSchema.parse(row.status),
    version: Number(row.version),
    title: row.title,
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  }
}

const TRANSFER_COLUMNS = `
  id, tenant_id, client_id, project_id, sender_class,
  owner_team_member_id, public_sender_id, status, version, title,
  expires_at, created_at, updated_at
`

export type SendEventType
  = 'draft_created'
    | 'sender_verified'
    | 'upload_intent_created'
    | 'upload_completed'
    | 'scan_completed'
    | 'published'
    | 'notification_queued'
    | 'notification_sent'
    | 'unlocked'
    | 'viewed'
    | 'downloaded'
    | 'revoked'
    | 'expired'
    | 'deletion_claimed'
    | 'deleted'
    | 'reported'
    | 'operator_action'
    | 'failed'

export interface TransitionSendTransferInput {
  transferId: string
  actor: SendActor
  expectedVersion: number
  nextStatus: TransferStatus
  eventType: SendEventType
  eventIdempotencyKey: string
  requestCorrelationId?: string
  metadata: Record<string, unknown>
}

export type TransitionSendTransferResult
  = { status: 'updated', transfer: SendTransfer }
    | { status: 'not_found' }
    | { status: 'version_conflict', currentVersion: number }
    | { status: 'invalid_transition', currentStatus: TransferStatus }
    | { status: 'invalid_event', nextStatus: TransferStatus }

const transitionEvents: Readonly<Partial<Record<TransferStatus, readonly SendEventType[]>>> = {
  awaiting_verification: ['draft_created'],
  uploading: ['sender_verified', 'upload_intent_created'],
  scanning: ['upload_completed'],
  ready: ['published'],
  revoked: ['revoked'],
  expired: ['expired'],
  deletion_pending: ['deletion_claimed'],
  deleted: ['deleted'],
  failed: ['failed']
}

interface QueryResultLike {
  rows: unknown[]
}

interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>
}

export interface SendRepositoryDeps {
  queryOne: typeof defaultQueryOne
  transaction: typeof defaultTransaction
}

async function actorCanAccess(
  transfer: SendTransfer,
  actor: SendActor,
  query: (sql: string, params: unknown[]) => Promise<unknown | null>
): Promise<boolean> {
  return canAccessSendTransfer(transfer, actor, {
    hasClientAssignment: async (clientId, actorId) => !!await query(
      `SELECT 1
         FROM client_team_assignments
        WHERE client_id = $1
          AND team_member_id = $2
        LIMIT 1`,
      [clientId, actorId]
    )
  })
}

export function createPostgresSendRepository(
  overrides: Partial<SendRepositoryDeps> = {}
) {
  const deps: SendRepositoryDeps = {
    queryOne: overrides.queryOne ?? defaultQueryOne,
    transaction: overrides.transaction ?? defaultTransaction
  }

  return {
    async getAuthorized(transferId: string, actor: SendActor): Promise<SendTransfer | null> {
      const row = await deps.queryOne<SendTransferRow>(
        `SELECT ${TRANSFER_COLUMNS}
           FROM send_transfers
          WHERE id = $1`,
        [transferId]
      )
      if (!row) return null
      const transfer = mapTransfer(row)
      const allowed = await actorCanAccess(
        transfer,
        actor,
        (sql, params) => deps.queryOne(sql, params)
      )
      return allowed ? transfer : null
    },

    async transition(input: TransitionSendTransferInput): Promise<TransitionSendTransferResult> {
      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const currentResult = await db.query(
          `SELECT ${TRANSFER_COLUMNS}
             FROM send_transfers
            WHERE id = $1
            FOR UPDATE`,
          [input.transferId]
        )
        const currentRow = currentResult.rows[0] as SendTransferRow | undefined
        if (!currentRow) return { status: 'not_found' as const }
        const current = mapTransfer(currentRow)
        const allowed = await actorCanAccess(current, input.actor, async (sql, params) => {
          const result = await db.query(sql, params)
          return result.rows[0] ?? null
        })
        if (!allowed) return { status: 'not_found' as const }

        if (current.version !== input.expectedVersion) {
          return { status: 'version_conflict' as const, currentVersion: current.version }
        }
        if (!canTransitionTransfer(current.status, input.nextStatus)) {
          return { status: 'invalid_transition' as const, currentStatus: current.status }
        }
        if (!transitionEvents[input.nextStatus]?.includes(input.eventType)) {
          return { status: 'invalid_event' as const, nextStatus: input.nextStatus }
        }

        const updateResult = await db.query(
          `UPDATE send_transfers
              SET status = $2,
                  version = version + 1,
                  published_at = CASE WHEN $2 = 'ready' THEN COALESCE(published_at, NOW()) ELSE published_at END,
                  revoked_at = CASE WHEN $2 = 'revoked' THEN COALESCE(revoked_at, NOW()) ELSE revoked_at END,
                  deletion_claimed_at = CASE WHEN $2 = 'deletion_pending' THEN COALESCE(deletion_claimed_at, NOW()) ELSE deletion_claimed_at END,
                  deleted_at = CASE WHEN $2 = 'deleted' THEN COALESCE(deleted_at, NOW()) ELSE deleted_at END,
                  updated_at = NOW()
            WHERE id = $1
              AND version = $3
              AND status = $4
        RETURNING ${TRANSFER_COLUMNS}`,
          [input.transferId, input.nextStatus, input.expectedVersion, current.status]
        )
        const updatedRow = updateResult.rows[0] as SendTransferRow | undefined
        if (!updatedRow) {
          return { status: 'version_conflict' as const, currentVersion: current.version }
        }
        const updated = mapTransfer(updatedRow)
        const metadata = sanitizeSendEventMetadata(input.metadata)

        await db.query(
          `INSERT INTO send_events (
             transfer_id, actor_class, actor_id, event_type,
             idempotency_key, request_correlation_id, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            input.transferId,
            input.actor.kind === 'workspace' ? 'workspace_user' : 'public_sender',
            input.actor.id,
            input.eventType,
            input.eventIdempotencyKey,
            input.requestCorrelationId ?? null,
            JSON.stringify(metadata)
          ]
        )

        return { status: 'updated' as const, transfer: updated }
      })
    }
  }
}
