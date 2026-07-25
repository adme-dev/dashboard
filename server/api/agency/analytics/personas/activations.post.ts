import { z } from 'zod'
import { requirePersonaAdminAccess } from '~~/server/utils/persona/access'
import { createPersonaActivationRequest } from '~~/server/utils/persona/activation'

const Body = z.strictObject({
  clientId: z.string().uuid(),
  provider: z.enum(['google_ads', 'meta']),
  name: z.string().trim().min(3).max(120),
  filters: z.strictObject({
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    platform: z.string().max(40).optional(),
    campaignId: z.string().max(512).optional(),
    adGroupId: z.string().max(512).optional(),
    adSetId: z.string().max(512).optional(),
    adId: z.string().max(512).optional(),
    creativeId: z.string().max(512).optional(),
    landingPage: z.string().max(2048).optional(),
    device: z.string().max(40).optional()
  }),
  expiresAt: z.string().datetime({ offset: true })
})

export default defineEventHandler(async event => {
  const user = await requirePersonaAdminAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  }
  return createPersonaActivationRequest({
    ...parsed.data,
    actorId: user.id
  })
})
