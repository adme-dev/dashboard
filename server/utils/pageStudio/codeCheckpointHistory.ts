import { z } from 'zod'
import { CodeContentBindingSchema } from '~~/shared/pageStudio/codeContent'
import type { PageStudioControlScope, PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'

export const CodeCheckpointHistorySchema = z.object({ checkpoints: z.array(z.object({
  checkpointId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/), digest: z.string().regex(/^[a-f0-9]{64}$/),
  objectKey: z.string().min(1).max(1100), createdAt: z.string().datetime(), codeContent: CodeContentBindingSchema
}).strict()).max(20) }).strict()

/** Caller holds fresh scoped session authority. Private prepared objects never
 * enter history: each row requires its native accepted checkpoint audit. */
export async function readAcceptedCodeCheckpointHistory(db: PageStudioQueryClient, scope: PageStudioControlScope) {
  const rows = (await db.query<{ checkpointId: string, digest: string, objectKey: string, createdAt: string | Date, codeContent: unknown }>(`
    SELECT checkpoint.id AS "checkpointId", checkpoint.digest, checkpoint.object_key AS "objectKey",
      checkpoint.created_at AS "createdAt", audit.metadata->'codeContent' AS "codeContent"
    FROM page_studio_checkpoints checkpoint JOIN page_studio_audit_events audit
      ON audit.tenant_id=checkpoint.tenant_id AND audit.client_id=checkpoint.client_id AND audit.site_id=checkpoint.site_id
      AND audit.resource_id=checkpoint.id AND audit.resource_type='checkpoint' AND audit.action='workspace.checkpointed'
      AND audit.idempotency_key='control:checkpoint:'||checkpoint.id
      AND audit.metadata->>'commitProtocol'='cas-v1' AND audit.metadata->>'digest'=checkpoint.digest
      AND audit.metadata->>'authorId'=checkpoint.author_id
      AND jsonb_typeof(audit.metadata->'expectedCheckpointId')='string'
      AND audit.metadata->>'expectedCheckpointId'<>''
    WHERE checkpoint.tenant_id=$1 AND checkpoint.client_id=$2 AND checkpoint.site_id=$3
      AND jsonb_typeof(audit.metadata->'codeContent')='object'
    ORDER BY checkpoint.created_at DESC, checkpoint.id DESC LIMIT 20
    FOR SHARE OF checkpoint, audit`, [scope.tenantId, scope.clientId, scope.siteId])).rows
  const result = CodeCheckpointHistorySchema.parse({ checkpoints: rows.map(row => ({ ...row, createdAt: new Date(row.createdAt).toISOString() })) })
  for (const row of result.checkpoints) {
    if (row.objectKey !== `tenants/${scope.tenantId}/clients/${scope.clientId}/sites/${scope.siteId}/checkpoints/${row.checkpointId}.json`) throw new Error('Accepted checkpoint storage scope mismatch')
  }
  return result
}
