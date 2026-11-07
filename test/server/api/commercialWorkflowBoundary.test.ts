/* eslint-disable @typescript-eslint/no-explicit-any, @stylistic/max-statements-per-line */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ commercial: vi.fn(), queryRows: vi.fn(), queryOne: vi.fn(), execute: vi.fn(), transaction: vi.fn(), body: vi.fn() }))
vi.mock('~~/server/utils/commercialAccess', () => ({ assertCommercialPermission: mocks.commercial }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'staff' })) }))
vi.mock('~~/server/utils/db', () => mocks)
vi.stubGlobal('requireAuth', vi.fn(async () => ({ id: 'staff' })))
vi.stubGlobal('defineEventHandler', (handler: any) => handler)
vi.stubGlobal('eventHandler', (handler: any) => handler)
vi.stubGlobal('getQuery', () => ({}))
vi.stubGlobal('getRouterParam', () => 'client')
vi.stubGlobal('readBody', mocks.body)
const retainers = (await import('../../../server/api/agency/retainers/index.get')).default
const retainerCreate = (await import('../../../server/api/agency/retainers/index.post')).default
const retainerUpdate = (await import('../../../server/api/agency/retainers/[clientId].put')).default
const retainerDelete = (await import('../../../server/api/agency/retainers/[clientId].delete')).default
const rateCreate = (await import('../../../server/api/agency/rate-cards/index.post')).default
const rateUpdate = (await import('../../../server/api/agency/rate-cards/[id].patch')).default
const rateDelete = (await import('../../../server/api/agency/rate-cards/[id].delete')).default
const rates = (await import('../../../server/api/agency/rate-cards/index.get')).default
beforeEach(() => { vi.clearAllMocks(); mocks.queryRows.mockResolvedValue([]); mocks.body.mockResolvedValue({}) })
describe('commercial workflows keep independent permissions', () => {
  it('retains client retainer summaries under CLIENTS', async () => {
    mocks.commercial.mockResolvedValue(undefined)
    await (retainers as any)({})
    expect(mocks.commercial).toHaveBeenCalledWith({}, 'staff', 'CLIENTS', false)
    expect(mocks.queryRows).toHaveBeenCalled()
  })
  it('retains service price catalogue reads without requiring company accounting', async () => {
    await (rates as any)({})
    expect(mocks.queryRows).toHaveBeenCalled()
    expect(mocks.commercial).not.toHaveBeenCalled()
  })
  it.each([
    ['retainer read', retainers], ['retainer create', retainerCreate], ['retainer update', retainerUpdate], ['retainer delete', retainerDelete],
    ['price create', rateCreate], ['price update', rateUpdate], ['price delete', rateDelete]
  ])('denies revoked or ungranted %s before data access', async (_name, handler) => {
    mocks.commercial.mockRejectedValue({ statusCode: 403 })
    await expect((handler as any)({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.queryRows).not.toHaveBeenCalled()
    expect(mocks.queryOne).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.body).not.toHaveBeenCalled()
  })
})
