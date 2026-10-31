import { z } from 'zod'
import { createError, H3Error } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { requireBrandKitWriteAccess } from '~~/server/utils/banner/brandKitAccess'
import { motorstackBinding, motorstackBrandId } from '~~/server/utils/banner/motorstackClient'
import { importMotorstackBrand } from '~~/server/utils/banner/motorstackImport'

/** Fixed public codes only: provider/DB error text and data never cross this boundary. */
function publicFailureReason(error: unknown) {
  if (!(error instanceof H3Error)) return 'import_failed'
  const message = error.statusMessage || ''
  if (/^MotorStack font (?:bytes are invalid|filename or format is unsupported); no partial kit was saved$/.test(message)) return 'font_invalid'
  if (['MotorStack logo format is unsupported; no partial kit was saved', 'MotorStack icon bytes are invalid', 'MotorStack logo contains invalid or unsafe content; no partial kit was saved'].includes(message)) return 'logo_invalid'
  if (['MotorStack request timed out; retry this brand', 'MotorStack brand import exceeded the time limit; retry this brand'].includes(message)) return 'source_timeout'
  if (['MotorStack brand assets are not configured on this deployment', 'MotorStack is not configured. Ask an administrator to check the connection, then retry.'].includes(message)) return 'not_configured'
  if (['MotorStack asset exceeds the size limit', 'MotorStack role asset exceeds its size limit', 'MotorStack brand exceeds the 40 MiB import limit', 'MotorStack brand exceeds supported kit limits; no partial kit was saved', 'MotorStack metadata exceeds native kit limits; no partial kit was saved'].includes(message)) return 'limit_exceeded'
  if (['MotorStack returned invalid brand metadata', 'MotorStack returned ambiguous asset identities'].includes(message)) return 'metadata_invalid'
  if (['MotorStack asset is unavailable or exceeds the size limit; retry this brand', 'MotorStack asset is empty', 'MotorStack role references an unavailable asset', 'MotorStack is temporarily unavailable. Retry; if it continues, ask an administrator to check the connection.', 'The MotorStack brand or asset is unavailable. Retry this brand; if it continues, check the source files in MotorStack.', 'The MotorStack asset could not be safely imported. Check its source file, then retry this brand.'].includes(message)) return 'source_unavailable'
  return 'import_failed'
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  await requireBrandKitWriteAccess(event, null)
  const parsed = z.object({ brandId: motorstackBrandId }).strict().safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A valid MotorStack brand ID is required' })
  try {
    return await importMotorstackBrand(event, motorstackBinding(event), parsed.data.brandId, user.id)
  } catch (error) {
    const reasonCode = publicFailureReason(error)
    throw createError({ statusCode: reasonCode === 'import_failed' ? 500 : (error as H3Error).statusCode, statusMessage: 'MotorStack brand import failed', data: { reasonCode } })
  }
})
