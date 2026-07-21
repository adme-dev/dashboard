import { queryRows as defaultQueryRows, transaction as defaultTransaction } from '~~/server/utils/db'
import { deleteFile } from '~~/server/utils/storage'

interface QueryResultLike { rows: unknown[] }
interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>
}

interface ClaimedTransferRow { id: string }
interface CleanupFileRow { id: string, object_key: string }

interface SendCleanupDeps {
  queryRows: typeof defaultQueryRows
  transaction: typeof defaultTransaction
  deleteObject(key: string): Promise<void>
}

export interface SendCleanupResult {
  claimed: number
  deletedTransfers: number
  deletedFiles: number
  failedTransfers: number
}

export function isOwnedSendObjectKey(transferId: string, objectKey: string): boolean {
  const prefix = `send/${transferId}/`
  if (!objectKey.startsWith(prefix) || objectKey.length <= prefix.length) return false
  return !objectKey.slice(prefix.length).split('/').some(segment => segment === '..' || segment === '')
}

export function createSendCleanupService(overrides: Partial<SendCleanupDeps> = {}) {
  const deps: SendCleanupDeps = {
    queryRows: overrides.queryRows ?? defaultQueryRows,
    transaction: overrides.transaction ?? defaultTransaction,
    deleteObject: overrides.deleteObject ?? deleteFile
  }

  return {
    async run(input: { now?: Date, batchSize?: number } = {}): Promise<SendCleanupResult> {
      const now = input.now ?? new Date()
      const batchSize = Math.max(1, Math.min(input.batchSize ?? 25, 100))
      const claimed = await deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const result = await db.query(
          `WITH candidates AS (
             SELECT id
               FROM send_transfers
              WHERE sender_class = 'workspace'
                AND (
                  status IN ('revoked', 'expired')
                  OR (
                    status IN ('draft', 'uploading', 'scanning', 'ready', 'failed')
                    AND expires_at <= $1
                  )
                  OR (
                    status = 'deletion_pending'
                    AND deletion_claimed_at < $1::timestamptz - INTERVAL '15 minutes'
                  )
                )
                AND NOT EXISTS (
                  SELECT 1
                    FROM send_upload_intents i
                   WHERE i.transfer_id = send_transfers.id
                     AND i.expires_at > $1::timestamptz - INTERVAL '5 minutes'
                )
              ORDER BY COALESCE(deletion_claimed_at, expires_at), id
              FOR UPDATE SKIP LOCKED
              LIMIT $2
           ), claimed AS (
             UPDATE send_transfers AS t
                SET status = 'deletion_pending',
                    deletion_claimed_at = $1,
                    version = version + 1,
                    updated_at = NOW()
               FROM candidates c
              WHERE t.id = c.id
          RETURNING t.id
           )
           SELECT id FROM claimed`,
          [now.toISOString(), batchSize]
        )
        const rows = result.rows as ClaimedTransferRow[]
        for (const row of rows) {
          await db.query(
            `INSERT INTO send_events (
               transfer_id, actor_class, event_type, idempotency_key, metadata
             ) VALUES ($1, 'system', 'deletion_claimed', $2, $3::jsonb)
             ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
            [row.id, `cleanup-claim:${row.id}`, JSON.stringify({ policy: 'private_internal_v1' })]
          )
        }
        return rows
      })

      const result: SendCleanupResult = {
        claimed: claimed.length,
        deletedTransfers: 0,
        deletedFiles: 0,
        failedTransfers: 0
      }

      for (const transfer of claimed) {
        try {
          const files = await deps.queryRows<CleanupFileRow>(
            `SELECT id, object_key
               FROM send_files
              WHERE transfer_id = $1
                AND state <> 'deleted'
              ORDER BY id`,
            [transfer.id]
          )
          for (const file of files) {
            if (!isOwnedSendObjectKey(transfer.id, file.object_key)) {
              throw new Error(`Refusing to delete an object outside transfer ${transfer.id}`)
            }
            await deps.deleteObject(file.object_key)
          }

          await deps.transaction(async (database) => {
            const db = database as unknown as QueryClientLike
            await db.query(
              `UPDATE send_files
                  SET state = 'deleted', deleted_at = COALESCE(deleted_at, $2), updated_at = NOW()
                WHERE transfer_id = $1 AND state <> 'deleted'`,
              [transfer.id, now.toISOString()]
            )
            const finalized = await db.query(
              `UPDATE send_transfers
                  SET status = 'deleted', deleted_at = COALESCE(deleted_at, $2),
                      version = version + 1, updated_at = NOW()
                WHERE id = $1 AND status = 'deletion_pending'
            RETURNING id`,
              [transfer.id, now.toISOString()]
            )
            if (!finalized.rows[0]) throw new Error('Cleanup claim was lost before finalization')
            await db.query(
              `INSERT INTO send_events (
                 transfer_id, actor_class, event_type, idempotency_key, metadata
               ) VALUES ($1, 'system', 'deleted', $2, $3::jsonb)
               ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
              [transfer.id, `cleanup-delete:${transfer.id}`, JSON.stringify({ fileCount: files.length })]
            )
          })
          result.deletedTransfers += 1
          result.deletedFiles += files.length
        } catch (error) {
          result.failedTransfers += 1
          console.warn('[SendCleanup] Transfer cleanup failed', {
            transferId: transfer.id,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }

      return result
    }
  }
}

export const runSendCleanup = (input?: { now?: Date, batchSize?: number }) =>
  createSendCleanupService().run(input)
