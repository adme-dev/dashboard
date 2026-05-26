import { describe, expect, it, vi } from 'vitest'
import type { OfficeZoneRow } from '~~/app/types/office'

const mockGetOfficeRoom = vi.fn()

vi.mock('~~/server/utils/officeRoom', () => ({
  getOfficeRoom: (...args: unknown[]) => mockGetOfficeRoom(...args)
}))

const { notifyOfficeZoneDeleted, notifyOfficeZoneUpserted } = await import('~~/server/utils/officeRoomControl')

const zone: OfficeZoneRow = {
  id: 'zone-1',
  office_id: 'office-1',
  slug: 'meeting-room-a',
  name: 'Meeting Room A',
  zone_type: 'meeting',
  position: { x: 80, y: 80, w: 240, h: 160 },
  capacity: 8,
  is_private: false,
  acl: {},
  notes: '',
  notes_version: 0,
  notes_updated_at: null,
  notes_updated_by: null,
  created_at: '2026-05-26T00:00:00.000Z'
}

describe('officeRoomControl', () => {
  it('notifies OfficeRoom about zone upserts', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    mockGetOfficeRoom.mockReturnValueOnce({ fetch })

    await notifyOfficeZoneUpserted({} as never, 'office-1', zone)

    expect(mockGetOfficeRoom).toHaveBeenCalledWith(expect.any(Object), 'office-1')
    const request = fetch.mock.calls[0]?.[0] as Request
    expect(request.url).toBe('https://office-room-do/admin/zone-upserted')
    expect(request.method).toBe('POST')
    expect(await request.json()).toEqual({ zoneId: 'zone-1', zone })
  })

  it('notifies OfficeRoom about zone deletes', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    mockGetOfficeRoom.mockReturnValueOnce({ fetch })

    await notifyOfficeZoneDeleted({} as never, 'office-1', 'zone-1')

    const request = fetch.mock.calls[0]?.[0] as Request
    expect(request.url).toBe('https://office-room-do/admin/zone-deleted')
    expect(request.method).toBe('POST')
    expect(await request.json()).toEqual({ zoneId: 'zone-1' })
  })

  it('swallows missing room bindings for local development', async () => {
    mockGetOfficeRoom.mockImplementationOnce(() => {
      throw new Error('OFFICE_ROOMS binding not available')
    })

    await expect(notifyOfficeZoneDeleted({} as never, 'office-1', 'zone-1')).resolves.toBeUndefined()
  })
})
