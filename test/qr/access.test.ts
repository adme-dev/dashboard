import { describe, it, expect, vi, beforeEach } from 'vitest'
const { q, gate } = vi.hoisted(() => ({ q: { queryOne: vi.fn() }, gate: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOne: q.queryOne, queryRows: vi.fn(), execute: vi.fn() }))
vi.mock('~~/server/utils/client-access', () => ({ requireClientTrackingAccess: gate, isUuid: (s: string) => /^[0-9a-f-]{36}$/i.test(s) }))
import { requireQrCodeAccess } from '../../server/utils/qr/access'

beforeEach(() => vi.clearAllMocks())
const ID = '11111111-1111-4111-8111-111111111111'

describe('requireQrCodeAccess', () => {
  it('400s on a malformed id before hitting the db', async () => {
    await expect(requireQrCodeAccess({} as any, 'x')).rejects.toMatchObject({ statusCode: 400 })
    expect(q.queryOne).not.toHaveBeenCalled()
  })
  it('404s when the row is missing', async () => {
    q.queryOne.mockResolvedValue(null)
    await expect(requireQrCodeAccess({} as any, ID)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('gates on the row client and returns row + user', async () => {
    q.queryOne.mockResolvedValue({ id: ID, client_id: 'c1', code: 'AbC1234' })
    gate.mockResolvedValue({ id: 'u', role: 'owner' })
    const r = await requireQrCodeAccess({} as any, ID)
    expect(gate).toHaveBeenCalledWith({}, 'c1')
    expect(r.row.code).toBe('AbC1234')
  })
})
