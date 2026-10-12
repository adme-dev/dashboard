import { beforeEach, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { requireSocialPostClientAccess } from '../../../server/utils/socialPublishing/guards'

const mocks = vi.hoisted(() => ({ query: vi.fn(), access: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query, queryRows: vi.fn() }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientAccess: mocks.access }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockResolvedValue({ id: 'p1', client_id: 'c1', created_by: 'driveagent-newsroom', metadata: {} })
})
it.each(['POST', 'PATCH', 'DELETE'])('blocks dashboard %s even when editable metadata was removed', async (method) => {
  await expect(requireSocialPostClientAccess({ method } as H3Event, 'p1')).rejects.toMatchObject({ statusCode: 409 })
})
it('continues to allow dashboard inspection of newsroom delivery', async () => {
  expect(await requireSocialPostClientAccess({ method: 'GET' } as H3Event, 'p1')).toMatchObject({ id: 'p1' })
})
