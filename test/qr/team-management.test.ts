import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireQrTeamManager } from '../../server/utils/qr/teamManagement'
import { QR_ACCESS_TEAM_IDS } from '../../shared/qr/teams'

const { role } = vi.hoisted(() => ({ role: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireRole: role }))

beforeEach(() => {
  vi.clearAllMocks()
  role.mockRejectedValue({ statusCode: 403 })
})
describe('permission-bearing team management', () => {
  it.each(QR_ACCESS_TEAM_IDS)('blocks member self-assignment or removal for %s', async (id) => {
    await expect(requireQrTeamManager({} as H3Event, id)).rejects.toMatchObject({ statusCode: 403 })
    expect(role).toHaveBeenCalledWith({}, ['admin', 'owner'])
  })
  it('permits an authorised administrator', async () => {
    role.mockResolvedValue({ role: 'admin' })
    await expect(requireQrTeamManager({} as H3Event, QR_ACCESS_TEAM_IDS[0])).resolves.toBeUndefined()
  })
  it.each(['00000000000000000000000000000004', '{00000000-0000-0000-0000-000000000004}', ' 00000000-0000-0000-0000-000000000004'])('rejects PostgreSQL UUID aliases before they can bypass the gate: %s', async (id) => {
    await expect(requireQrTeamManager({} as H3Event, id)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('preserves unrelated team management policy', async () => {
    await expect(requireQrTeamManager({} as H3Event, '00000000-0000-0000-0000-000000000007')).resolves.toBeUndefined()
    expect(role).not.toHaveBeenCalled()
  })
})
