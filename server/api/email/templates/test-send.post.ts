// Stateless test-send for the current EDM editor document. It renders the
// provided body_source through the same server pipeline used for preview/save,
// checks sendability, then sends one email through Resend.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getResendClient, isEmailConfigured } from '~~/server/utils/email'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'
import { isSenderDomainAllowed } from '~~/server/utils/email-marketing/campaignSend'
import { resolveCampaignSenderDomains } from '~~/server/utils/email-marketing/senderIdentity'
import { checkEmailSendability, htmlToPlainText } from '~~/server/utils/email-marketing/sendability'
import { prepareSendableHtmlWithMirroredAssets } from '~~/server/utils/email-marketing/sendableHtml'

const OptionalTestRecipient = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed || null
}, z.string().email().optional().nullable())

const Body = z.object({
  to: OptionalTestRecipient,
  subject: z.string().optional().nullable(),
  preview_text: z.string().optional().nullable(),
  body_source: z.any(),
  variables: z.record(z.string(), z.string()).optional()
})

function resolveFromHeader(event: Parameters<typeof getAppUrl>[0] | undefined): string {
  const config = useRuntimeConfig()
  const env = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  const appName = typeof env?.APP_NAME === 'string'
    ? env.APP_NAME
    : (config.public?.appName || process.env.APP_NAME || 'XeroFlow Agency')
  return `${appName} <${resolveFromEmail(event)}>`
}

function resolveFromEmail(event: Parameters<typeof getAppUrl>[0] | undefined): string {
  const config = useRuntimeConfig()
  const env = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  return typeof env?.EMAIL_FROM === 'string'
    ? env.EMAIL_FROM
    : (config.emailFrom || process.env.EMAIL_FROM || 'noreply@yourdomain.com')
}

function getSendFlag(event: Parameters<typeof getAppUrl>[0] | undefined, key: string): string | undefined {
  const env = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  const binding = env?.[key]
  return typeof binding === 'string' ? binding : process.env[key]
}

function isTemplateTestSendingEnabled(event: Parameters<typeof getAppUrl>[0] | undefined): boolean {
  const enabled = getSendFlag(event, 'EMAIL_TEST_SENDING_ENABLED') === 'true'
    || getSendFlag(event, 'EMAIL_SENDING_ENABLED') === 'true'
  return enabled && isEmailConfigured(event)
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  if (!isTemplateTestSendingEnabled(event)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'sending_disabled',
      message: 'Test email sending is disabled. Set EMAIL_TEST_SENDING_ENABLED=true and configure Resend to send tests.'
    })
  }

  const client = getResendClient(event)
  if (!client) throw createError({ statusCode: 503, statusMessage: 'resend_unavailable' })

  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  if (!isFlyhubFormat(parsed.data.body_source)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_flyhub_document' })
  }

  const to = parsed.data.to || (user as { email?: string }).email
  if (!to) throw createError({ statusCode: 422, statusMessage: 'no_test_recipient' })

  const fromEmail = resolveFromEmail(event)
  const allowedSenderDomains = resolveCampaignSenderDomains(event)
  if (!isSenderDomainAllowed(fromEmail, allowedSenderDomains)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'sender_domain_not_allowed',
      data: { allowedSenderDomains }
    })
  }

  const subject = parsed.data.subject?.trim() || ''
  const previewText = parsed.data.preview_text?.trim() || ''
  const html = renderTemplateDocument(parsed.data.body_source, {
    subjectLine: subject,
    previewText,
    variables: parsed.data.variables
  })
  const appUrl = getAppUrl(event)
  const sendableHtml = await prepareSendableHtmlWithMirroredAssets(html, {
    appUrl,
    userId: String((user as { id?: string, email?: string }).id || (user as { email?: string }).email || 'email-test')
  })
  const sendability = checkEmailSendability({
    html: sendableHtml,
    subject,
    previewText
  })
  if (!sendability.ok) {
    throw createError({
      statusCode: 422,
      statusMessage: 'sendability_failed',
      data: sendability
    })
  }

  const { data, error } = await client.emails.send({
    from: resolveFromHeader(event),
    to: [to],
    subject: `[TEST] ${subject}`,
    html: sendableHtml,
    text: htmlToPlainText(sendableHtml),
    headers: {
      'X-Email-Test': 'true',
      'X-Email-Preview-Origin': appUrl
    }
  })
  if (error) throw createError({ statusCode: 502, statusMessage: 'test_send_failed', message: error.message })

  return {
    sent_to: to,
    message_id: data?.id ?? null,
    sendability
  }
})
