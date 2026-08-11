import { describe, expect, it, vi } from 'vitest'

import {
  createCrmSearchReconcilePostHandler,
  resolveCrmSearchReconcileCronSecret
} from '../../../server/api/cron/crm-search-reconcile.post'

const success = {
  claimed: 3,
  indexed: 1,
  deleted: 1,
  rescheduled: 1,
  deadLettered: 0
} as const

function event(secret = 'provided-secret') {
  return {
    context: {},
    node: { req: { headers: { 'x-cron-secret': secret } } }
  } as never
}

describe('POST /api/cron/crm-search-reconcile', () => {
  it.each([null, 'wrong-secret'])('fails closed before provider work with secret %s', async (supplied) => {
    const reconcile = vi.fn(async () => success)
    const handler = createCrmSearchReconcilePostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => supplied,
      reconcile
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('fails closed when the configured secret is missing or malformed', async () => {
    const reconcile = vi.fn(async () => success)
    const missing = createCrmSearchReconcilePostHandler({
      resolveExpectedSecret: () => null,
      readSuppliedSecret: () => 'provided-secret',
      reconcile
    })
    const oversized = createCrmSearchReconcilePostHandler({
      resolveExpectedSecret: () => 'x'.repeat(257),
      readSuppliedSecret: () => 'x'.repeat(257),
      reconcile
    })

    await expect(missing(event())).rejects.toMatchObject({ statusCode: 401 })
    await expect(oversized(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(reconcile).not.toHaveBeenCalled()
  })

  it('runs a fixed bounded reconciliation pass after authentication', async () => {
    const reconcile = vi.fn(async () => success)
    const now = vi.fn(() => '2026-08-10T00:00:00.000Z')
    const handler = createCrmSearchReconcilePostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      reconcile,
      now
    })

    await expect(handler(event())).resolves.toEqual(success)
    expect(reconcile).toHaveBeenCalledWith(event(), {
      limit: 25,
      now: '2026-08-10T00:00:00.000Z'
    })
  })

  it('returns a new count-only projection and rejects hostile or out-of-bound outcomes', async () => {
    const hostile = Object.assign(Object.create({
      toJSON: () => ({ providerDetail: 'must-not-serialize' })
    }), success)
    const hostileHandler = createCrmSearchReconcilePostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      reconcile: async () => hostile
    })
    await expect(hostileHandler(event())).rejects.toMatchObject({ statusCode: 503 })

    const oversizedHandler = createCrmSearchReconcilePostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      reconcile: async () => ({ ...success, indexed: 26 })
    })
    await expect(oversizedHandler(event())).rejects.toMatchObject({ statusCode: 503 })

    const dependencyResult = { ...success }
    const safeHandler = createCrmSearchReconcilePostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      reconcile: async () => dependencyResult
    })
    const result = await safeHandler(event())
    expect(result).toEqual(success)
    expect(result).not.toBe(dependencyResult)
  })

  it('prefers the exact Cloudflare secret binding and fails closed on malformed bindings', () => {
    process.env.CRON_SECRET = 'process-secret'
    expect(resolveCrmSearchReconcileCronSecret({
      context: { cloudflare: { env: { CRON_SECRET: 'runtime-secret' } } }
    } as never)).toBe('runtime-secret')
    expect(resolveCrmSearchReconcileCronSecret({
      context: { cloudflare: { env: { CRON_SECRET: 123 } } }
    } as never)).toBeNull()
    delete process.env.CRON_SECRET
  })
})
