import type { H3Event } from 'h3'
import { Resend } from 'resend'
import { getResendClient, isEmailConfigured } from '~~/server/utils/email'
import { isCloudflareEmailGatewayAvailable } from '~~/server/utils/cloudflareEmailGateway'
import { sendPortalAuthTransactionalEmail } from '~~/server/utils/portalAuthEmailTransport'
import type { CustomerSignupConfig } from './customerSignupHttp'

// Keep the customer sender credential independent of staff/portal email.
function customerResendKey(event: H3Event): string {
  const value = event.context.cloudflare?.env?.PAGE_STUDIO_CUSTOMER_RESEND_API_KEY
    ?? process.env.PAGE_STUDIO_CUSTOMER_RESEND_API_KEY
  return typeof value === 'string' ? value.trim() : ''
}

export function customerEmailAvailable(event: H3Event) {
  return !!customerResendKey(event) || isCloudflareEmailGatewayAvailable(event) || isEmailConfigured(event)
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[char]!)
export async function sendCustomerSignInEmail(event: H3Event, config: CustomerSignupConfig, delivery: { email: string, token: string }) {
  // Fragment tokens are never sent to the web server as part of the GET URL.
  const url = `${config.origin}/studio/signup/verify#token=${encodeURIComponent(delivery.token)}`
  const safeUrl = escapeHtml(url)
  const message = {
    to: delivery.email,
    from: { address: config.from, name: 'Page Studio' },
    subject: 'Continue to Page Studio',
    text: `Continue to Page Studio: ${url}\n\nThis link expires in 15 minutes and works once. If you did not request it, you can ignore this email.`,
    // Match the XeroFlow sign-in email without its staff-specific links or copy.
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Continue to Page Studio</title>
  <style>@media screen and (max-width:600px){.email-card{padding:32px 24px !important;}.email-shell{padding:32px 16px !important;}}</style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111111;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Your secure link to Page Studio. Valid for 15 minutes.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f5;">
    <tr><td class="email-shell" align="center" style="padding:48px 24px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
        <tr><td align="center" style="padding:0 0 40px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="40" height="40" align="center" valign="middle" style="background:#111111;border-radius:10px;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:-0.02em;">XF</td>
          </tr></table>
          <p style="margin:12px 0 0;color:#666666;font-size:13px;letter-spacing:0.02em;">XeroFlow &middot; Page Studio</p>
        </td></tr>
        <tr><td class="email-card" align="center" style="background:#ffffff;border:1px solid #e0e0e0;border-radius:20px;padding:48px 40px;">
          <h1 style="margin:0 0 12px;color:#111111;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.25;">Continue to Page Studio</h1>
          <p style="margin:0 0 28px;color:#666666;font-size:16px;line-height:1.6;">Use the secure link below to verify your email and open Page Studio.</p>
          <div style="margin:0 0 24px;">
            <!--[if mso]>
            <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="50%" strokecolor="#111111" fillcolor="#111111">
              <w:anchorlock/>
              <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Continue to Page Studio</center>
            </v:roundrect>
            <![endif]-->
            <!--[if !mso]><!-->
            <a href="${safeUrl}" style="display:inline-block;background-color:#111111;color:#ffffff !important;padding:14px 28px;text-decoration:none;border-radius:100px;font-size:16px;font-weight:600;letter-spacing:-0.01em;border:2px solid #111111;mso-padding-alt:0;">Continue to Page Studio</a>
            <!--<![endif]-->
          </div>
          <p style="margin:0 0 28px;color:#666666;font-size:13px;line-height:1.6;">This link expires in 15 minutes and works once.</p>
          <div style="height:1px;background:#e0e0e0;margin:0 0 24px;"></div>
          <p style="margin:0;color:#666666;font-size:13px;line-height:1.6;">Or copy this link into your browser:<br>
            <a href="${safeUrl}" style="color:#666666;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${safeUrl}</a>
          </p>
        </td></tr>
        <tr><td align="center" style="padding:28px 16px 0;">
          <p style="margin:0 0 4px;color:#666666;font-size:12px;line-height:1.6;">You received this because access to Page Studio was requested.</p>
          <p style="margin:0;color:#666666;font-size:12px;line-height:1.6;">If you did not request it, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  }
  const sendWithResend = async (resend: Resend | null) => {
    if (!resend) throw new Error('customer_email_unavailable')
    try {
      const result = await resend.emails.send({ ...message, from: `Page Studio <${config.from}>` })
      if (result.error) throw new Error('customer_email_delivery_failed')
    } catch {
      throw new Error('customer_email_delivery_failed')
    }
  }
  const key = customerResendKey(event)
  // An explicit product credential selects its own transport. The shared
  // portal gateway deliberately restricts senders to the ADME domain.
  if (key) {
    await sendWithResend(new Resend(key))
    return
  }
  await sendPortalAuthTransactionalEmail({ event, message, resendSend: () => sendWithResend(getResendClient(event)) })
}
