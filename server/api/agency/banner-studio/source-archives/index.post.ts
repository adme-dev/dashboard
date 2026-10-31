import { getRequestWebStream } from 'h3'
import { requireWriteAccess } from '~~/server/utils/auth'
import { execute, queryOneFresh } from '~~/server/utils/db'
import {
  SOURCE_ARCHIVE_COLUMNS,
  SOURCE_ARCHIVE_IDENTITY_CONFLICT,
  SOURCE_ARCHIVE_IDENTITY_WHERE,
  parseSourceArchiveMetadata,
  requireSourceArchiveClientAccess,
  sourceArchiveBucket,
  sourceArchiveKey,
  storeSourceArchive,
  type SourceArchiveRow
} from '~~/server/utils/banner/sourceArchives'

/** Validation failures raised before R2 committed anything: the object cannot exist. */
const NOTHING_WRITTEN = new Set([400, 413, 422])

/**
 * Retains one original TheBrief size ZIP. The raw `application/zip` body is the
 * archive; metadata travels in the query string.
 *
 * Idempotent by (client, design, SHA-256). The row is reserved before the R2
 * write and completed after it, so an object never exists without a row. A
 * reservation left by a failed attempt is completed by retrying the same upload;
 * identical bytes for another client or design are a separate archive.
 */
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const metadata = parseSourceArchiveMetadata(getQuery(event))

  const declaredLength = getHeader(event, 'content-length')
  if (declaredLength && declaredLength !== String(metadata.bytes)) {
    throw createError({ statusCode: 400, statusMessage: 'Content-Length does not match bytes' })
  }

  await requireSourceArchiveClientAccess(event, user, metadata.clientId)

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

  const identity = [metadata.clientId, metadata.designHash, metadata.sha256]
  const findIdentity = () => queryOneFresh<SourceArchiveRow>(
    `SELECT ${SOURCE_ARCHIVE_COLUMNS} FROM banner_source_archives WHERE ${SOURCE_ARCHIVE_IDENTITY_WHERE}`,
    identity
  )
  const key = sourceArchiveKey(metadata.clientId, metadata.designHash, metadata.sha256)
  const descriptive = [
    metadata.childHash,
    metadata.bytes,
    metadata.filename,
    metadata.folderPath,
    metadata.sizeLabel,
    metadata.batchSha256,
    metadata.projectId,
    metadata.status,
    metadata.holdReason,
    user.id
  ]

  let reservation = await findIdentity()
  if (reservation?.storedAt) return { archive: reservation, alreadyPresent: true }
  let reservedHere = false
  if (!reservation) {
    reservation = await queryOneFresh<SourceArchiveRow>(`
      INSERT INTO banner_source_archives (
        client_id, source_design_hash, sha256, r2_key,
        source_child_hash, bytes, original_filename, source_folder_path, size_label,
        source_batch_sha256, project_id, conversion_status, hold_reason, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT ${SOURCE_ARCHIVE_IDENTITY_CONFLICT} DO NOTHING
      RETURNING ${SOURCE_ARCHIVE_COLUMNS}
    `, [...identity, key, ...descriptive])
    reservedHere = Boolean(reservation)
    if (!reservation) {
      // A concurrent upload of the same identity reserved first.
      reservation = await findIdentity()
      if (!reservation) throw createError({ statusCode: 500, statusMessage: 'Failed to reserve source archive' })
      if (reservation.storedAt) return { archive: reservation, alreadyPresent: true }
    }
  }

  const body = getRequestWebStream(event)
  try {
    if (!body) throw createError({ statusCode: 400, statusMessage: 'Archive body is required' })
    // Content-addressed: a retry or concurrent writer puts identical, R2-verified bytes.
    await storeSourceArchive(sourceArchiveBucket(event), reservation.r2Key, body, metadata)
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    if (reservedHere && status && NOTHING_WRITTEN.has(status)) {
      await execute(
        'DELETE FROM banner_source_archives WHERE id = $1 AND stored_at IS NULL',
        [reservation.id]
      ).catch(() => undefined)
    }
    throw error
  }

  // If this fails the row stays reserved over a stored object; retrying completes it.
  const completed = await queryOneFresh<SourceArchiveRow>(`
    UPDATE banner_source_archives
       SET source_child_hash = $2, bytes = $3, original_filename = $4, source_folder_path = $5,
           size_label = $6, source_batch_sha256 = $7, project_id = $8, conversion_status = $9,
           hold_reason = $10, uploaded_by = $11, stored_at = COALESCE(stored_at, NOW()), updated_at = NOW()
     WHERE id = $1
     RETURNING ${SOURCE_ARCHIVE_COLUMNS}
  `, [reservation.id, ...descriptive])
  if (!completed) throw createError({ statusCode: 500, statusMessage: 'Archive stored but not recorded; retry the upload' })

  setResponseStatus(event, 201)
  return { archive: completed, alreadyPresent: false }
})
