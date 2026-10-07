import type { H3Event } from 'h3'
import { getResendClient, isEmailConfigured } from '~~/server/utils/email'
import { isCloudflareEmailGatewayAvailable } from '~~/server/utils/cloudflareEmailGateway'
import { sendPortalAuthTransactionalEmail } from '~~/server/utils/portalAuthEmailTransport'
import type { CustomerSignupConfig } from './customerSignupHttp'

export function customerEmailAvailable(event: H3Event) {
  return isCloudflareEmailGatewayAvailable(event) || isEmailConfigured(event)
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
export async function sendCustomerSignInEmail(event: H3Event, config: CustomerSignupConfig, delivery: { email: string, token: string }) {
  // Fragment tokens are never sent to the web server as part of the GET URL.
  const url = `${config.origin}/studio/signup/verify#token=${encodeURIComponent(delivery.token)}`
  const message = {
    to: delivery.email,
    from: { address: config.from, name: 'Page Studio' },
    subject: 'Your Page Studio sign-in link',
    text: `Continue to Page Studio: ${url}\n\nThis link expires in 15 minutes and works once. If you did not request it, you can ignore this email.`,
    html: `<h1>Continue to Page Studio</h1><p><a href="${escapeHtml(url)}">Verify your email and continue</a></p><p>This link expires in 15 minutes and works once.</p><p>If you did not request it, you can ignore this email.</p>`
  }
  await sendPortalAuthTransactionalEmail({ event, message, resendSend: async () => {
    const resend = getResendClient(event)
    if (!resend) throw new Error('customer_email_unavailable')
    const result = await resend.emails.send({ ...message, from: `Page Studio <${config.from}>` })
    if (result.error) throw new Error('customer_email_delivery_failed')
  } })
}
