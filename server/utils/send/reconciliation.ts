import { createHash } from 'node:crypto'
import { queryRows as defaultQueryRows } from '~~/server/utils/db'
import { getFileMetadata, listStoredObjects } from '~~/server/utils/storage'

interface ReferencedObjectRow { object_key: string, state: string }
interface ExpectedObjectRow { transfer_id: string, file_id: string, object_key: string }
interface StaleIntentRow {
  intent_id: string
  transfer_id: string
  file_id: string
  upload_method: 'single' | 'multipart'
  multipart_upload_id: string | null
}
interface RetryableDeletionRow { transfer_id: string }

interface ReconciliationObjectPage {
  objects: Array<{ key: string }>
  truncated: boolean
  cursor?: string
}

interface SendReconciliationDeps {
  queryRows: typeof defaultQueryRows
  listObjects(input: { prefix: string, cursor?: string, limit: number }): Promise<ReconciliationObjectPage>
  getObjectMetadata(key: string): Promise<unknown | null>
}

export type SendReconciliationIssueType
  = | 'orphan_object'
    | 'missing_object'
    | 'stale_upload_intent'
    | 'stale_multipart_upload'
    | 'retryable_deletion_failure'

export interface SendReconciliationIssue {
  type: SendReconciliationIssueType
  transferId?: string
  fileId?: string
  intentId?: string
  objectFingerprint?: string
}

export interface SendReconciliationResult {
  scannedObjects: number
  scannedFiles: number
  scannedIntents: number
  orphanObjects: number
  malformedObjects: number
  missingObjects: number
  metadataCheckFailures: number
  staleIntents: number
  staleMultipartUploads: number
  retryableDeletionFailures: number
  storageTruncated: boolean
  databaseScanLimitReached: boolean
  issuesTruncated: boolean
  issues: SendReconciliationIssue[]
}

const SEND_KEY = /^send\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i

function objectFingerprint(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 16)
}

function objectIdentity(key: string): { transferId?: string, fileId?: string } {
  const match = SEND_KEY.exec(key)
  return match ? { transferId: match[1]!.toLowerCase(), fileId: match[2]!.toLowerCase() } : {}
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  visit: (value: T) => Promise<void>
): Promise<void> {
  let offset = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (offset < values.length) {
      const value = values[offset++]!
      await visit(value)
    }
  }))
}

