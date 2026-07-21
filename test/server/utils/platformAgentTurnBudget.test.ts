import { describe, expect, it, vi } from 'vitest'
import {
  consumePlatformAgentTurnBudget,
  platformAgentTurnBudgetLimitsFromEnv
} from '~~/server/utils/ai/platformAgentTurnBudget'

const NOW = new Date('2026-07-22T00:00:00.000Z')

function budgetDeps(rows: Array<{ key: string, count: number, window_started_at: string }>) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows })
    .mockResolvedValue({ rows: [] })

  return {
    query,
    deps: {
      now: () => NOW,
      transaction: async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query })
    }
  }
}

describe('platform agent rolling turn budget', () => {
  it('uses conservative defaults when environment limits are absent or invalid', () => {
    expect(platformAgentTurnBudgetLimitsFromEnv({})).toEqual({
      maxTurnsPerUser: 10,
      maxTurnsGlobal: 50,
      windowSeconds: 86_400
    })
    expect(platformAgentTurnBudgetLimitsFromEnv({
      PLATFORM_AGENT_MAX_TURNS_PER_USER_DAY: '0',
      PLATFORM_AGENT_MAX_TURNS_PER_DAY: 'not-a-number'
    })).toEqual({
      maxTurnsPerUser: 10,
      maxTurnsGlobal: 50,
      windowSeconds: 86_400
    })
  })

  it('serializes the global budget check and consumes both counters only when admitted', async () => {
    const { query, deps } = budgetDeps([
      { key: 'platform-agent:turns:global', count: 9, window_started_at: '2026-07-21T12:00:00.000Z' },
      { key: 'platform-agent:turns:user:user-123', count: 2, window_started_at: '2026-07-21T12:00:00.000Z' }
    ])

    await expect(consumePlatformAgentTurnBudget({
      userId: 'user-123',
      limits: { maxTurnsPerUser: 10, maxTurnsGlobal: 50, windowSeconds: 86_400 }
    }, deps as never)).resolves.toEqual({
      allowed: true,
      userRemaining: 7,
      globalRemaining: 40,
      resetAt: '2026-07-22T12:00:00.000Z'
    })

    expect(query).toHaveBeenCalledTimes(3)
    expect(String(query.mock.calls[0]?.[0])).toContain('pg_advisory_xact_lock')
    expect(query.mock.calls[2]?.[1]).toEqual([
      'platform-agent:turns:global',
      'platform-agent:turns:user:user-123',
      86_400
    ])
  })

  it('denies at the user limit without consuming either counter', async () => {
    const { query, deps } = budgetDeps([
      { key: 'platform-agent:turns:global', count: 12, window_started_at: '2026-07-21T01:00:00.000Z' },
      { key: 'platform-agent:turns:user:user-123', count: 10, window_started_at: '2026-07-21T01:00:00.000Z' }
    ])

    await expect(consumePlatformAgentTurnBudget({
      userId: 'user-123',
      limits: { maxTurnsPerUser: 10, maxTurnsGlobal: 50, windowSeconds: 86_400 }
    }, deps as never)).resolves.toEqual({
      allowed: false,
      code: 'user_daily_turn_limit',
      retryAfterSeconds: 3_600,
      resetAt: '2026-07-22T01:00:00.000Z'
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('denies at the company-wide limit before consuming the user counter', async () => {
    const { query, deps } = budgetDeps([
      { key: 'platform-agent:turns:global', count: 50, window_started_at: '2026-07-21T23:00:00.000Z' }
    ])

    await expect(consumePlatformAgentTurnBudget({
      userId: 'user-123',
      limits: { maxTurnsPerUser: 10, maxTurnsGlobal: 50, windowSeconds: 86_400 }
    }, deps as never)).resolves.toMatchObject({
      allowed: false,
      code: 'global_daily_turn_limit',
      retryAfterSeconds: 82_800
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('starts fresh counters when the rolling window has expired', async () => {
    const { query, deps } = budgetDeps([
      { key: 'platform-agent:turns:global', count: 50, window_started_at: '2026-07-20T23:59:59.000Z' },
      { key: 'platform-agent:turns:user:user-123', count: 10, window_started_at: '2026-07-20T23:59:59.000Z' }
    ])

    await expect(consumePlatformAgentTurnBudget({
      userId: 'user-123',
      limits: { maxTurnsPerUser: 10, maxTurnsGlobal: 50, windowSeconds: 86_400 }
    }, deps as never)).resolves.toEqual({
      allowed: true,
      userRemaining: 9,
      globalRemaining: 49,
      resetAt: '2026-07-23T00:00:00.000Z'
    })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('fails closed when the budget store cannot be verified', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('database unavailable'))

    await expect(consumePlatformAgentTurnBudget({
      userId: 'user-123',
      limits: { maxTurnsPerUser: 10, maxTurnsGlobal: 50, windowSeconds: 86_400 }
    }, {
      now: () => NOW,
      transaction
    } as never)).resolves.toEqual({
      allowed: false,
      code: 'budget_unavailable',
      retryAfterSeconds: 60
    })
  })
})
