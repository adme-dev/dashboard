import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import {
  SOURCE_ARCHIVE_COLUMNS,
  isSourceArchiveId,
  requireSourceArchiveClientAccess,
  type SourceArchiveRow
} from '~~/server/utils/banner/sourceArchives'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!isSourceArchiveId(id)) throw createError({ statusCode: 404, statusMessage: 'Source archive not found' })

  const archive = await queryOneFresh<SourceArchiveRow>(
    `SELECT ${SOURCE_ARCHIVE_COLUMNS} FROM banner_source_archives WHERE id = $1`,
    [id]
  )
  if (!archive) throw createError({ statusCode: 404, statusMessage: 'Source archive not found' })
  await requireSourceArchiveClientAccess(event, user, archive.clientId)
  return { archive }
})
