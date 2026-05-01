import { describe, it, expect, vi } from 'vitest'

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(),
}))

import { queryOne } from '~~/server/utils/db'
import { resolveAssignedAm } from '../../../../server/utils/leads/autoAssign'

describe('resolveAssignedAm', () => {
  it('returns the primary AM for the client', async () => {
    ;(queryOne as any).mockResolvedValueOnce({ team_member_id: 'U-AM-1' })
    expect(await resolveAssignedAm('C1')).toBe('U-AM-1')
  })
  it('returns null if no assignment', async () => {
    ;(queryOne as any).mockResolvedValueOnce(null)
    expect(await resolveAssignedAm('C2')).toBeNull()
  })
  it('returns null when client_id is null', async () => {
    expect(await resolveAssignedAm(null)).toBeNull()
  })
})
