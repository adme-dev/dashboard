import { requireAuth } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import {
  SOURCE_ARCHIVE_COLUMNS,
  isSourceArchiveId,
  isSourceArchiveKey,
  requireSourceArchiveClientAccess,
  sourceArchiveBucket,
  type SourceArchiveRow
} from '~~/server/utils/banner/sourceArchives'

function notFound(): never {
  throw createError({ statusCode: 404, statusMessage: 'Source archive not found' })
}

function attachmentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** Private, authenticated download of the original ZIP. Never cached or public. */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!isSourceArchiveId(id)) notFound()

  const archive = await queryOneFresh<SourceArchiveRow>(
    `SELECT ${SOURCE_ARCHIVE_COLUMNS} FROM banner_source_archives WHERE id = $1`,
    [id]
  )
  if (!archive || !isSourceArchiveKey(archive.r2Key)) notFound()
  await requireSourceArchiveClientAccess(event, user, archive.clientId)

  const object = await sourceArchiveBucket(event).get(archive.r2Key)
  if (!object?.body) notFound()
  return new Response(object.body, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-length': String(object.size),
      'content-disposition': attachmentDisposition(archive.filename),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'etag': object.httpEtag
    }
  })
})
