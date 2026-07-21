import { createHash } from 'node:crypto'
import {
  queryRows as defaultQueryRows,
  transaction as defaultTransaction
} from '~~/server/utils/db'
import {
  TransferStatusSchema,
  type TransferStatus,
  type WorkspaceTransferDraft,
  type WorkspaceTransferSummary
} from '../../../shared/types/send'
import { resolveTransferPolicy, type SendPolicyConfig } from './policy'

const MANAGEMENT_ROLES = new Set(['owner', 'admin', 'lead', 'project_manager'])

interface QueryResultLike { rows: unknown[] }
interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>
}

interface WorkspaceTransferRow {
  id: string
  tenant_id: string | null
  client_id: string | null
  project_id: string | null
  status: string
  version: number | string
  title: string
  message: string | null
  access_mode: 'link' | 'password'
  max_downloads: number | string | null
  expected_file_count: number | string
  expected_total_bytes: number | string
  recipient_count: number | string
  expires_at: Date | string
  created_at: Date | string
  updated_at: Date | string
}

export interface WorkspaceSendActor {
  id: string
  role: string
}

export type WorkspaceSendErrorCode
  = | 'CLIENT_ACCESS_DENIED'
    | 'PROJECT_SCOPE_INVALID'
    | 'POLICY_REJECTED'

export class WorkspaceSendError extends Error {
  constructor(public readonly code: WorkspaceSendErrorCode, message: string) {
    super(message)
    this.name = 'WorkspaceSendError'
  }
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapWorkspaceTransfer(row: WorkspaceTransferRow): WorkspaceTransferSummary {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    projectId: row.project_id,
    status: TransferStatusSchema.parse(row.status),
    version: Number(row.version),
    title: row.title,
    message: row.message,
    passwordProtected: row.access_mode === 'password',
    maxDownloads: row.max_downloads === null ? null : Number(row.max_downloads),
    fileCount: Number(row.expected_file_count),
    totalBytes: Number(row.expected_total_bytes),
    recipientCount: Number(row.recipient_count),
    expiresAt: iso(row.expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  }
}

const WORKSPACE_TRANSFER_COLUMNS = `
  t.id, t.tenant_id, t.client_id, t.project_id, t.status, t.version,
  t.title, t.message, t.access_mode, t.max_downloads,
  t.expected_file_count, t.expected_total_bytes,
  0::bigint AS recipient_count,
  t.expires_at, t.created_at, t.updated_at
`

const INSERT_RETURNING_COLUMNS = `
  id, tenant_id, client_id, project_id, status, version,
  title, message, access_mode, max_downloads,
  expected_file_count, expected_total_bytes, 0::bigint AS recipient_count,
  expires_at, created_at, updated_at
`

function scopedIdempotencyKey(actorId: string, callerKey: string): string {
  return createHash('sha256').update(`${actorId}\0${callerKey}`, 'utf8').digest('hex')
}

export interface WorkspaceSendServiceDeps {
  queryRows: typeof defaultQueryRows
  transaction: typeof defaultTransaction
}

export function createWorkspaceSendService(overrides: Partial<WorkspaceSendServiceDeps> = {}) {
  const deps: WorkspaceSendServiceDeps = {
    queryRows: overrides.queryRows ?? defaultQueryRows,
    transaction: overrides.transaction ?? defaultTransaction
  }

  return {
    async createDraft(input: {
      actor: WorkspaceSendActor
      draft: WorkspaceTransferDraft
      policy: SendPolicyConfig
      now?: Date
    }): Promise<WorkspaceTransferSummary> {
      const now = input.now ?? new Date()
      let resolvedPolicy: ReturnType<typeof resolveTransferPolicy>
      try {
        resolvedPolicy = resolveTransferPolicy(input.policy, {
          now,
          expiresAt: new Date(input.draft.expiresAt),
          fileSizes: [],
          recipientCount: 0,
          maxDownloads: input.draft.maxDownloads
        })
      } catch (error) {
        throw new WorkspaceSendError(
          'POLICY_REJECTED',
          error instanceof Error ? error.message : 'Transfer policy rejected the request'
        )
      }

      const idempotencyHash = scopedIdempotencyKey(input.actor.id, input.draft.idempotencyKey)
      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const existing = await db.query(
          `SELECT ${WORKSPACE_TRANSFER_COLUMNS}
             FROM send_transfers t
            WHERE t.sender_class = 'workspace'
              AND t.owner_team_member_id = $1
              AND t.creation_idempotency_key = $2
            LIMIT 1`,
          [input.actor.id, idempotencyHash]
        )
        if (existing.rows[0]) return mapWorkspaceTransfer(existing.rows[0] as WorkspaceTransferRow)

        if (input.draft.clientId) {
          const access = MANAGEMENT_ROLES.has(input.actor.role)
            ? await db.query(
                'SELECT 1 AS exists FROM agency_clients WHERE id = $1 LIMIT 1',
                [input.draft.clientId]
              )
            : await db.query(
                `SELECT 1 AS exists
                   FROM client_team_assignments a
                   JOIN agency_clients c ON c.id = a.client_id
                  WHERE a.client_id = $1
                    AND a.team_member_id = $2
                  LIMIT 1`,
                [input.draft.clientId, input.actor.id]
              )
          if (!access.rows[0]) {
            throw new WorkspaceSendError('CLIENT_ACCESS_DENIED', 'Client scope is not available')
          }
        }

        if (input.draft.projectId && input.draft.clientId) {
          const project = await db.query(
            `SELECT 1 AS exists
               FROM projects
              WHERE id = $1
                AND client_id = $2
              LIMIT 1`,
            [input.draft.projectId, input.draft.clientId]
          )
          if (!project.rows[0]) {
            throw new WorkspaceSendError('PROJECT_SCOPE_INVALID', 'Project does not belong to the selected client')
          }
        }

        const inserted = await db.query(
          `INSERT INTO send_transfers (
             tenant_id, client_id, project_id, sender_class,
             owner_team_member_id, public_sender_id, status, title, message,
             share_token_hash, management_token_hash, access_mode, password_hash,
             max_downloads, configured_max_bytes, configured_max_files,
             policy_snapshot, creation_idempotency_key, expires_at
           ) VALUES (
             NULL, $1, $2, 'workspace', $3, NULL, 'draft', $4, $5,
             $6, NULL, $7, $8, $9, $10, $11, $12::jsonb, $13, $14
           )
           ON CONFLICT (creation_idempotency_key) DO NOTHING
           RETURNING ${INSERT_RETURNING_COLUMNS}`,
          [
            input.draft.clientId ?? null,
            input.draft.projectId ?? null,
            input.actor.id,
            input.draft.title,
            input.draft.message ?? null,
            null,
            'link',
            null,
            resolvedPolicy.snapshot.maxDownloads,
            resolvedPolicy.snapshot.maxTransferBytes,
            resolvedPolicy.snapshot.maxFiles,
            JSON.stringify(resolvedPolicy.snapshot),
            idempotencyHash,
            resolvedPolicy.expiresAt.toISOString()
          ]
        )
        const transferRow = inserted.rows[0] as WorkspaceTransferRow | undefined
        if (!transferRow) {
          const replay = await db.query(
            `SELECT ${WORKSPACE_TRANSFER_COLUMNS}
               FROM send_transfers t
              WHERE t.sender_class = 'workspace'
                AND t.owner_team_member_id = $1
                AND t.creation_idempotency_key = $2
              LIMIT 1`,
            [input.actor.id, idempotencyHash]
          )
          const replayRow = replay.rows[0] as WorkspaceTransferRow | undefined
          if (!replayRow) throw new Error('Send draft idempotency conflict could not be resolved')
          return mapWorkspaceTransfer(replayRow)
        }

        await db.query(
          `INSERT INTO send_events (
             transfer_id, actor_class, actor_id, event_type, idempotency_key, metadata
           ) VALUES ($1, 'workspace_user', $2, 'draft_created', $3, $4::jsonb)`,
          [
            transferRow.id,
            input.actor.id,
            `draft:${idempotencyHash}`,
            JSON.stringify({
              clientId: input.draft.clientId ?? null,
              projectId: input.draft.projectId ?? null,
              access: 'authenticated_workspace'
            })
          ]
        )

        return mapWorkspaceTransfer({
          ...transferRow,
          recipient_count: 0
        })
      })
    },

