import type { MediaProject } from '~~/app/types'
import { queryRowsFresh } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'

export interface MediaProjectCover {
  url: string
  kind: 'image'
  label: string
}

interface CoverActor { id: string, role: string, isCustomReadOnly?: boolean }
interface CoverRow { project_id: string, asset_id: string }

/**
 * Read-only presentation, never media generation. The existing thumbnail route
 * rechecks project write access and attachment before resolving its storage key.
 * Keep this projection at least as restrictive as that route; listing a project
 * is not authority to expose its assets.
 */
export async function projectCovers(
  projects: readonly MediaProject[],
  actor: CoverActor
): Promise<Map<string, MediaProjectCover>> {
  const covers = new Map<string, MediaProjectCover>()
  if (isReadOnlyRole(actor.role) || actor.isCustomReadOnly) return covers
  const canAccessAll = actor.role === 'admin' || actor.role === 'owner'
  const ids = [...new Set(projects
    .filter(project => project.mediaType === 'av' && (canAccessAll || project.createdBy === actor.id))
    .map(project => project.id))].slice(0, 200)
  if (!ids.length) return covers

  try {
    // Recheck current DB authority rather than trusting possibly cached list
    // metadata. One bounded projection, no project/timeline fetch per card.
    const rows = await queryRowsFresh<CoverRow>(
      `SELECT DISTINCT ON (mp.id) mp.id AS project_id, va.id AS asset_id
       FROM media_projects mp
       JOIN video_assets va ON va.source_project_id = mp.id
         AND va.client_id IS NOT DISTINCT FROM mp.client_id
       WHERE mp.id = ANY($1::uuid[]) AND mp.media_type = 'av'
         AND ($3::boolean OR mp.created_by = $2)
         AND va.thumbnail_key IS NOT NULL AND length(trim(va.thumbnail_key)) > 0
       ORDER BY mp.id, va.updated_at DESC, va.id DESC
       LIMIT 200`,
      [ids, actor.id, canAccessAll]
    )
    const allowed = new Set(ids)
    for (const row of rows) {
      if (!allowed.has(row.project_id) || !row.asset_id) continue
      covers.set(row.project_id, {
        url: `/api/agency/video/assets/${encodeURIComponent(row.asset_id)}/thumbnail`,
        kind: 'image',
        label: 'Project preview'
      })
    }
  } catch {
    // A missing derivative/table or transient DB failure must not prevent users
    // opening their existing projects. UI renders an honest empty cover.
  }
  return covers
}
