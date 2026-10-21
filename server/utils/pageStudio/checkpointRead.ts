import type { PageStudioControlScope } from '~~/shared/pageStudio/controlTypes'
import { queryOneFresh } from '~~/server/utils/db'

export async function getLatestPageStudioCheckpoint(
  scope: PageStudioControlScope,
  dependencies: { queryOne?: typeof queryOneFresh } = {}
): Promise<{ checkpointId: string, digest: string, objectKey: string } | null> {
  // A saved head must be visible on immediate launch/reload; Hyperdrive may
  // otherwise cache the previous checkpoint (including an empty result).
  const readOne = dependencies.queryOne ?? queryOneFresh
  const row = await readOne<{ checkpoint_id: string, digest: string, object_key: string }>(
    `SELECT checkpoint.id AS checkpoint_id, checkpoint.digest, checkpoint.object_key
     FROM page_studio_sites site
     JOIN page_studio_checkpoints checkpoint
       ON checkpoint.tenant_id = site.tenant_id
      AND checkpoint.client_id = site.client_id
      AND checkpoint.site_id = site.id
      AND checkpoint.id = site.current_checkpoint_id
     WHERE site.tenant_id = $1 AND site.client_id = $2 AND site.id = $3`,
    [scope.tenantId, scope.clientId, scope.siteId]
  )
  return row
    ? { checkpointId: row.checkpoint_id, digest: row.digest, objectKey: row.object_key }
    : null
}
