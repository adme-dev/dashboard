import { z } from 'zod'
import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import {
  approveGooglePmaxLaunch,
  getGooglePmaxLaunch,
  GooglePmaxLaunchConflictError
} from '~~/server/utils/googlePmaxLaunchStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

const BodySchema = z.strictObject({
  approvalKind: z.enum(['create', 'activate']),
  expectedConfigVersion: z.number().int().positive(),
  expectedConfigHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(1000)
})

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'ADMIN')
  const tenantId = await getSelectedTenant(event)
  const launchId = getRouterParam(event, 'id')
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  if (!launchId) throw createError({ statusCode: 400, statusMessage: 'Launch ID is required' })
  const parsed = BodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid launch approval' })
  const existing = await getGooglePmaxLaunch({ launchId, tenantId })
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Launch plan not found' })
  await requireSocialClientAccess(event, existing.clientId)
  try {
    return {
      launch: await approveGooglePmaxLaunch({
        launchId,
        tenantId,
        actorId: user.id,
        ...parsed.data
      })
    }
  } catch (error: unknown) {
    if (error instanceof GooglePmaxLaunchConflictError) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    throw error
  }
})
