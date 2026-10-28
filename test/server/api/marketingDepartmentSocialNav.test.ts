/* eslint-disable @typescript-eslint/no-explicit-any -- Mock transport and database fixture shapes are intentionally partial. */
import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ auth: vi.fn(), fresh: vi.fn(), scope: vi.fn(), one: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: m.auth }))
vi.mock('~~/server/utils/clientScoping', () => ({ hasFreshMarketingManagementPermission: m.fresh }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientScope: m.scope }))
vi.mock('~~/server/utils/db', () => ({ queryOne: m.one }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getQuery', (event: any) => event.query ?? {})
vi.stubGlobal('createError', (input: object) => Object.assign(new Error('denied'), input))
const { default: handler } = await import('~~/server/api/agency/social/publishing/nav-counts.get')
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ id: 'staff', permissionGroups: ['MARKETING_MANAGEMENT'] })
  m.fresh.mockResolvedValue(true)
  m.one.mockResolvedValue({ accounts: 2 })
  m.scope.mockResolvedValue(undefined)
})
it('admits a fresh marketing portfolio and scopes every badge query to active clients', async () => {
  expect(await handler({ query: {} } as any)).toMatchObject({ accounts: 2 })

  expect(m.fresh).toHaveBeenCalledWith('staff')

  expect(m.scope).not.toHaveBeenCalled()

  const sql = String(m.one.mock.calls[0]?.[0])

  expect(sql.match(/authorized_client\.is_active = TRUE/g)).toHaveLength(5)
})
it('rejects a revoked cached marketing role before reading any counts', async () => {
  m.fresh.mockResolvedValue(false)

  await expect(handler({ query: {} } as any)).rejects.toMatchObject({ statusCode: 403 })

  expect(m.one).not.toHaveBeenCalled()
})
it('keeps a selected client checked and retains legacy all-client authorization', async () => {
  await handler({ query: { clientId: '11111111-1111-4111-8111-111111111111' } } as any)

  expect(m.scope).toHaveBeenCalledWith(expect.anything(), '11111111-1111-4111-8111-111111111111')

  m.auth.mockResolvedValue({ id: 'owner', permissionGroups: ['ADMIN'] })

  await handler({ query: {} } as any)

  expect(m.scope).toHaveBeenCalledWith(expect.anything(), undefined)
})
