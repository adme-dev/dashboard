/* eslint-disable @typescript-eslint/no-explicit-any -- Partial authenticated Nitro request fixture. */
import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ marketing: true, readOnly: false, revoked: false, role: vi.fn(), replace: vi.fn(), read: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: 'staff' }), requireWriteAccess: async () => ({ id: 'staff' }), requireRole: m.role }))
vi.mock('~~/server/utils/clientScoping', () => ({ hasFreshMarketingManagementPermission: async () => m.marketing }))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({ resolveMcpStaffContext: async () => ({ permissionGroups: m.revoked ? [] : ['MARKETING_MANAGEMENT'], assistantReadOnly: m.readOnly }) }))
vi.mock('~~/server/utils/db', () => ({ transaction: async (fn: any) => fn({}), queryRowsFresh: vi.fn() }))
vi.mock('~~/server/utils/clients/kpiTargets', () => ({ replaceClientKpiTargets: m.replace, readClientKpiTargets: m.read }))
vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
vi.stubGlobal('getRouterParam', (event: any) => event.id)
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('setResponseHeader', vi.fn())
vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.statusMessage), input))
const put = (await import('~~/server/api/agency/clients/[id]/kpi-targets.put')).default as any
const get = (await import('~~/server/api/agency/clients/[id]/kpi-targets.get')).default as any
const id = '11111111-1111-4111-8111-111111111111'
const revision = 'a'.repeat(64)
beforeEach(() => {
  vi.clearAllMocks()
  m.marketing = true
  m.readOnly = false
  m.revoked = false
  m.replace.mockResolvedValue({ targets: [], revision })
  m.read.mockResolvedValue({ targets: [], revision })
  m.role.mockResolvedValue({ id: 'staff' })
})
it('allows active-only marketing reads and exact-revision writable updates without general management', async () => {
  await get({ id })
  expect(m.read).toHaveBeenCalledWith(expect.anything(), id, true)
  await expect(put({ id, body: { targets: [], expectedRevision: revision } })).resolves.toMatchObject({ ok: true, revision })
  expect(m.replace).toHaveBeenCalledWith(expect.anything(), id, [], revision, true)
  expect(m.role).not.toHaveBeenCalled()
})
it('requires a revision and fresh writable department permission before mutation', async () => {
  await expect(put({ id, body: { targets: [] } })).rejects.toMatchObject({ statusCode: 400 })
  m.readOnly = true
  await expect(put({ id, body: { targets: [], expectedRevision: revision } })).rejects.toMatchObject({ statusCode: 403 })
  m.readOnly = false
  m.revoked = true
  await expect(put({ id, body: { targets: [], expectedRevision: revision } })).rejects.toMatchObject({ statusCode: 403 })
  expect(m.replace).not.toHaveBeenCalled()
})
it('preserves the legacy manager gate and legacy revision-optional request', async () => {
  m.marketing = false
  await put({ id, body: { targets: [] } })
  expect(m.role).toHaveBeenCalled()
  expect(m.replace).toHaveBeenCalledWith(expect.anything(), id, [], undefined, false)
  m.role.mockRejectedValueOnce(Object.assign(new Error('denied'), { statusCode: 403 }))
  await expect(put({ id, body: { targets: [] } })).rejects.toMatchObject({ statusCode: 403 })
})
