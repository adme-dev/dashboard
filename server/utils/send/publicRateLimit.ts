import { createHmac } from 'node:crypto'
import {
  rateCheck as defaultRateCheck,
  type RateLimiterNamespace,
  type RateVerdict
} from '~~/server/utils/tracking/rate-limit'

const WINDOW_MS = 15 * 60 * 1000

export type PublicSendRateLimitErrorCode = 'RATE_LIMIT_UNAVAILABLE' | 'RATE_LIMITED'

export class PublicSendRateLimitError extends Error {
  constructor(
    public readonly code: PublicSendRateLimitErrorCode,
    message: string,
    public readonly retryAfterSec?: number
  ) {
    super(message)
    this.name = 'PublicSendRateLimitError'
  }
}

export interface PublicSendRateLimiterDeps {
  rateCheck: typeof defaultRateCheck
}

function actorHash(salt: string, value: string): string {
  return createHmac('sha256', salt).update(value, 'utf8').digest('hex')
}

function retryAfter(verdict: RateVerdict): number {
  const value = Number(verdict.retryAfterSec)
  return Number.isFinite(value) ? Math.max(1, Math.min(900, Math.ceil(value))) : 900
}

export function createPublicSendRateLimiter(overrides: Partial<PublicSendRateLimiterDeps> = {}) {
  const deps: PublicSendRateLimiterDeps = {
    rateCheck: overrides.rateCheck ?? defaultRateCheck
  }

  async function checkedRate(
    limiter: RateLimiterNamespace,
    options: Parameters<typeof defaultRateCheck>[1]
  ): Promise<RateVerdict> {
    try {
      return await deps.rateCheck(limiter, options)
    } catch {
      throw new PublicSendRateLimitError(
        'RATE_LIMIT_UNAVAILABLE',
        'Public Send rate limiting is unavailable'
      )
    }
  }

  return {
    async checkCreate(input: {
      limiter?: RateLimiterNamespace
      salt: string
      ip: string | null
      email: string
    }): Promise<{ allowed: true }> {
      if (!input.limiter || input.salt.length < 32 || !input.ip) {
        throw new PublicSendRateLimitError(
          'RATE_LIMIT_UNAVAILABLE',
          'Public Send rate limiting is unavailable'
        )
      }
      const ipHash = actorHash(input.salt, `ip\0${input.ip}`)
      const emailHash = actorHash(input.salt, `email\0${input.email.trim().toLowerCase()}`)

      const burst = await checkedRate(input.limiter, {
        writeKey: 'send-public-create',
        ipHash,
        keyLimit: 300,
        ipLimit: 5,
        windowMs: WINDOW_MS
      })
      if (!burst.allowed) {
        throw new PublicSendRateLimitError(
          'RATE_LIMITED',
          'Too many public Send requests',
          retryAfter(burst)
        )
      }

      const email = await checkedRate(input.limiter, {
        writeKey: `send-public-email:${emailHash}`,
        ipHash: null,
        keyLimit: 3,
        ipLimit: 3,
        windowMs: WINDOW_MS
      })
      if (!email.allowed) {
        throw new PublicSendRateLimitError(
          'RATE_LIMITED',
          'Too many public Send requests',
          retryAfter(email)
        )
      }
      return { allowed: true }
    },

    async checkVerify(input: {
      limiter?: RateLimiterNamespace
      salt: string
      ip: string | null
    }): Promise<{ allowed: true }> {
      if (!input.limiter || input.salt.length < 32 || !input.ip) {
        throw new PublicSendRateLimitError(
          'RATE_LIMIT_UNAVAILABLE',
          'Public Send rate limiting is unavailable'
        )
      }
      const verdict = await checkedRate(input.limiter, {
        writeKey: 'send-public-verify',
        ipHash: actorHash(input.salt, `ip\0${input.ip}`),
        keyLimit: 300,
        ipLimit: 10,
        windowMs: WINDOW_MS
      })
      if (!verdict.allowed) {
        throw new PublicSendRateLimitError(
          'RATE_LIMITED',
          'Too many public Send requests',
          retryAfter(verdict)
        )
      }
      return { allowed: true }
    }
  }
}
