import { loadSourceAssetsByIds, assertResolvableSources } from '~~/server/utils/video-generation/sourceAssetStore'
import { getPresignedDownloadUrl } from '~~/server/utils/storage'

export interface ResolveDeps {
  load: typeof loadSourceAssetsByIds
  presign: typeof getPresignedDownloadUrl
}
const defaultDeps: ResolveDeps = { load: loadSourceAssetsByIds, presign: getPresignedDownloadUrl }

/** Resolve approved, tenant-owned source-asset ids to presigned R2 URLs (1h), in order. */
export async function resolveSourceAssetUrls(ids: string[], tenantId: string, deps: ResolveDeps = defaultDeps): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await deps.load(ids)
  const ordered = assertResolvableSources(rows, ids, tenantId)
  return Promise.all(ordered.map((r) => deps.presign(r.r2_key, 3600)))
}
