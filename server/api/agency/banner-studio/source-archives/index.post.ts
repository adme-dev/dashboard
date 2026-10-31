import { getRequestWebStream } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryOneFresh } from '~~/server/utils/db'
import {
  SOURCE_ARCHIVE_COLUMNS,
  parseSourceArchiveMetadata,
  requireSourceArchiveClientAccess,
  sourceArchiveBucket,
  sourceArchiveKey,
  storeSourceArchive,
  type SourceArchiveRow
} from '~~/server/utils/banner/sourceArchives'

/**
 * Retains one original TheBrief size ZIP. The raw `application/zip` body is the
 * archive; metadata travels in the query string. Idempotent by SHA-256: an
 * archive already retained is returned without reading or storing the body.
 */
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const metadata = parseSourceArchiveMetadata(getQuery(event))

  const declaredLength = getHeader(event, 'content-length')
  if (declaredLength && declaredLength !== String(metadata.bytes)) {
    throw createError({ statusCode: 400, statusMessage: 'Content-Length does not match bytes' })
  }

  await requireSourceArchiveClientAccess(event, user, metadata.clientId)

  const findExisting = () => queryOneFresh<SourceArchiveRow>(
    `SELECT ${SOURCE_ARCHIVE_COLUMNS} FROM banner_source_archives WHERE sha256 = $1`,
    [metadata.sha256]
  )
  const present = async (row: SourceArchiveRow) => {
    try {
      await requireSourceArchiveClientAccess(event, user, row.clientId)
    } catch {
      throw createError({ statusCode: 409, statusMessage: 'This archive is already retained under another client' })
    }
    return { archive: row, alreadyPresent: true }
  }

  const existing = await findExisting()
  if (existing) return present(existing)

  if (metadata.projectId) {
    const project = await queryOneFresh<{ clientId: string | null }>(
      'SELECT client_id AS "clientId" FROM banner_projects WHERE id = $1',
      [metadata.projectId]
    )
    if (!project) throw createError({ statusCode: 400, statusMessage: 'Project not found' })
    if ((project.clientId?.toLowerCase() ?? null) !== metadata.clientId) {
      throw createError({ statusCode: 400, statusMessage: 'Project belongs to a different client' })
    }
  }

  const body = getRequestWebStream(event)
  if (!body) throw createError({ statusCode: 400, statusMessage: 'Archive body is required' })
  const key = sourceArchiveKey(metadata.clientId, metadata.designHash, metadata.sha256)
  await storeSourceArchive(sourceArchiveBucket(event), key, body, metadata)

  const inserted = await queryOneFresh<SourceArchiveRow>(`
    INSERT INTO banner_source_archives (
      client_id, source_design_hash, source_child_hash, sha256, bytes, original_filename,
      source_folder_path, size_label, source_batch_sha256, r2_key, project_id,
      conversion_status, hold_reason, uploaded_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (sha256) DO NOTHING
    RETURNING ${SOURCE_ARCHIVE_COLUMNS}
  `, [
    metadata.clientId,
    metadata.designHash,
    metadata.childHash,
    metadata.sha256,
    metadata.bytes,
    metadata.filename,
    metadata.folderPath,
    metadata.sizeLabel,
    metadata.batchSha256,
    key,
    metadata.projectId,
    metadata.status,
    metadata.holdReason,
    user.id
  ])
  if (!inserted) {
    // A concurrent upload of the same bytes won the insert.
    const winner = await findExisting()
    if (!winner) throw createError({ statusCode: 500, statusMessage: 'Failed to record source archive' })
    return present(winner)
  }

  setResponseStatus(event, 201)
  return { archive: inserted, alreadyPresent: false }
})
