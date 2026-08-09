// server/api/crm/companies/[id]/meeting-actions.get.ts
// Unconverted office-meeting action items linkable to this CRM company (via
// guest-email overlap across the company's contacts). Agency-only surface.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listMeetingActionsForCrmTarget } from '~~/server/utils/crm/meetingBridge'
import { resolveAgencyCrmSearchContext } from '~~/server/utils/crm/searchContext'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })
  const { client_id } = Query.parse(getQuery(event))
  const context = await resolveAgencyCrmSearchContext(event, { clientId: client_id, surface: 'agency_global' })
  const actionItems = await listMeetingActionsForCrmTarget('company', id, context, context.actorId)
  return { actionItems }
})
