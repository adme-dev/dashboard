import { beforeEach, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

const mocks = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn(), body: vi.fn() }))
vi.mock('~~/server/utils/clientScoping', () => ({ requireInvoiceAccess: mocks.access }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(), requireRole: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.query, queryRows: mocks.query, transaction: mocks.query }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', mocks.body)
  mocks.access.mockRejectedValue({ statusCode: 403 })
})
it.each(['create', 'generate', 'delete'])('checks fresh write authority before %s data reads or effects', async (operation) => {
  const handler = operation === 'create'
    ? (await import('~~/server/api/agency/invoices/index.post')).default
    : operation === 'generate'
      ? (await import('~~/server/api/agency/invoices/generate.post')).default
      : (await import('~~/server/api/agency/invoices/[id].delete')).default
  const event = {} as H3Event
  await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
  expect(mocks.access).toHaveBeenCalledWith(event, true)
  expect(mocks.body).not.toHaveBeenCalled()
  expect(mocks.query).not.toHaveBeenCalled()
})
