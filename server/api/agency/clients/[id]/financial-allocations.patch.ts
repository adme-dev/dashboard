import { z } from 'zod'
import { requirePermission, requireWriteAccess } from '~~/server/utils/auth'
import {
  applyClientFinancialAllocation,
  ClientFinancialAllocationError,
  type ClientFinancialAllocationErrorCode,
} from '~~/server/utils/clientFinancialAllocations'
import { getSelectedTenant } from '~~/server/utils/session'

const projectId = z.string().uuid().nullable()

const FinancialAllocationMutationSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('media_spend'),
    sourceId: z.string().uuid(),
    projectId,
  }).strict(),
  z.object({
    sourceType: z.literal('xero_line'),
    sourceId: z.string().trim().min(1).max(512),
    projectId,
  }).strict(),
  z.object({
    sourceType: z.literal('client_tracking'),
    trackingOptionId: z.string().trim().min(1).max(255).nullable(),
    trackingOptionName: z.string().trim().min(1).max(255),
  }).strict(),
])

const errorStatus: Record<ClientFinancialAllocationErrorCode, {
  statusCode: number
  statusMessage: string
}> = {
  source_not_found: { statusCode: 404, statusMessage: 'Financial allocation source not found' },
  invalid_assignment: { statusCode: 422, statusMessage: 'Invalid financial allocation' },
  stale_source: { statusCode: 409, statusMessage: 'Financial allocation source changed; refresh and try again' },
}

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'FINANCE')
  await requireWriteAccess(event)

  const clientIdResult = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!clientIdResult.success) {
    throw createError({ statusCode: 400, statusMessage: 'Valid client ID is required' })
  }

  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid financial allocation request' })
  }
  const parsed = FinancialAllocationMutationSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid financial allocation request' })
  }

  let tenantId: string | null = null
  if (parsed.data.sourceType !== 'media_spend') {
    try {
      const selectedTenant = await getSelectedTenant(event)
      tenantId = selectedTenant?.trim() || null
    } catch {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to update client financial allocation',
      })
    }
    if (!tenantId) {
      throw createError({ statusCode: 400, statusMessage: 'A selected Xero tenant is required' })
    }
  }

  try {
    return await applyClientFinancialAllocation({
      tenantId,
      clientId: clientIdResult.data,
      actorId: user.id,
      mutation: parsed.data,
    })
  } catch (error) {
    if (error instanceof ClientFinancialAllocationError) {
      throw createError(errorStatus[error.code])
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update client financial allocation',
    })
  }
})
