import type { H3Event } from 'h3'
import {
  sendViaCloudflareEmailGateway,
  type CloudflareEmailGatewayMessage,
  type CloudflareEmailGatewayResult
} from '~~/server/utils/cloudflareEmailGateway'

interface PortalAuthEmailTransportOptions {
  event: H3Event
  message: CloudflareEmailGatewayMessage
  resendSend: () => Promise<void>
  cloudflareSend?: (
    event: H3Event,
    message: CloudflareEmailGatewayMessage
  ) => Promise<CloudflareEmailGatewayResult>
}

export async function sendPortalAuthTransactionalEmail(
  options: PortalAuthEmailTransportOptions
): Promise<'cloudflare_email' | 'resend'> {
  const cloudflareSend = options.cloudflareSend
    ?? sendViaCloudflareEmailGateway
  const result = await cloudflareSend(options.event, options.message)

  if (result.outcome === 'accepted') return 'cloudflare_email'
  if (result.outcome === 'permanent_failure') {
    throw new Error(result.errorClass || 'cloudflare_email_permanent_failure')
  }

  await options.resendSend()
  return 'resend'
}
