/**
 * Lightweight DB-backed rate limiter.
 *
 * Stores per-key counters in `ratelimit_buckets`. Each call increments and
 * resets the window after the configured duration. Used to bound LLM-cost
 * endpoints (Workers AI score refinement, Groq why-this-notification).
 *
 * The store is the same Postgres we use for everything else — keeps the
 * implementation simple and available everywhere createNotification runs
 * (no need for KV/Redis bindings). For very high-throughput endpoints
 * we'd swap to KV; for the current usage this is plenty.
 */
import { queryOneFresh, execute } from '~~/server/utils/db'

export interface RateLimitOptions {
  /** Unique identifier — typically `${feature}:${userId}` */
  key: string
  /** Max calls allowed per window */
  limit: number
  /** Window length in seconds */
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

/**
 * Check + increment in a single round-trip.
 * Resets the window when the existing one has expired.
 *
 * Failures fail OPEN — better to skip rate limiting on a DB hiccup than to
 * accidentally lock all users out of a feature.
 */
export async function checkAndConsume(opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = new Date()
  const windowMs = opts.windowSeconds * 1000

  try {
    const row = await queryOneFresh(`
      INSERT INTO ratelimit_buckets (key, count, window_started_at)
      VALUES ($1, 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET
        count = CASE
          WHEN ratelimit_buckets.window_started_at < NOW() - ($2 || ' seconds')::interval THEN 1
          ELSE ratelimit_buckets.count + 1
        END,
        window_started_at = CASE
          WHEN ratelimit_buckets.window_started_at < NOW() - ($2 || ' seconds')::interval THEN NOW()
          ELSE ratelimit_buckets.window_started_at
        END
      RETURNING count, window_started_at
    `, [opts.key, opts.windowSeconds])

    const count = row?.count ?? 1
    const windowStart = row?.window_started_at ? new Date(row.window_started_at) : now
    const resetAt = new Date(windowStart.getTime() + windowMs)
    return {
      allowed: count <= opts.limit,
      remaining: Math.max(0, opts.limit - count),
      resetAt,
    }
  } catch (err) {
    console.error('[rateLimit] DB error — failing open:', err)
    return { allowed: true, remaining: opts.limit, resetAt: new Date(now.getTime() + windowMs) }
  }
}

/**
 * Convenience: enforce a limit, throwing 429 when exceeded.
 */
export async function enforceRateLimit(event: any, opts: RateLimitOptions): Promise<void> {
  const result = await checkAndConsume(opts)
  if (!result.allowed) {
    throw createError({
      statusCode: 429,
      statusMessage: `Rate limit exceeded. Try again after ${result.resetAt.toISOString()}`,
    })
  }
}

/**
 * Best-effort cleanup of expired ratelimit rows. Call from a cron worker
 * if you want, otherwise the table self-heals on next ON CONFLICT.
 */
export async function cleanupExpiredBuckets(maxAgeSeconds = 86400): Promise<void> {
  try {
    await execute(
      `DELETE FROM ratelimit_buckets WHERE window_started_at < NOW() - ($1 || ' seconds')::interval`,
      [maxAgeSeconds]
    )
  } catch (err) {
    console.error('[rateLimit] cleanup failed:', err)
  }
}
