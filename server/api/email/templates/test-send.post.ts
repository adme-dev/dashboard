// Stateless test-send for the current EDM editor document. It renders the
// provided body_source through the same server pipeline used for preview/save,
// checks sendability, then sends one email through Resend.
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { getResendClient, getAppUrl } from '~~/server/utils/email'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { isFlyhubFormat } from '~~/server/utils/email-marketing/render/flyhub-html-renderer'
import { isCampaignSendingEnabled } from '~~/server/utils/email-marketing/campaignSender'
import { checkEmailSendability, htmlToPlainText } from '~~/server/utils/email-marketing/sendability'

const Body = z.object({
  to: z.string().email().optional().nullable(),
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
  const fromEmail = typeof env?.EMAIL_FROM === 'string'
    ? env.EMAIL_FROM
    : (config.emailFrom || process.env.EMAIL_FROM || 'noreply@yourdomain.com')
  return `${appName} <${fromEmail}>`
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  if (!isCampaignSendingEnabled()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'sending_disabled',
      message: 'Email sending is disabled. Set EMAIL_SENDING_ENABLED=true and configure Resend to send tests.'
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

  const subject = parsed.data.subject?.trim() || ''
  const previewText = parsed.data.preview_text?.trim() || ''
  const html = renderTemplateDocument(parsed.data.body_source, {
    subjectLine: subject,
    previewText,
    variables: parsed.data.variables
  })
  const sendability = checkEmailSendability({
    html,
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
    html,
    text: htmlToPlainText(html),
    headers: {
      'X-Email-Test': 'true',
      'X-Email-Preview-Origin': getAppUrl(event)
    }
  })
  if (error) throw createError({ statusCode: 502, statusMessage: 'test_send_failed', message: error.message })

  return {
    sent_to: to,
    message_id: data?.id ?? null,
    sendability
  }
})
