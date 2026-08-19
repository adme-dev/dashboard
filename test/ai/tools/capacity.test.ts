import { describe, expect, it, vi } from 'vitest'
import { getCapacity } from '~~/server/utils/ai/tools/capacity'

const ctx = { userId: 'u1', userRole: 'owner', event: {} as any }

describe('get_capacity', () => {
  it('marks an all-zero unconfigured booking source instead of calling the team underutilized', async () => {
    const fetch = vi.fn().mockResolvedValue({
      period: { startDate: '2026-08-17', endDate: '2026-09-14' },
      summary: { totalBooked: 0, totalLogged: 0, teamSize: 2 },
      teamMembers: [
        { name: 'Designer', role: 'creative', bookedHours: 0, loggedHours: 0, availableHours: 160, allocationPercent: 0, status: 'underutilized' },
        { name: 'Producer', role: 'producer', bookedHours: 0, loggedHours: 0, availableHours: 160, allocationPercent: 0, status: 'underutilized' },
      ],
      projectAllocations: [],
    })
    const data = (await getCapacity({ status: 'all' }, ctx, { fetch }) as any).data
    expect(data.dataStatus).toBe('not_configured')
    expect(data.configurationEvidence).toMatchObject({ bookedHours: 0, loggedHours: 0, projectsWithAllocations: 0 })
    expect(data.total).toBe(2)
    expect(data.nextCursor).toBeNull()
  })

  it('does not treat placeholder project allocations as populated capacity data', async () => {
    const fetch = vi.fn().mockResolvedValue({
      period: { startDate: '2026-08-17', endDate: '2026-09-14' },
      summary: { totalBooked: 0, totalLogged: 0, teamSize: 2 },
      teamMembers: [
        { name: 'Designer', bookedHours: 0, loggedHours: 0, availableHours: 160, allocationPercent: 0, status: 'underutilized' },
        { name: 'Producer', bookedHours: 0, loggedHours: 0, availableHours: 160, allocationPercent: 0, status: 'underutilized' },
      ],
      projectAllocations: [{ projectName: 'Placeholder', allocatedHours: 0 }],
    })

    const data = (await getCapacity({ status: 'all' }, ctx, { fetch }) as any).data

    expect(data.coverage).toEqual({ expected: 2, withData: 0 })
    expect(data.dataStatus).toBe('not_configured')
  })
})
