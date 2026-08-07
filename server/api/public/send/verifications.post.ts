import { PublicSendVerifyRequestSchema } from '../../../../shared/types/send'
import { requirePublicSendEnabled } from '~~/server/utils/send/feature'
import {
  createPublicSendRateLimiter,
  PublicSendRateLimitError
} from '~~/server/utils/send/publicRateLimit'
import { createPublicSendService, PublicSendError } from '~~/server/utils/send/publicSender'
import { resolveClientIp } from '~~/server/utils/tracking/client-ip'
import { isTurnstileEnabled, verifyTurnstile } from '~~/server/utils/turnstile'

const rateLimiter = createPublicSendRateLimiter()
const service = createPublicSendService()

export default defineEventHandler(async (event) => {
  requirePublicSendEnabled(event)
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')

  const parsed = PublicSendVerifyRequestSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid verification request' })
  }
  if (!isTurnstileEnabled()) {
    throw createError({ statusCode: 503, statusMessage: 'Public Send verification is unavailable' })
  }

  const ip = resolveClientIp(
    getHeader(event, 'cf-connecting-ip'),
    getRequestIP(event, { xForwardedFor: true })
  )
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } })
    .cloudflare?.env ?? {}
  const expectedHostname = typeof env.SEND_PUBLIC_TURNSTILE_HOSTNAME === 'string'
    ? env.SEND_PUBLIC_TURNSTILE_HOSTNAME
    : process.env.SEND_PUBLIC_TURNSTILE_HOSTNAME
  if (!expectedHostname || !await verifyTurnstile(parsed.data.turnstileToken, ip ?? undefined, {
    expectedAction: 'send-verify',
    expectedHostname
  })) {
    throw createError({ statusCode: 403, statusMessage: 'Verification failed' })
  }
  try {
    await rateLimiter.checkVerify({
      limiter: env.RATE_LIMITER as never,
      salt: typeof env.SEND_PUBLIC_RATE_SALT === 'string'
        ? env.SEND_PUBLIC_RATE_SALT
        : process.env.SEND_PUBLIC_RATE_SALT || '',
      ip
    })
  } catch (error) {
    if (error instanceof PublicSendRateLimitError) {
      if (error.code === 'RATE_LIMITED') {
        setResponseHeader(event, 'Retry-After', error.retryAfterSec ?? 900)
        throw createError({ statusCode: 429, statusMessage: 'Please wait before trying again' })
      }
      throw createError({ statusCode: 503, statusMessage: 'Public Send is temporarily unavailable' })
    }
    throw error
  }

  try {
    const verified = await service.verifySender({
      transferId: parsed.data.transferId,
      verificationToken: parsed.data.verificationToken,
      managementToken: parsed.data.managementToken
    })
    return { ok: true, transferId: verified.transferId, status: verified.status }
  } catch (error) {
    if (error instanceof PublicSendError) {
      const statusCode = error.code === 'VERIFICATION_EXPIRED' ? 410 : 400
      throw createError({ statusCode, statusMessage: 'Verification link is invalid or expired' })
    }
    throw error
  }
})
