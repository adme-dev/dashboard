import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinancialAllocationResult } from '~~/shared/types/clientFinancials'

type TestEvent = {
  params?: Record<string, string | undefined>
  body?: unknown
}

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireWriteAccess: vi.fn(),
  getSelectedTenant: vi.fn(),
  applyAllocation: vi.fn(),
}))

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (event: TestEvent, name: string) => string | undefined
  readBody: (event: TestEvent) => Promise<unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (event, name) => event.params?.[name]
testGlobal.readBody = async event => event.body
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requirePermission: (...args: unknown[]) => mocks.requirePermission(...args),
  requireWriteAccess: (...args: unknown[]) => mocks.requireWriteAccess(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mocks.getSelectedTenant(...args),
}))

vi.mock('~~/server/utils/clientFinancialAllocations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/clientFinancialAllocations')>()
  return {
    ...actual,
    applyClientFinancialAllocation: (...args: unknown[]) => mocks.applyAllocation(...args),
  }
})

import { ClientFinancialAllocationError } from '~~/server/utils/clientFinancialAllocations'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const MEDIA_ID = '55555555-5555-4555-8555-555555555555'
const ACTOR_ID = '66666666-6666-4666-8666-666666666666'

function event(body: unknown): TestEvent {
  return { params: { id: CLIENT_ID }, body }
}

describe('PATCH /api/agency/clients/:id/financial-allocations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePermission.mockResolvedValue({ id: ACTOR_ID, role: 'finance' })
    mocks.requireWriteAccess.mockResolvedValue({ id: ACTOR_ID, role: 'finance' })
    mocks.getSelectedTenant.mockResolvedValue('tenant-selected')
    mocks.applyAllocation.mockResolvedValue({
      sourceType: 'media_spend',
      sourceId: MEDIA_ID,
      previousProjectId: null,
      projectId: PROJECT_ID,
      changedAt: '2026-08-22T04:05:06.000Z',
    } satisfies FinancialAllocationResult)
  })

  it('requires FINANCE and write access without resolving a Xero tenant for media', async () => {
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )
    const request = event({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    })

    await handler(request as never)

    expect(mocks.requirePermission).toHaveBeenCalledWith(request, 'FINANCE')
    expect(mocks.requireWriteAccess).toHaveBeenCalledWith(request)
    expect(mocks.getSelectedTenant).not.toHaveBeenCalled()
    expect(mocks.applyAllocation).toHaveBeenCalledWith({
      tenantId: null,
      clientId: CLIENT_ID,
      actorId: ACTOR_ID,
      mutation: { sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID },
    })
  })

  it('rejects a read-only custom FINANCE role before applying a mutation', async () => {
    mocks.requireWriteAccess.mockRejectedValue(Object.assign(new Error('read only'), { statusCode: 403 }))
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    }) as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.applyAllocation).not.toHaveBeenCalled()
  })

  it.each([
    [{ sourceType: 'media_spend', sourceId: '', projectId: PROJECT_ID }],
    [{ sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: 'not-a-uuid' }],
    [{ sourceType: 'xero_line', sourceId: '', projectId: PROJECT_ID }],
    [{ sourceType: 'xero_line', sourceId: 'x'.repeat(513), projectId: PROJECT_ID }],
    [{ sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: 'not-a-uuid' }],
    [{ sourceType: 'client_tracking', trackingOptionId: 'tracking-1', trackingOptionName: '' }],
    [{
      sourceType: 'client_tracking',
      trackingOptionId: 'tracking-1',
      trackingOptionName: 'x'.repeat(256),
    }],
    [{ sourceType: 'unknown', sourceId: MEDIA_ID, projectId: PROJECT_ID }],
    [{ sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID, amount: 999999 }],
    [{
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
      tenantId: 'browser-tenant', clientId: CLIENT_ID,
    }],
  ])('rejects malformed, unknown, and snapshot-bearing bodies with 400', async (body) => {
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event(body) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.applyAllocation).not.toHaveBeenCalled()
  })

  it.each([
    { sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID },
    { sourceType: 'client_tracking', trackingOptionId: 'tracking-1', trackingOptionName: 'Astoria' },
  ])('requires a selected tenant for $sourceType mutations', async (body) => {
    mocks.getSelectedTenant.mockResolvedValue(null)
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event(body) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.applyAllocation).not.toHaveBeenCalled()
  })

  it('allows media allocation without a selected Xero tenant', async () => {
    mocks.getSelectedTenant.mockResolvedValue(null)
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: null,
    }) as never)).resolves.toMatchObject({ sourceType: 'media_spend' })
    expect(mocks.getSelectedTenant).not.toHaveBeenCalled()
    expect(mocks.applyAllocation).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }))
  })

  it.each([
    ['source_not_found', 404],
    ['invalid_assignment', 422],
    ['stale_source', 409],
  ] as const)('maps %s service errors to %i', async (code, statusCode) => {
    mocks.applyAllocation.mockRejectedValue(new ClientFinancialAllocationError(code))
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    }) as never)).rejects.toMatchObject({ statusCode })
  })

  it('returns the exact service result without performing browser-style financial math', async () => {
    const serviceResult: FinancialAllocationResult = {
      sourceType: 'xero_line',
      sourceId: 'invoice-1:0',
      previousProjectId: null,
      projectId: PROJECT_ID,
      changedAt: '2026-08-22T04:05:06.000Z',
    }
    mocks.applyAllocation.mockResolvedValue(serviceResult)
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    const response = await handler(event({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    }) as never)

    expect(response).toBe(serviceResult)
    expect(Object.keys(response)).toEqual([
      'sourceType', 'sourceId', 'previousProjectId', 'projectId', 'changedAt',
    ])
  })

  it('does not leak unexpected repository errors', async () => {
    mocks.applyAllocation.mockRejectedValue(new Error('SELECT token FROM xero_org_connection'))
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    }) as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to update client financial allocation',
    })
  })

  it('does not let a selected-tenant session lookup failure affect media allocation', async () => {
    mocks.getSelectedTenant.mockRejectedValue(new Error('KV token payload'))
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event({
      sourceType: 'media_spend', sourceId: MEDIA_ID, projectId: PROJECT_ID,
    }) as never)).resolves.toMatchObject({ sourceType: 'media_spend' })
    expect(mocks.getSelectedTenant).not.toHaveBeenCalled()
    expect(mocks.applyAllocation).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }))
  })

  it('does not leak a selected-tenant session lookup failure for Xero allocation', async () => {
    mocks.getSelectedTenant.mockRejectedValue(new Error('KV token payload'))
    const { default: handler } = await import(
      '~~/server/api/agency/clients/[id]/financial-allocations.patch'
    )

    await expect(handler(event({
      sourceType: 'xero_line', sourceId: 'invoice-1:0', projectId: PROJECT_ID,
    }) as never)).rejects.toMatchObject({
      statusCode: 500,
      statusMessage: 'Failed to update client financial allocation',
    })
    expect(mocks.applyAllocation).not.toHaveBeenCalled()
  })
})
