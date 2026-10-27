import { requireAuth } from '~~/server/utils/auth'
import { executeApprovedGtmProposal } from '~~/server/utils/tracking/gtmProposals'
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  return executeApprovedGtmProposal(
    { event, userId: user.id, userRole: user.role },
    { ...body, proposalId: id }
  )
})
