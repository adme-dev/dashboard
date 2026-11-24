import { createError } from 'h3'
import { queryOneFresh, transaction } from '~~/server/utils/db'

const expired = 'binned_at <= now() - interval \'30 days\''

export async function clearExpiredBannerBin() {
  if (!await queryOneFresh(`SELECT 1 WHERE EXISTS (SELECT 1 FROM banner_folders WHERE ${expired})
    OR EXISTS (SELECT 1 FROM banner_projects WHERE ${expired})`)) return
  await transaction(async (db) => {
    await db.query('LOCK TABLE banner_folders IN SHARE ROW EXCLUSIVE MODE')
    // Only designs explicitly deleted by a user can expire. Folder membership never sets this timestamp.
    const designs = await db.query(`SELECT id FROM banner_projects WHERE ${expired} FOR UPDATE`)
    if (designs.rows.length) {
      const designIds = designs.rows.map(row => row.id)
      await db.query('DELETE FROM banner_dissections WHERE project_id = ANY($1::uuid[])', [designIds])
      await db.query('DELETE FROM banner_projects WHERE id = ANY($1::uuid[])', [designIds])
    }
    const { rows } = await db.query(`SELECT id FROM banner_folders WHERE ${expired}`)
    const ids = rows.map(row => row.id)
    if (!ids.length) return
    await db.query('UPDATE banner_projects SET folder_id = NULL WHERE folder_id = ANY($1::uuid[])', [ids])
    // Independently binned descendants can have a later expiry.
    await db.query('UPDATE banner_folders SET parent_id = NULL WHERE parent_id = ANY($1::uuid[])', [ids])
    await db.query(`UPDATE team_members SET dashboard_preferences = jsonb_set(dashboard_preferences,
      '{bannerFolderPins}', (dashboard_preferences->'bannerFolderPins') - $1::text[])
      WHERE (dashboard_preferences->'bannerFolderPins') ?| $1::text[]`, [ids])
    await db.query('DELETE FROM banner_folders WHERE id = ANY($1::uuid[])', [ids])
  })
}

export async function setBannerFolderBinned(id: string, bin: boolean) {
  return transaction(async (db) => {
    await db.query('LOCK TABLE banner_folders IN SHARE ROW EXCLUSIVE MODE')
    const folder = (await db.query(`SELECT id, name, parent_id, bin_root_id, (${expired}) AS expired
      FROM banner_folders WHERE id = $1`, [id])).rows[0]
    if (!folder || folder.expired) throw createError({ statusCode: 404, statusMessage: 'Folder no longer available' })
    if (folder.bin_root_id && folder.bin_root_id !== id) throw createError({ statusCode: 409, statusMessage: 'Restore the containing folder from the bin' })
    if (bin && !folder.bin_root_id) {
      await db.query(`WITH RECURSIVE subtree(id) AS (
        SELECT id FROM banner_folders WHERE id = $1
        UNION SELECT child.id FROM banner_folders child JOIN subtree ON child.parent_id = subtree.id WHERE child.binned_at IS NULL
      ) UPDATE banner_folders SET bin_root_id = $1, binned_at = now() WHERE id IN (SELECT id FROM subtree)`, [id])
    } else if (!bin && folder.bin_root_id) {
      const parent = folder.parent_id && (await db.query('SELECT id FROM banner_folders WHERE id = $1 AND binned_at IS NULL', [folder.parent_id])).rows[0]
      const names = (await db.query('SELECT lower(name) AS name FROM banner_folders WHERE parent_id IS NOT DISTINCT FROM $1::uuid AND binned_at IS NULL', [parent?.id ?? null])).rows
      const siblings = new Set(names.map(row => row.name))
      let name = folder.name
      let index = 1
      while (siblings.has(name.toLowerCase())) {
        const suffix = index === 1 ? ' (restored)' : ` (restored ${index})`
        name = folder.name.slice(0, 200 - suffix.length) + suffix
        index++
      }
      await db.query('UPDATE banner_folders SET parent_id = $2, name = $3 WHERE id = $1', [id, parent?.id ?? null, name])
      await db.query('UPDATE banner_folders SET binned_at = NULL, bin_root_id = NULL WHERE bin_root_id = $1', [id])
    }
    return { id, binned: bin }
  })
}
