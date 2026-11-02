// POST /api/email/review/:kind/:id/commands — strict, CAS-checked,
// receipt-bound review command. Never sends, notifies or calls a provider.
// With FIGFLOW_EDM_WORKFLOW_ENABLED off only already-gated campaigns are served.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { assertDesignMutationRequest, readBoundedJson } from '~~/server/utils/email-marketing/designRequest'
import { runReviewCommand } from '~~/server/utils/email-marketing/review'
import {
  requireReviewSession,
  reviewAuthorizer,
  reviewEnv,
  reviewWorkflowEnabled,
  ReviewCommandBody,
  ReviewKind,
  toReviewCommandInput
} from '~~/server/utils/email-marketing/reviewHttp'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getCampaign, preparedCampaignHtml } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  const workflowEnabled = reviewWorkflowEnabled(event)
  assertDesignMutationRequest(event, reviewEnv(event).FIGFLOW_EDM_APP_ORIGIN)
  const session = await requireReviewSession(event)
  const kind = ReviewKind.safeParse(getRouterParam(event, 'kind'))
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!kind.success || !id.success) throw createError({ statusCode: 404, statusMessage: 'review_target_not_found' })
  const body = ReviewCommandBody.safeParse(await readBoundedJson(event, 8192))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'invalid_review_command' })
  return runReviewCommand(
    toReviewCommandInput(session, kind.data, id.data, body.data),
    reviewAuthorizer(session),
    {
      workflowEnabled,
      // Pure preparation of the verified stored HTML; the command transaction writes it.
      prepareSubmission: async (target) => {
        const campaign = await getCampaign(target.id)
        if (!campaign) throw createError({ statusCode: 404, statusMessage: 'review_target_not_found' })
        return preparedCampaignHtml({ ...campaign, body_html: target.bodyHtml }, { appUrl: getAppUrl(event), userId: session.userId })
      }
    }
  )
})
