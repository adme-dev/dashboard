import { z } from 'zod'
import { createError, defineEventHandler, readBody } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import {
  GooglePmaxLaunchPreparationError,
  googlePmaxLaunchPreparation
} from '~~/server/utils/googlePmaxLaunchPreparation'
import { GooglePmaxLaunchConflictError } from '~~/server/utils/googlePmaxLaunchStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const BodySchema = z.strictObject({
  briefId: z.string().uuid()
})

function preparationError(error: GooglePmaxLaunchPreparationError) {
  const firstIssue = error.issues[0]?.message
  switch (error.code) {
    case 'PMAX_PREPARATION_BRIEF_NOT_FOUND':
      return createError({ statusCode: 404, statusMessage: 'Approved Google PMax brief not found' })
    case 'PMAX_PREPARATION_BRIEF_NOT_APPROVED':
      return createError({ statusCode: 409, statusMessage: 'Brief must be an approved Google PMax brief' })
    case 'PMAX_PREPARATION_CONNECTION_NOT_FOUND':
      return createError({ statusCode: 409, statusMessage: 'Approved Google Ads connection is unavailable' })
    case 'PMAX_PREPARATION_GEO_AMBIGUOUS':
      return createError({ statusCode: 409, statusMessage: firstIssue || 'Approved location targeting is ambiguous' })
    case 'PMAX_PREPARATION_CONFIG_INVALID':
      return createError({ statusCode: 409, statusMessage: firstIssue || 'Approved brief is not launch-ready' })
    default:
      return createError({ statusCode: 502, statusMessage: 'Google launch evidence could not be resolved' })
  }
}

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MEDIA_BUYING')
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid launch preparation request' })

  try {
    const identity = await googlePmaxLaunchPreparation.identify({
      tenantId,
      briefId: parsed.data.briefId
    })
    await requireSocialClientAccess(event, identity.clientId)
    return await googlePmaxLaunchPreparation.prepare({
      tenantId,
      briefId: parsed.data.briefId,
      expectedClientId: identity.clientId,
      actorId: user.id
    })
  } catch (error: unknown) {
    if (error instanceof GooglePmaxLaunchPreparationError) throw preparationError(error)
    if (error instanceof GooglePmaxLaunchConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
