/* eslint-disable @typescript-eslint/no-explicit-any -- Boundary fixtures model heterogeneous database and provider records. */
import { beforeEach, expect, it, vi } from 'vitest'
import { executeDepartmentBrowserFeedCreation } from '~~/server/utils/feeds/departmentAccess'

const s = vi.hoisted(() => ({ rows: [] as any[], calls: 0 }))
vi.mock('h3', async importOriginal => ({
  ...(await importOriginal<any>()),
  getHeader: () => '11111111-1111-4111-8111-111111111111'
}))
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: async () => ({ id: 'staff', email: 'staff@test' })
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({
  resolveMcpStaffContext: async () => ({
    permissionGroups: ['MARKETING_MANAGEMENT']
  })
}))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async () => ({ id: 'client' }),
  transactionWithoutRetry: async (fn: any) =>
    fn({
      query: async (sql: string, p: any[]) => {
        if (sql.includes('pg_advisory')) return { rows: [] }
        if (sql.includes('INSERT')) {
          const r = {
            id: 'proposal',
            resolved_payload: JSON.parse(p[2]),
            result_payload: null
          }
          s.rows.push(r)
          return { rows: [r] }
        }
        if (sql.includes('UPDATE')) {
          s.rows[0].result_payload = JSON.parse(p[2])
          return { rows: [] }
        }
        return { rows: s.rows }
      }
    })
}))
const event = { context: {} } as any
const clientId = '22222222-2222-4222-8222-222222222222'
beforeEach(() => {
  s.rows = []
  s.calls = 0
})
it('persists and replays browser feed creation without repeating provider writes', async () => {
  const create = async () => {
    s.calls++
    return {
      feedId: 'feed',
      providerId: 'provider',
      platform: 'google' as const
    }
  }
  const result = await executeDepartmentBrowserFeedCreation(
    event,
    clientId,
    { name: 'Stock' },
    create
  )
  expect(
    await executeDepartmentBrowserFeedCreation(
      event,
      clientId,
      { name: 'Stock' },
      create
    )
  ).toEqual(result)
  expect(s.calls).toBe(1)
  await expect(
    executeDepartmentBrowserFeedCreation(
      event,
      clientId,
      { name: 'Different' },
      create
    )
  ).rejects.toThrow()
})
it('retains a durable hold when the provider acknowledgement is lost', async () => {
  const create = async (): Promise<any> => {
    s.calls++
    throw new Error('provider secret')
  }
  await expect(
    executeDepartmentBrowserFeedCreation(event, clientId, {}, create)
  ).rejects.toThrow('reconciliation')
  await expect(
    executeDepartmentBrowserFeedCreation(event, clientId, {}, create)
  ).rejects.toThrow('reconciliation')
  expect(s.calls).toBe(1)
})
