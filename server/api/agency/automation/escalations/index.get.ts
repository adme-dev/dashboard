// server/api/agency/automation/escalations/index.get.ts
// List pending automation escalations (the human-on-call inbox feed). AUTOMATION-gated.
import { createError } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { listPendingEscalations } from '~~/server/utils/automation/escalationsStore'
import { groupEscalations } from '~~/server/utils/automation/escalations'

export default defineEventHandler(async (event) => {
  await requirePermission(event, 'AUTOMATION')
  try {
    const items = await listPendingEscalations()
    return { groups: groupEscalations(items as any), count: items.length }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw createError({ statusCode: 500, statusMessage: `Failed to list escalations: ${message}` })
  }
})
