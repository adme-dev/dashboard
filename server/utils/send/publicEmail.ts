import type { H3Event } from 'h3'
import { getAppUrl } from '~~/server/utils/appUrl'
import { getCachedBinding, getResendClient } from '~~/server/utils/email'
import type { PublicVerificationDelivery } from './publicSender'

interface VerificationLinkInput {
  transferId: string
  verificationToken: string
  managementToken: string
}

function eventBinding(event: H3Event | undefined, key: string): string | undefined {
  const value = event
    ? (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env?.[key]
    : undefined
  return typeof value === 'string' ? value : getCachedBinding(key)
}

export function buildPublicSendVerificationUrl(
  appUrl: string,
  input: VerificationLinkInput
): string {
  const base = new URL('/send/verify', appUrl)
  const fragment = new URLSearchParams({
    transfer: input.transferId,
    verification: input.verificationToken,
    management: input.managementToken
  })
  base.hash = fragment.toString()
  return base.toString()
}

export async function sendPublicSendVerificationEmail(
  input: PublicVerificationDelivery,
  event?: H3Event
): Promise<void> {
  const client = getResendClient(event)
  if (!client) throw new Error('Public Send email transport is unavailable')

  const appName = eventBinding(event, 'APP_NAME') || 'XeroFlow Agency'
  const fromEmail = eventBinding(event, 'EMAIL_FROM') || 'notification@adme.net.au'
  const verificationUrl = buildPublicSendVerificationUrl(getAppUrl(event), input)
  const htmlUrl = verificationUrl.replace(/&/g, '&amp;')
  const expiry = new Date(input.verificationExpiresAt).toISOString()

  await client.emails.send({
    from: `${appName} <${fromEmail}>`,
    to: input.email,
    subject: 'Verify your XeroFlow Send transfer',
    html: `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:32px;color:#111">
  <main style="max-width:560px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:16px;padding:32px">
    <h1 style="font-size:24px;margin:0 0 16px">Verify your Send transfer</h1>
    <p style="line-height:1.6">Confirm this email address before uploading files. The link is single-use and expires in 15 minutes.</p>
    <p style="margin:28px 0"><a href="${htmlUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;border-radius:999px;padding:13px 22px">Verify and continue</a></p>
    <p style="font-size:12px;color:#666;line-height:1.5">If you did not request this transfer, ignore this email. Do not forward this link; it also contains the private management capability for this transfer.</p>
  </main>
</body></html>`,
    text: [
      'Verify your XeroFlow Send transfer',
      '',
      'Confirm this email address before uploading files.',
      `This single-use link expires at ${expiry}:`,
      verificationUrl,
      '',
      'If you did not request this transfer, ignore this email. Do not forward the link.'
    ].join('\n')
  })
}