export function createSendReconciliationService(overrides: Partial<SendReconciliationDeps> = {}) {
  const deps: SendReconciliationDeps = {
    queryRows: overrides.queryRows ?? defaultQueryRows,
    listObjects: overrides.listObjects ?? listStoredObjects,
    getObjectMetadata: overrides.getObjectMetadata ?? getFileMetadata
  }

  return {
    async run(input: {
      now?: Date
      objectPageSize?: number
      maxObjectPages?: number
      databaseBatchSize?: number
      issueLimit?: number
      metadataConcurrency?: number
    } = {}): Promise<SendReconciliationResult> {
      const now = input.now ?? new Date()
      const objectPageSize = Math.max(1, Math.min(input.objectPageSize ?? 1000, 1000))
      const maxObjectPages = Math.max(1, Math.min(input.maxObjectPages ?? 5, 10))
      const databaseBatchSize = Math.max(1, Math.min(input.databaseBatchSize ?? 500, 1000))
      const issueLimit = Math.max(1, Math.min(input.issueLimit ?? 100, 500))
      const metadataConcurrency = Math.max(1, Math.min(input.metadataConcurrency ?? 8, 16))
      const objectKeys: string[] = []
      let cursor: string | undefined
      let storageTruncated = false

      for (let pageNumber = 0; pageNumber < maxObjectPages; pageNumber += 1) {
        const page = await deps.listObjects({
          prefix: 'send/',
          ...(cursor ? { cursor } : {}),
          limit: objectPageSize
        })
        objectKeys.push(...page.objects.map(object => object.key))
        storageTruncated = page.truncated
        if (!page.truncated) break
        if (!page.cursor || page.cursor === cursor) {
          throw new Error('R2 object reconciliation cursor did not advance')
        }
        cursor = page.cursor
      }

      const referencedObjects = objectKeys.length
        ? await deps.queryRows<ReferencedObjectRow>(
            `SELECT object_key, state
               FROM send_files
              WHERE object_key = ANY($1::text[])`,
            [objectKeys]
          )
        : []
      const referencedByKey = new Map(referencedObjects.map(row => [row.object_key, row.state]))
      const expectedObjects = await deps.queryRows<ExpectedObjectRow>(
        `SELECT f.transfer_id, f.id AS file_id, f.object_key
           FROM send_files f
           JOIN send_transfers t ON t.id = f.transfer_id
          WHERE f.state IN ('uploaded', 'quarantined', 'clean', 'rejected', 'failed')
            AND t.status NOT IN ('deletion_pending', 'deleted')
          ORDER BY f.updated_at, f.id
          LIMIT $1`,
        [databaseBatchSize]
      )
      const staleIntents = await deps.queryRows<StaleIntentRow>(
        `SELECT i.id AS intent_id, i.transfer_id, i.file_id,
                i.upload_method, i.multipart_upload_id
           FROM send_upload_intents i
          WHERE i.status IN ('pending', 'uploading')
            AND i.expires_at <= $1
          ORDER BY i.expires_at, i.id
          LIMIT $2`,
        [now.toISOString(), databaseBatchSize]
      )
      const retryableDeletions = await deps.queryRows<RetryableDeletionRow>(
        `SELECT t.id AS transfer_id
           FROM send_transfers t
          WHERE t.status = 'deletion_pending'
            AND t.deletion_claimed_at < $1::timestamptz - INTERVAL '15 minutes'
          ORDER BY t.deletion_claimed_at, t.id
          LIMIT $2`,
        [now.toISOString(), databaseBatchSize]
      )

      const issues: SendReconciliationIssue[] = []
      let totalIssueCount = 0
      const addIssue = (issue: SendReconciliationIssue) => {
        totalIssueCount += 1
        if (issues.length < issueLimit) issues.push(issue)
      }
      let orphanObjects = 0
      let malformedObjects = 0
      for (const key of objectKeys) {
        const state = referencedByKey.get(key)
        if (state && state !== 'deleted') continue
        orphanObjects += 1
        const identity = objectIdentity(key)
        if (!identity.transferId) malformedObjects += 1
        addIssue({
          type: 'orphan_object',
          ...identity,
          objectFingerprint: objectFingerprint(key)
        })
      }

      let missingObjects = 0
      let metadataCheckFailures = 0
      await mapWithConcurrency(expectedObjects, metadataConcurrency, async (file) => {
        try {
          if (await deps.getObjectMetadata(file.object_key)) return
          missingObjects += 1
          addIssue({
            type: 'missing_object',
            transferId: file.transfer_id,
            fileId: file.file_id,
            objectFingerprint: objectFingerprint(file.object_key)
          })
        } catch {
          metadataCheckFailures += 1
        }
      })

      let staleMultipartUploads = 0
      for (const intent of staleIntents) {
        const hasMultipartUpload = intent.upload_method === 'multipart' && !!intent.multipart_upload_id
        if (hasMultipartUpload) staleMultipartUploads += 1
        addIssue({
          type: hasMultipartUpload ? 'stale_multipart_upload' : 'stale_upload_intent',
          transferId: intent.transfer_id,
          fileId: intent.file_id,
          intentId: intent.intent_id
        })
      }
      for (const transfer of retryableDeletions) {
        addIssue({ type: 'retryable_deletion_failure', transferId: transfer.transfer_id })
      }

      const result: SendReconciliationResult = {
        scannedObjects: objectKeys.length,
        scannedFiles: expectedObjects.length,
        scannedIntents: staleIntents.length,
        orphanObjects,
        malformedObjects,
        missingObjects,
        metadataCheckFailures,
        staleIntents: staleIntents.length,
        staleMultipartUploads,
        retryableDeletionFailures: retryableDeletions.length,
        storageTruncated,
        databaseScanLimitReached: [expectedObjects, staleIntents, retryableDeletions]
          .some(rows => rows.length === databaseBatchSize),
        issuesTruncated: totalIssueCount > issues.length,
        issues
      }

      if (totalIssueCount > 0 || metadataCheckFailures > 0 || storageTruncated) {
        console.warn('[SendReconciliation] Storage drift detected', {
          orphanObjects,
          malformedObjects,
          missingObjects,
          metadataCheckFailures,
          staleIntents: staleIntents.length,
          staleMultipartUploads,
          retryableDeletionFailures: retryableDeletions.length,
          storageTruncated,
          databaseScanLimitReached: result.databaseScanLimitReached
        })
      }
      return result
    }
  }
}

export const runSendReconciliation = (input?: Parameters<ReturnType<typeof createSendReconciliationService>['run']>[0]) =>
  createSendReconciliationService().run(input)
