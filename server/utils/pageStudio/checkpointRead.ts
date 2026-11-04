import { CodeContentBindingSchema, type CodeContentBinding } from '~~/shared/pageStudio/codeContent'
import type { PageStudioControlScope } from '~~/shared/pageStudio/controlTypes'
import { queryOneFresh } from '~~/server/utils/db'

export async function getLatestPageStudioCheckpoint(
  scope: PageStudioControlScope,
  dependencies: { queryOne?: typeof queryOneFresh } = {}
): Promise<{ checkpointId: string, digest: string, objectKey: string, codeContent?: CodeContentBinding } | null> {
  // A saved head must be visible on immediate launch/reload; Hyperdrive may
  // otherwise cache the previous checkpoint (including an empty result).
  const readOne = dependencies.queryOne ?? queryOneFresh
  const row = await readOne<{ checkpoint_id: string, digest: string, object_key: string, code_content?: unknown }>(
    `SELECT checkpoint.id AS checkpoint_id, checkpoint.digest, checkpoint.object_key, audit.metadata->'codeContent' AS code_content
     FROM page_studio_sites site
     JOIN page_studio_checkpoints checkpoint
       ON checkpoint.tenant_id = site.tenant_id
      AND checkpoint.client_id = site.client_id
      AND checkpoint.site_id = site.id
      AND checkpoint.id = site.current_checkpoint_id
     LEFT JOIN page_studio_audit_events audit ON audit.tenant_id=checkpoint.tenant_id
       AND audit.client_id=checkpoint.client_id AND audit.site_id=checkpoint.site_id
       AND audit.action='workspace.checkpointed' AND audit.resource_type='checkpoint'
       AND audit.resource_id=checkpoint.id AND audit.idempotency_key='control:checkpoint:' || checkpoint.id
     WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.id = $3`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )
  return row
    ? { checkpointId: row.checkpoint_id, digest: row.digest, objectKey: row.object_key, ...(row.code_content == null ? {} : { codeContent: CodeContentBindingSchema.parse(row.code_content) }) }
    : null
}
