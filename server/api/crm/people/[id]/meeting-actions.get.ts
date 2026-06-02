// server/api/crm/people/[id]/meeting-actions.get.ts
// Unconverted office-meeting action items linkable to this CRM person (via
// guest-email overlap). Agency-only surface (internal meeting data).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listMeetingActionsForCrmTarget } from '~~/server/utils/crm/meetingBridge'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const { client_id } = Query.parse(getQuery(event))
  const actionItems = await listMeetingActionsForCrmTarget('person', id, client_id)
  return { actionItems }
})
