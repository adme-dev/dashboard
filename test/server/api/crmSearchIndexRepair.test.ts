import { describe, expect, it, vi } from 'vitest'

import {
  createCrmSearchIndexRepairPostHandler,
  resolveCrmSearchCronSecret
} from '../../../server/api/cron/crm-search-index-repair.post'

const success = {
  dirtyClaimed: 1,
  operationsCreated: 1,
  operationsPublished: 1,
  operationsRescheduled: 0,
  skippedByControl: 0
} as const

function event(secret = 'provided-secret') {
  return {
    context: {},
    node: { req: { headers: { 'x-cron-secret': secret } } }
  } as never
}

describe('POST /api/cron/crm-search-index-repair', () => {
  it('fails closed before publisher work when the configured secret is absent', async () => {
    const publish = vi.fn(async () => success)
    const handler = createCrmSearchIndexRepairPostHandler({
      resolveExpectedSecret: () => null,
      readSuppliedSecret: () => 'provided-secret',
      publish
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(publish).not.toHaveBeenCalled()
  })

  it('rejects an invalid secret before expansion or operation lookup', async () => {
    const publish = vi.fn(async () => success)
    const handler = createCrmSearchIndexRepairPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'wrong-secret',
      publish
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(publish).not.toHaveBeenCalled()
  })

  it('rejects oversized cron credentials before hashing or publisher work', async () => {
    const publish = vi.fn(async () => success)
    const handler = createCrmSearchIndexRepairPostHandler({
      resolveExpectedSecret: () => 'x'.repeat(257),
      readSuppliedSecret: () => 'x'.repeat(257),
      publish
    })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 401 })
    expect(publish).not.toHaveBeenCalled()
  })

  it('runs the bounded repair publisher after constant-time cron authentication', async () => {
    const publish = vi.fn(async () => success)
    const handler = createCrmSearchIndexRepairPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      publish
    })

    await expect(handler(event())).resolves.toEqual(success)
    expect(publish).toHaveBeenCalledWith(event(), { limit: 25 })
  })

  it('returns a new count-only projection and rejects hostile publisher outcomes', async () => {
    const hostile = Object.assign(Object.create({
      toJSON: () => ({ secret: 'must-not-serialize' })
    }), success)
    const handler = createCrmSearchIndexRepairPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      publish: async () => hostile
    })

    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })

    const dependencyResult = { ...success }
    const safeHandler = createCrmSearchIndexRepairPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      publish: async () => dependencyResult
    })
    const response = await safeHandler(event())
    expect(response).toEqual(success)
    expect(response).not.toBe(dependencyResult)
  })

  it('rejects counts outside the fixed 25-source/eight-schema repair bound', async () => {
    const handler = createCrmSearchIndexRepairPostHandler({
      resolveExpectedSecret: () => 'expected-secret',
      readSuppliedSecret: () => 'expected-secret',
      publish: async () => ({ ...success, operationsCreated: 201 })
    })
    await expect(handler(event())).rejects.toMatchObject({ statusCode: 503 })
  })

  it('prefers the exact Cloudflare secret binding and fails closed on a malformed binding', () => {
    process.env.CRON_SECRET = 'process-secret'
    expect(resolveCrmSearchCronSecret({
      context: { cloudflare: { env: { CRON_SECRET: 'runtime-secret' } } }
    } as never)).toBe('runtime-secret')
    expect(resolveCrmSearchCronSecret({
      context: { cloudflare: { env: { CRON_SECRET: 123 } } }
    } as never)).toBeNull()
    delete process.env.CRON_SECRET
  })
})