    async list(input: {
      actor: WorkspaceSendActor
      status?: TransferStatus
      page: number
      pageSize: number
    }): Promise<{ transfers: WorkspaceTransferSummary[], page: number, pageSize: number, hasMore: boolean }> {
      const management = MANAGEMENT_ROLES.has(input.actor.role)
      const params: unknown[] = [input.actor.id, management]
      let statusPredicate = ''
      if (input.status) {
        params.push(input.status)
        statusPredicate = `AND t.status = $${params.length}`
      }
      params.push(input.pageSize + 1)
      const limitIndex = params.length
      params.push((input.page - 1) * input.pageSize)
      const offsetIndex = params.length

      const rows = await deps.queryRows<WorkspaceTransferRow>(
        `SELECT ${WORKSPACE_TRANSFER_COLUMNS}
           FROM send_transfers t
          WHERE t.sender_class = 'workspace'
            AND (
              t.owner_team_member_id = $1
              OR $2 = TRUE
              OR t.client_id IS NULL
              OR (t.client_id IS NOT NULL AND EXISTS (
                SELECT 1
                  FROM client_team_assignments a
                 WHERE a.client_id = t.client_id
                   AND a.team_member_id = $1
              ))
            )
            ${statusPredicate}
          ORDER BY t.created_at DESC, t.id DESC
          LIMIT $${limitIndex}
         OFFSET $${offsetIndex}`,
        params
      )
      const hasMore = rows.length > input.pageSize
      return {
        transfers: rows.slice(0, input.pageSize).map(mapWorkspaceTransfer),
        page: input.page,
        pageSize: input.pageSize,
        hasMore
      }
    }
  }
}

export function toWorkspaceSendHttpError(error: unknown): unknown {
  if (!(error instanceof WorkspaceSendError)) return error
  const statusCode = error.code === 'CLIENT_ACCESS_DENIED' ? 403 : 400
  return createError({ statusCode, statusMessage: error.message })
}
