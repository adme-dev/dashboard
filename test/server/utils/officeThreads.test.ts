import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  execute: (...args: unknown[]) => mockExecute(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args)
}))

const {
  ensureOfficeGuestThreadChannel,
  ensureOfficeMeetingThreadChannel,
  ensureOfficeRecordingThreadChannel,
  ensureOfficeZoneThreadChannel
} = await import('../../../server/utils/officeThreads')

describe('officeThreads', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockQueryRows.mockReset()
    mockExecute.mockReset()
    mockExecute.mockResolvedValue(undefined)
    mockQueryRows.mockResolvedValue([
      { user_id: 'user-1', role: 'admin' },
      { user_id: 'user-2', role: 'member' }
    ])
  })

  it('creates a canonical meeting thread and enrolls office members', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'meeting-1',
        office_id: 'office-1',
        title: 'Client Review',
        status: 'planned'
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'channel-1',
        slug: 'office-meeting-meeting-1',
        type: 'office_meeting',
        external_id: 'meeting-1'
      })

    const channel = await ensureOfficeMeetingThreadChannel({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'user-1'
    })

    expect(channel).toMatchObject({ id: 'channel-1', type: 'office_meeting' })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('INSERT INTO chat_channels')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'Client Review',
      'office-meeting-meeting-1',
      'Persistent meeting thread for Client Review',
      'meeting-1',
      'user-1'
    ])
    expect(mockExecute.mock.calls.filter(call => String(call[0]).includes('INSERT INTO chat_channel_members'))).toHaveLength(2)
  })

  it('reuses and upgrades an existing meeting thread', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'meeting-1',
        office_id: 'office-1',
        title: 'Client Review',
        status: 'planned'
      })
      .mockResolvedValueOnce({
        id: 'channel-1',
        slug: 'office-meeting-meeting-1',
        type: 'channel',
        external_id: null
      })
      .mockResolvedValueOnce({
        id: 'channel-1',
        slug: 'office-meeting-meeting-1',
        type: 'office_meeting',
        external_id: 'meeting-1'
      })

    await ensureOfficeMeetingThreadChannel({
      officeId: 'office-1',
      meetingId: 'meeting-1',
      actorId: 'user-1'
    })

    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('UPDATE chat_channels')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'meeting-1',
      'Client Review',
      'Persistent meeting thread for Client Review',
      'channel-1'
    ])
  })

  it('returns null when the meeting is not in the office', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    const channel = await ensureOfficeMeetingThreadChannel({
      officeId: 'office-1',
      meetingId: 'missing-meeting',
      actorId: 'user-1'
    })

    expect(channel).toBeNull()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('creates a canonical recording thread and enrolls office members', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'recording-1',
        office_id: 'office-1',
        title: 'Async walkthrough',
        status: 'draft'
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'channel-1',
        slug: 'office-recording-recording-1',
        type: 'office_recording',
        external_id: 'recording-1'
      })

    const channel = await ensureOfficeRecordingThreadChannel({
      officeId: 'office-1',
      recordingId: 'recording-1',
      actorId: 'user-1'
    })

    expect(channel).toMatchObject({ id: 'channel-1', type: 'office_recording' })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('INSERT INTO chat_channels')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'Async walkthrough',
      'office-recording-recording-1',
      'Persistent recording thread for Async walkthrough',
      'recording-1',
      'user-1'
    ])
    expect(mockExecute.mock.calls.filter(call => String(call[0]).includes('INSERT INTO chat_channel_members'))).toHaveLength(2)
  })

  it('creates a canonical guest thread and enrolls office members', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'badge-1',
        office_id: 'office-1',
        guest_name: 'Client Guest',
        guest_email: 'guest@example.com',
        status: 'active'
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'channel-1',
        slug: 'office-guest-badge-1',
        type: 'office_guest',
        external_id: 'badge-1'
      })

    const channel = await ensureOfficeGuestThreadChannel({
      officeId: 'office-1',
      badgeId: 'badge-1',
      actorId: 'user-1'
    })

    expect(channel).toMatchObject({ id: 'channel-1', type: 'office_guest' })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('INSERT INTO chat_channels')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'Client Guest guest pass',
      'office-guest-badge-1',
      'Guest access thread for Client Guest <guest@example.com>',
      'badge-1',
      'user-1'
    ])
    expect(mockExecute.mock.calls.filter(call => String(call[0]).includes('INSERT INTO chat_channel_members'))).toHaveLength(2)
  })

  it('creates a canonical room thread and enrolls office members', async () => {
    mockQueryOne
      .mockResolvedValueOnce({
        id: 'zone-1',
        office_id: 'office-1',
        slug: 'meeting-room-a',
        name: 'Meeting Room A',
        zone_type: 'meeting'
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'channel-1',
        slug: 'office-zone-zone-1',
        type: 'office_zone',
        external_id: 'zone-1'
      })

    const channel = await ensureOfficeZoneThreadChannel({
      officeId: 'office-1',
      zoneId: 'zone-1',
      actorId: 'user-1'
    })

    expect(channel).toMatchObject({ id: 'channel-1', type: 'office_zone' })
    expect(String(mockQueryOne.mock.calls[2]?.[0])).toContain('INSERT INTO chat_channels')
    expect(mockQueryOne.mock.calls[2]?.[1]).toEqual([
      'Meeting Room A',
      'office-zone-zone-1',
      'Persistent room thread for Meeting Room A',
      'zone-1',
      'user-1'
    ])
    expect(mockExecute.mock.calls.filter(call => String(call[0]).includes('INSERT INTO chat_channel_members'))).toHaveLength(2)
  })

  it('does not create chat channels for desk zones', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'zone-1',
      office_id: 'office-1',
      slug: 'paul',
      name: 'Paul',
      zone_type: 'desk'
    })

    const channel = await ensureOfficeZoneThreadChannel({
      officeId: 'office-1',
      zoneId: 'zone-1',
      actorId: 'user-1'
    })

    expect(channel).toBeNull()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })
})
