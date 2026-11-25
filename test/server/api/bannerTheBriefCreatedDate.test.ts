import { createError } from 'h3'
import { beforeEach, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  query: vi.fn(), access: vi.fn(), write: vi.fn(), portfolio: vi.fn()
}))
vi.mock('~~/server/utils/db', () => ({ transaction: (callback: (db: unknown) => unknown) => callback({ query: m.query }) }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: m.write }))
vi.mock('~~/server/utils/banner/clientAccess', () => ({ requireBannerClientScope: m.access }))
vi.mock('~~/server/utils/banner/marketingProjectAccess', () => ({ isMarketingPortfolioUser: m.portfolio }))

const id = '9b800000-1234-1234-1234-123456789abc'
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => id)
vi.stubGlobal('readBody', (event: { body: unknown }) => event.body)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', createError)
const handler = (await import('~~/server/api/agency/banner-studio/projects/[id]/thebrief-created-date.patch')).default
const date = '2024-11-25'
const request = (createdDate = date, expectedDate: string | null = null) => ({ body: { createdDate, expectedDate } }) as Parameters<typeof handler>[0]
beforeEach(() => {
  vi.resetAllMocks()
  m.write.mockResolvedValue({ id: 'designer' })
  m.portfolio.mockReturnValue(false)
  m.query.mockResolvedValue({ rows: [{ client_id: 'client', tags: ['source:thebrief', 'source-design:original', 'import:needs-review', 'import:created-date-pending'] }] })
})

it('changes only the date and removes the pending marker', async () => {
  const event = request()
  expect(await handler(event)).toEqual({ id, createdDate: date })
  expect(m.access).toHaveBeenCalledWith(event, 'client')
  expect(m.query.mock.calls[1]).toEqual([
    'UPDATE banner_projects SET tags = $1 WHERE id = $2',
    [['source:thebrief', 'source-design:original', 'import:needs-review', 'source-created-date:' + date], id]
  ])
})

it('rejects invalid dates and projects without imported provenance', async () => {
  await expect(handler(request('2024-02-30'))).rejects.toMatchObject({ statusCode: 400 })
  expect(m.query).not.toHaveBeenCalled()
  m.query.mockResolvedValueOnce({ rows: [{ client_id: 'client', tags: [] }] })
  await expect(handler(request())).rejects.toMatchObject({ statusCode: 409 })
  expect(m.query).toHaveBeenCalledTimes(1)
})

it('keeps a concurrent correction and treats a completed identical retry as a read', async () => {
  m.query.mockResolvedValue({ rows: [{ client_id: 'client', tags: ['source:thebrief', 'source-created-date:2024-12-01'] }] })
  await expect(handler(request())).rejects.toMatchObject({ statusCode: 409 })
  expect(await handler(request('2024-12-01'))).toEqual({ id, createdDate: '2024-12-01' })
  expect(m.query).toHaveBeenCalledTimes(2)
})

it('blocks portfolio-role changes before reading project receipts', async () => {
  m.portfolio.mockReturnValue(true)
  await expect(handler(request())).rejects.toMatchObject({ statusCode: 403 })
  expect(m.query).not.toHaveBeenCalled()
})
