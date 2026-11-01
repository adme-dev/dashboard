import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import {
  DesignRevisionError,
  ensureLegacyDesignDocument,
  type DesignDb,
  type DesignRevisionReceipt,
  type DesignTransaction
} from './designRevisions'

export interface InitializeTemplateDesignDraftInput {
  templateId: string
  actorId: string
  expectedClientId: string | null
}

export interface InitializeTemplateDesignDraftResult extends DesignRevisionReceipt {
  schemaVersion: 0 | 1
  origin: 'legacy' | 'design'
}

const Identity = z.object({
  templateId: z.string().uuid(),
  actorId: z.string().uuid(),
  expectedClientId: z.string().uuid().nullable()
}).strict()

/** Initialize only an existing, in-scope template draft. actorId and authority
 * must come from fresh caller authentication; this never renders or publishes. */
export async function initializeTemplateDesignDraft(
  input: InitializeTemplateDesignDraftInput,
  authorize: (clientId: string | null) => Promise<void>,
  runTransaction: DesignTransaction = callback =>
    transactionWithoutRetry((db: DesignDb) => callback(db))
): Promise<InitializeTemplateDesignDraftResult> {
  const identity = Identity.parse(input)
  return runTransaction(async (db) => {
    const owner = (
      await db.query(
        'SELECT client_id, template_kind FROM edm_templates WHERE id=$1 FOR UPDATE',
        [identity.templateId]
      )
    ).rows[0] as {
      client_id: string | null
      template_kind: string
    } | undefined
    if (!owner || owner.client_id !== identity.expectedClientId)
      throw new DesignRevisionError('NOT_FOUND')
    await authorize(owner.client_id)
    if (owner.template_kind !== 'draft')
      throw new DesignRevisionError('TEMPLATE_DRAFT_REQUIRED')

    const receipt = await ensureLegacyDesignDocument(
      {
        kind: 'template',
        ownerId: identity.templateId,
        actorId: identity.actorId
      },
      authorize,
      callback => callback(db)
    )
    // Reinitialization is not a snapshot refresh. Keep the immutable baseline
    // and compare in SQL so large legacy numeric values retain their precision.
    const head = (await db.query(
      `SELECT r.schema_version, r.origin,
        CASE WHEN r.schema_version=0 THEN to_jsonb(t)=r.payload ELSE TRUE END AS legacy_unchanged
       FROM email_design_revisions r CROSS JOIN edm_templates t
       WHERE r.document_id=$1 AND r.id=$2 AND t.id=$3`,
      [receipt.documentId, receipt.revisionId, identity.templateId]
    )).rows[0] as {
      schema_version: 0 | 1
      origin: 'legacy' | 'design'
      legacy_unchanged: boolean
    } | undefined
    if (!head) throw new DesignRevisionError('NOT_FOUND')
    if (head.schema_version === 0 && !head.legacy_unchanged)
      throw new DesignRevisionError('LEGACY_CONTENT_CHANGED')
    return {
      ...receipt,
      schemaVersion: head.schema_version,
      origin: head.origin
    }
  })
}
