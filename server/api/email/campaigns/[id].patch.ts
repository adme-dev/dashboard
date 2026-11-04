import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
// server/api/email/campaigns/[id].patch.ts
import { designCampaignSession, designLibraryHttpError } from '~~/server/utils/email-marketing/designLibraryHttp'
import { createDesignAssetStorage } from '~~/server/utils/email-marketing/designAssets'
import type { CampaignContentMutation } from '~~/server/utils/email-marketing/designCampaigns'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess, assertScopedCampaignLists } from '~~/server/utils/email-marketing/access'
import { getCampaign, getCampaignListClientIds, scheduleCampaign, updateCampaign } from '~~/server/utils/email-marketing/campaigns'
import { isValidSegment } from '~~/server/utils/email-marketing/segment'
import { isEmailConfigured } from '~~/server/utils/email'
import { getAppUrl } from '~~/server/utils/appUrl'
import { resolveCampaignSenderDomains } from '~~/server/utils/email-marketing/senderIdentity'
import { isEmailReviewWorkflowEnabled } from '~~/server/utils/email-marketing/review'

const OptionalEmail = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed || null
}, z.string().email().max(300).optional().nullable())

const Body = z.object({
  operation_id: z.string().uuid().optional(),
  expected_design_revision_id: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(300).optional().nullable(),
  from_name: z.string().max(200).optional().nullable(),
  from_email: OptionalEmail,
  reply_to: OptionalEmail,
  preview_text: z.string().max(300).optional().nullable(),
  body_source: z.any().optional(),
  template_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().datetime().optional().nullable(),
  filter_rules: z.any().optional().nullable(),
  // M06 workflow settings (FIGFLOW_EDM_WORKFLOW_ENABLED only); validated again in updateCampaign.
  utm_settings: z.record(z.string(), z.string().max(100).nullable()).optional().nullable(),
  web_version_enabled: z.boolean().optional()
})

function emailSendUserId(user: unknown): string {
  const value = user as { id?: string, email?: string }
  return String(value.id || value.email || 'campaign-schedule')
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  if (parsed.data.filter_rules != null && !isValidSegment(parsed.data.filter_rules)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_segment' })
  }
  if ((parsed.data.utm_settings !== undefined || parsed.data.web_version_enabled !== undefined)
    && !isEmailReviewWorkflowEnabled(event.context?.cloudflare?.env)) {
    throw createError({ statusCode: 400, statusMessage: 'email_workflow_disabled' })
  }
  const existing = await getCampaign(id)
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  await assertEmailClientAccess(event, user, existing.client_id)
  const { scheduled_at: scheduledAt, operation_id: operationId, expected_design_revision_id: expectedRevisionId, ...draftPatch } = parsed.data
  let canonical: CampaignContentMutation | undefined
  if (existing.email_design_revision_id && ['body_source', 'subject', 'preview_text'].some(key => Object.hasOwn(draftPatch, key))) {
    const { authority } = await designCampaignSession(event)
    if (!operationId || !expectedRevisionId) throw createError({ statusCode: 409, statusMessage: 'design_revision_required' })
    canonical = { actorId: authority.actorId, operationId, expectedRevisionId, authorizeWrite: authority.write, authorizeRead: authority.read,
      storage: { read: key => createDesignAssetStorage(event, getAppUrl(event)).read(key), url: id => createDesignAssetStorage(event, getAppUrl(event)).url(id), identifyUrl: url => createDesignAssetStorage(event, getAppUrl(event)).identifyUrl(url) } }
  }
  const update = async (patch: typeof draftPatch) => {
    try {
      return canonical
        ? await updateCampaign(id, patch, createEmailRenderer(event.context?.cloudflare?.env ?? {}), undefined, canonical)
        : await updateCampaign(id, patch, createEmailRenderer(event.context?.cloudflare?.env ?? {}))
    } catch (error) {
      if (canonical) designLibraryHttpError(error)
      throw error
    }
  }
  if (scheduledAt) {
    const scheduledDate = new Date(scheduledAt)
    if (scheduledDate.getTime() <= Date.now()) {
      throw createError({ statusCode: 422, statusMessage: 'schedule_time_in_past' })
    }
    assertScopedCampaignLists(user, existing.client_id, await getCampaignListClientIds(id))
    if (Object.keys(draftPatch).length > 0) {
      const updated = await update(draftPatch)
      if (!updated) throw createError({ statusCode: 404, statusMessage: 'not_found' })
    }
    const sendingConfigured = isEmailConfigured(event)
    const campaign = await scheduleCampaign(id, scheduledAt, {
      sendingConfigured,
      senderDomainAuthenticated: sendingConfigured,
      allowedSenderDomains: resolveCampaignSenderDomains(event),
      appUrl: getAppUrl(event),
      userId: emailSendUserId(user),
      ...(existing.email_design_revision_id ? { event } : {})
    })
    return { campaign }
  }

  const campaign = await update({ ...draftPatch, ...(scheduledAt === null ? { scheduled_at: null } : {}) })
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { campaign }
})
