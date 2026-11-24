import { createError, type H3Event } from 'h3'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { requireAllBannerClientAccess } from '~~/server/utils/banner/clientAccess'
import { transaction } from '~~/server/utils/db'

export const folderId = z.string().uuid().toLowerCase()
const name = z.string().trim().min(1).max(200)
export const newFolder = z.object({ id: folderId, name, parentId: folderId.nullable() }).strict()
export const editFolder = z.union([
  z.object({ name }).strict(),
  z.object({ parentId: folderId.nullable() }).strict()
])

export async function requireFolderEditor(event: H3Event) {
  await requireWriteAccess(event)
  await requireAllBannerClientAccess(event)
}

type FolderChange = z.infer<typeof editFolder> | z.infer<typeof newFolder>

export async function saveBannerFolder(id: string, change: FolderChange) {
  return transaction(async db => {
    // Validate against the committed tree after competing moves have finished.
    await db.query('LOCK TABLE banner_folders IN SHARE ROW EXCLUSIVE MODE')
    const current = (await db.query('SELECT name, parent_id FROM banner_folders WHERE id = $1', [id])).rows[0]
    const creating = 'id' in change
    if (!current && !creating) throw createError({ statusCode: 404, statusMessage: 'Folder no longer exists' })
    const nextName = 'name' in change ? change.name : current.name
    const parentId = 'parentId' in change ? change.parentId : current.parent_id
    if (current && nextName === current.name && parentId === current.parent_id) return { id }
    if (current && creating) throw createError({ statusCode: 409, statusMessage: 'This folder was already created' })

    if (parentId) {
      const ancestors = await db.query(`WITH RECURSIVE ancestors AS (
        SELECT id, parent_id FROM banner_folders WHERE id = $1
        UNION
        SELECT f.id, f.parent_id FROM banner_folders f JOIN ancestors a ON f.id = a.parent_id
      ) SELECT id FROM ancestors`, [parentId])
      if (!ancestors.rowCount) throw createError({ statusCode: 409, statusMessage: 'Destination folder no longer exists' })
      if (ancestors.rows.some(row => row.id === id)) {
        throw createError({ statusCode: 409, statusMessage: 'Choose a destination outside this folder' })
      }
    }
    const sibling = await db.query(`SELECT 1 FROM banner_folders WHERE parent_id IS NOT DISTINCT FROM $1::uuid
      AND lower(name) = lower($2) AND id <> $3 LIMIT 1`, [parentId, nextName, id])
    if (sibling.rowCount) throw createError({ statusCode: 409, statusMessage: 'A folder with this name already exists here' })
    if (creating) {
      await db.query('INSERT INTO banner_folders (id, name, parent_id) VALUES ($1, $2, $3)', [id, nextName, parentId])
    } else {
      await db.query('UPDATE banner_folders SET name = $2, parent_id = $3 WHERE id = $1', [id, nextName, parentId])
    }
    return { id }
  })
}
