// server/api/agency/automation/escalations/[id]/decide.post.ts
// Approve or reject one escalation. AUTOMATION-gated. Race-safe via atomic store update.
import { createError, getRouterParam, readBody } from 'h3'
import { requirePermission } from '~~/server/utils/auth'
import { getEscalation, decideEscalation } from '~~/server/utils/automation/escalationsStore'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'AUTOMATION')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing escalation id' })

  const body = await readBody(event)
  const decision = body?.decision
  if (decision !== 'approved' && decision !== 'rejected') {
    throw createError({ statusCode: 400, statusMessage: "decision must be 'approved' or 'rejected'" })
  }

  const existing = await getEscalation(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Escalation not found' })

  const decided = await decideEscalation(id, decision, user.id, typeof body?.note === 'string' ? body.note : undefined)
  if (!decided) {
    // Lost the race — another approver already decided it.
    throw createError({ statusCode: 409, statusMessage: 'Escalation already decided' })
  }
  return { escalation: decided }
})
