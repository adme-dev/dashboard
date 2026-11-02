// POST /api/email/review/:kind/:id/commands — strict, CAS-checked,
// receipt-bound review command. Never sends, notifies or calls a provider.
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { assertDesignMutationRequest, readBoundedJson } from '~~/server/utils/email-marketing/designRequest'
import { runReviewCommand } from '~~/server/utils/email-marketing/review'
import {
  assertReviewWorkflowEnabled,
  requireReviewSession,
  reviewAuthorizer,
  reviewEnv,
  ReviewCommandBody,
  ReviewKind,
  toReviewCommandInput
} from '~~/server/utils/email-marketing/reviewHttp'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getCampaign, prepareCampaignHtmlForSend } from '~~/server/utils/email-marketing/campaigns'

export default defineEventHandler(async (event) => {
  assertReviewWorkflowEnabled(event)
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
      prepareSubmission: async (target) => {
        const campaign = await getCampaign(target.id)
        if (!campaign) throw createError({ statusCode: 404, statusMessage: 'review_target_not_found' })
        await prepareCampaignHtmlForSend(campaign, { appUrl: getAppUrl(event), userId: session.userId })
      }
    }
  )
})
