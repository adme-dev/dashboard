import { PublicSendCreateRequestSchema } from '../../../../shared/types/send'
import { sendPublicSendVerificationEmail } from '~~/server/utils/send/publicEmail'
import {
  requirePublicSendEnabled,
  resolvePublicSendPolicyConfig
} from '~~/server/utils/send/feature'
import {
  createPublicSendRateLimiter,
  PublicSendRateLimitError
} from '~~/server/utils/send/publicRateLimit'
import { createPublicSendService, PublicSendError } from '~~/server/utils/send/publicSender'
import { resolveClientIp } from '~~/server/utils/tracking/client-ip'
import { isTurnstileEnabled, verifyTurnstile } from '~~/server/utils/turnstile'

const rateLimiter = createPublicSendRateLimiter()

function publicEnv(event: unknown): Record<string, unknown> {
  return (event as { context?: { cloudflare?: { env?: Record<string, unknown> } } })
    .context?.cloudflare?.env ?? {}
}

function secureResponse(event: unknown): void {
  setResponseHeader(event, 'Cache-Control', 'no-store, max-age=0')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  setResponseHeader(event, 'X-Robots-Tag', 'noindex, nofollow')
}

export default defineEventHandler(async (event) => {
  requirePublicSendEnabled(event)
  secureResponse(event)

  const parsed = PublicSendCreateRequestSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid public Send request' })
  }
  if (!isTurnstileEnabled()) {
    throw createError({ statusCode: 503, statusMessage: 'Public Send verification is unavailable' })
  }

  const ip = resolveClientIp(
    getHeader(event, 'cf-connecting-ip'),
    getRequestIP(event, { xForwardedFor: true })
  )
  const env = publicEnv(event)
  const expectedHostname = typeof env.SEND_PUBLIC_TURNSTILE_HOSTNAME === 'string'
    ? env.SEND_PUBLIC_TURNSTILE_HOSTNAME
    : process.env.SEND_PUBLIC_TURNSTILE_HOSTNAME
  if (!expectedHostname || !await verifyTurnstile(parsed.data.turnstileToken, ip ?? undefined, {
    expectedAction: 'send-create',
    expectedHostname
  })) {
    throw createError({ statusCode: 403, statusMessage: 'Verification failed' })
  }

  try {
    await rateLimiter.checkCreate({
      limiter: env.RATE_LIMITER as never,
      salt: typeof env.SEND_PUBLIC_RATE_SALT === 'string'
        ? env.SEND_PUBLIC_RATE_SALT
        : process.env.SEND_PUBLIC_RATE_SALT || '',
      ip,
      email: parsed.data.email
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

  const service = createPublicSendService({
    sendVerification: input => sendPublicSendVerificationEmail(input, event)
  })
  try {
    await service.createDraft({
      email: parsed.data.email,
      draft: {
        title: parsed.data.title,
        message: parsed.data.message,
        expiresAt: parsed.data.expiresAt,
        maxDownloads: parsed.data.maxDownloads,
        idempotencyKey: parsed.data.idempotencyKey,
        recipients: []
      },
      policy: resolvePublicSendPolicyConfig(event)
    })
  } catch (error) {
    if (error instanceof PublicSendError) {
      if (error.code === 'SENDER_UNAVAILABLE' || error.code === 'DRAFT_CONFLICT') {
        return { ok: true, status: 'verification_pending' as const }
      }
      const statusCode = error.code === 'EMAIL_UNAVAILABLE'
        ? 503
        : error.code === 'INVALID_EMAIL'
          ? 400
          : 409
      throw createError({
        statusCode,
        statusMessage: statusCode === 503
          ? 'Verification email is temporarily unavailable'
          : 'Public Send request was not accepted'
      })
    }
    throw error
  }

  return { ok: true, status: 'verification_pending' as const }
})
