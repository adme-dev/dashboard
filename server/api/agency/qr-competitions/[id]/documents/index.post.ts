/** Legal vault upload: permit approvals, signed T&Cs, contracts, correspondence. Immutable once stored. */
import { createHash } from 'node:crypto'
import { requireCompetitionAccess } from '~~/server/utils/qr/competitions'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { uploadFile, generateStorageKey } from '~~/server/utils/storage'

const MAX = 25 * 1024 * 1024
const KINDS = new Set(['permit', 'terms_signed', 'contract', 'correspondence', 'other'])
const TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'message/rfc822', 'text/plain'])

export default defineEventHandler(async (event) => {
  const { user, row } = await requireCompetitionAccess(event, getRouterParam(event, 'id'))
  const parts = await readMultipartFormData(event)
  const get = (n: string) => parts?.find(p => p.name === n)?.data?.toString('utf8')?.trim()
  const file = parts?.find(p => p.name === 'file' && p.data?.length)
  const kind = get('kind') ?? 'other'
  const title = (get('title') || file?.filename || 'Document').slice(0, 160)
  const state = get('state') || null
  if (!file) throw createError({ statusCode: 400, statusMessage: 'file is required' })
  if (!KINDS.has(kind)) throw createError({ statusCode: 400, statusMessage: 'Unknown document kind' })
  if (!TYPES.has(file.type ?? '')) throw createError({ statusCode: 400, statusMessage: 'Upload a PDF, image, Word document, .eml or text file' })
  if (file.data.length > MAX) throw createError({ statusCode: 400, statusMessage: 'Documents must be under 25 MB' })
  const sha = createHash('sha256').update(file.data).digest('hex')
  const key = generateStorageKey('attachments', file.filename || `${kind}.bin`, `qr-competitions/${row.id}`)
  const stored = await uploadFile(file.data, key, file.type!, { competitionId: row.id, kind, sha256: sha })
  const doc = await executeQrMutation(event, 'competition-document-upload', async (db) => {
    const r = await db.query(
      `INSERT INTO qr_competition_documents (competition_id, kind, state, title, storage_key, sha256, size_bytes, content_type, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [row.id, kind, state, title, stored.key, sha, stored.size, file.type, user.id])
    return r.rows[0]
  }, async (db, id) => {
    const r = await db.query(`SELECT * FROM qr_competition_documents WHERE id = $1`, [id])
    if (!r.rows[0]) throw new Error('Replayed document no longer exists')
    return r.rows[0]
  })
  return { document: doc }
})
