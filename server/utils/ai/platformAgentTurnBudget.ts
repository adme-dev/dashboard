import { transaction as defaultTransaction } from '~~/server/utils/db'

const DEFAULT_MAX_TURNS_PER_USER = 10
const DEFAULT_MAX_TURNS_GLOBAL = 50
const WINDOW_SECONDS = 86_400
const GLOBAL_BUCKET_KEY = 'platform-agent:turns:global'

export interface PlatformAgentTurnBudgetLimits {
  maxTurnsPerUser: number
  maxTurnsGlobal: number
  windowSeconds: number
}

export type PlatformAgentTurnBudgetDecision
  = | {
    allowed: true
    userRemaining: number
    globalRemaining: number
    resetAt: string
  }
    | {
      allowed: false
      code: 'user_daily_turn_limit' | 'global_daily_turn_limit'
      retryAfterSeconds: number
      resetAt: string
    }
    | {
      allowed: false
      code: 'budget_unavailable'
      retryAfterSeconds: 60
    }

interface BudgetRow {
  key: string
  count: number | string
  window_started_at: string | Date
}

interface BudgetDb {
  query(sql: string, params?: unknown[]): Promise<{ rows?: BudgetRow[] }>
}

interface PlatformAgentTurnBudgetDeps {
  now(): Date
  transaction<T>(callback: (db: BudgetDb) => Promise<T>): Promise<T>
}

const defaultDeps: PlatformAgentTurnBudgetDeps = {
  now: () => new Date(),
  transaction: callback => defaultTransaction(db => callback(db as unknown as BudgetDb))
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : fallback
}

export function platformAgentTurnBudgetLimitsFromEnv(
  env: Record<string, string | undefined> = process.env
): PlatformAgentTurnBudgetLimits {
  return {
    maxTurnsPerUser: positiveInteger(
      env.PLATFORM_AGENT_MAX_TURNS_PER_USER_DAY,
      DEFAULT_MAX_TURNS_PER_USER
    ),
    maxTurnsGlobal: positiveInteger(
      env.PLATFORM_AGENT_MAX_TURNS_PER_DAY,
      DEFAULT_MAX_TURNS_GLOBAL
    ),
    windowSeconds: WINDOW_SECONDS
  }
}

function activeBucket(row: BudgetRow | undefined, now: Date, windowSeconds: number) {
  const startedAt = row ? new Date(row.window_started_at) : now
  const validStartedAt = Number.isFinite(startedAt.getTime()) ? startedAt : now
  const resetAt = new Date(validStartedAt.getTime() + windowSeconds * 1_000)
  const active = row && resetAt.getTime() > now.getTime()
  return {
    count: active ? Math.max(0, Number(row.count) || 0) : 0,
    resetAt: active ? resetAt : new Date(now.getTime() + windowSeconds * 1_000)
  }
}

function retryAfterSeconds(now: Date, resetAt: Date): number {
  return Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1_000))
}

export async function consumePlatformAgentTurnBudget(
  input: { userId: string, limits: PlatformAgentTurnBudgetLimits },
  deps: PlatformAgentTurnBudgetDeps = defaultDeps
): Promise<PlatformAgentTurnBudgetDecision> {
  const userBucketKey = `platform-agent:turns:user:${input.userId}`

  try {
    return await deps.transaction(async (db) => {
      await db.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('platform-agent:turn-budget', 0))`
      )
      const current = await db.query(
        `SELECT key, count, window_started_at
           FROM ratelimit_buckets
          WHERE key = ANY($1::text[])`,
        [[GLOBAL_BUCKET_KEY, userBucketKey]]
      )
      const rows = new Map((current.rows ?? []).map(row => [row.key, row]))
      const now = deps.now()
      const user = activeBucket(rows.get(userBucketKey), now, input.limits.windowSeconds)
      const global = activeBucket(rows.get(GLOBAL_BUCKET_KEY), now, input.limits.windowSeconds)

      if (user.count >= input.limits.maxTurnsPerUser) {
        return {
          allowed: false,
          code: 'user_daily_turn_limit',
          retryAfterSeconds: retryAfterSeconds(now, user.resetAt),
          resetAt: user.resetAt.toISOString()
        }
      }
      if (global.count >= input.limits.maxTurnsGlobal) {
        return {
          allowed: false,
          code: 'global_daily_turn_limit',
          retryAfterSeconds: retryAfterSeconds(now, global.resetAt),
          resetAt: global.resetAt.toISOString()
        }
      }

      await db.query(
        `INSERT INTO ratelimit_buckets (key, count, window_started_at)
         VALUES ($1, 1, NOW()), ($2, 1, NOW())
         ON CONFLICT (key) DO UPDATE
         SET count = CASE
               WHEN ratelimit_buckets.window_started_at < NOW() - ($3::integer * INTERVAL '1 second') THEN 1
               ELSE ratelimit_buckets.count + 1
             END,
             window_started_at = CASE
               WHEN ratelimit_buckets.window_started_at < NOW() - ($3::integer * INTERVAL '1 second') THEN NOW()
               ELSE ratelimit_buckets.window_started_at
             END`,
        [GLOBAL_BUCKET_KEY, userBucketKey, input.limits.windowSeconds]
      )

      return {
        allowed: true,
        userRemaining: Math.max(0, input.limits.maxTurnsPerUser - user.count - 1),
        globalRemaining: Math.max(0, input.limits.maxTurnsGlobal - global.count - 1),
        resetAt: new Date(Math.min(user.resetAt.getTime(), global.resetAt.getTime())).toISOString()
      }
    })
  } catch {
    console.warn(JSON.stringify({
      event: 'platform_agent_turn_budget_unavailable',
      status: 'denied',
      reason: 'database_error'
    }))
    return {
      allowed: false,
      code: 'budget_unavailable',
      retryAfterSeconds: 60
    }
  }
}
