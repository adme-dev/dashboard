/** Upload a centre logo; returns a data URI to embed in style.logo. POST multipart field "file". */
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { ANALYTICS_ROLES } from '~~/server/utils/client-access'
import { executeQrMutation } from '~~/server/utils/qr/godModeMutations'
import { sha256Hex } from '~~/server/utils/exportTokens'

const MAX = 256 * 1024
export default defineEventHandler(async (event) => {
  await requireAuth(event); await requireRole(event, ANALYTICS_ROLES)
  const parts = await readMultipartFormData(event)
  const file = parts?.find(p => p.name === 'file' && p.data?.length)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'file is required' })
  const type = file.type === 'image/png' ? 'image/png' : file.type === 'image/svg+xml' ? 'image/svg+xml' : null
  if (!type) throw createError({ statusCode: 400, statusMessage: 'Logo must be PNG or SVG' })
  if (file.data.length > MAX) throw createError({ statusCode: 400, statusMessage: 'Logo must be under 256 KB' })
  if (type === 'image/svg+xml' && /<script|on\w+=|<foreignObject/i.test(file.data.toString('utf8'))) {
    throw createError({ statusCode: 400, statusMessage: 'SVG logos may not contain scripts' })
  }
  const dataUri = `data:${type};base64,${file.data.toString('base64')}`
  // No DB write, but owners' POSTs run under the execution ledger — record the attempt with the content hash as its id.
  const id = await sha256Hex(dataUri)
  await executeQrMutation(event, 'logo-upload', async () => ({ id }), async (_db, ref) => ({ id: ref }))
  return { dataUri }
})
