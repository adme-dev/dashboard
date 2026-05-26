import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: {
    params?: Record<string, string>
    cloudflare?: { env?: Record<string, unknown> }
  }
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockQueryOne = vi.fn()
const mockSignOfficeJwt = vi.fn()
const mockExpireStaleOfficeLobbyRequests = vi.fn()
const mockEnsureOfficeGuestBadgesTable = vi.fn()
const mockUpsertOfficeGuestBadge = vi.fn()
const mockEnsureOfficeMeetingArtifactsTables = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeJwt', () => ({
  signOfficeJwt: (...args: unknown[]) => mockSignOfficeJwt(...args)
}))

vi.mock('~~/server/utils/officeLobbyRequests', () => ({
  expireStaleOfficeLobbyRequests: (...args: unknown[]) => mockExpireStaleOfficeLobbyRequests(...args),
  OFFICE_LOBBY_ACCEPTED_WINDOW_HOURS: 2
}))

vi.mock('~~/server/utils/officeGuestBadges', () => ({
  ensureOfficeGuestBadgesTable: (...args: unknown[]) => mockEnsureOfficeGuestBadgesTable(...args),
  upsertOfficeGuestBadge: (...args: unknown[]) => mockUpsertOfficeGuestBadge(...args)
}))

vi.mock('~~/server/utils/officeMeetingArtifacts', () => ({
  ensureOfficeMeetingArtifactsTables: (...args: unknown[]) => mockEnsureOfficeMeetingArtifactsTables(...args)
}))

const { default: handler } = await import(
  '../../../../../../server/api/public/office-lobby/[officeId]/request/[requestId]/token.post'
)

function fakeEvent() {
  return {
    context: {
      params: { officeId: 'office-1', requestId: 'request-1' },
      cloudflare: { env: { OFFICE_SYNC_SECRET: 'secret' } }
    }
  } satisfies TestEvent
}

describe('POST /api/public/office-lobby/:officeId/request/:requestId/token', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockSignOfficeJwt.mockReset()
    mockExpireStaleOfficeLobbyRequests.mockReset()
    mockEnsureOfficeGuestBadgesTable.mockReset()
    mockUpsertOfficeGuestBadge.mockReset()
    mockEnsureOfficeMeetingArtifactsTables.mockReset()
    mockSignOfficeJwt.mockResolvedValue('signed-token')
    mockUpsertOfficeGuestBadge.mockResolvedValue({ id: 'badge-1', status: 'active' })
    mockEnsureOfficeMeetingArtifactsTables.mockResolvedValue(undefined)
  })

  it('signs approved guest tokens with the approved room restriction', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      zone_id: 'zone-1',
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      message: [
        'Can we review blockers?',
        'Intake:',
        'What should we review first?: Launch blockers',
        'Prejoin: mic ready, camera off, AI notes approved, recording not approved'
      ].join('\n'),
      status: 'accepted',
      handled_at: new Date().toISOString(),
      zone_slug: 'meeting-room',
      zone_name: 'Meeting Room',
      zone_capacity: 12
    })
    mockQueryOne.mockResolvedValueOnce(null)

    const response = await handler(fakeEvent())

    expect(response).toMatchObject({
      token: 'signed-token',
      guest: {
        name: 'Guest',
        email: 'guest@example.com',
        badgeId: 'badge-1',
        accessExpiresAt: expect.any(String),
        prejoin: {
          micReady: true,
          cameraOn: false,
          notesApproved: true,
          recordingApproved: false
        },
        note: 'Can we review blockers?',
        source: null,
        intakeAnswers: [
          {
            label: 'What should we review first?',
            value: 'Launch blockers'
          }
        ]
      },
      zone: {
        id: 'zone-1',
        slug: 'meeting-room',
        name: 'Meeting Room'
      }
    })
    expect(mockSignOfficeJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        handle: 'client:request-1',
        role: 'guest',
        isGuest: true,
        officeId: 'office-1',
        allowedZoneId: 'zone-1',
        guestBadgeId: 'badge-1',
        zoneCapacities: { 'zone-1': 12 }
      }),
      'secret'
    )
    expect(mockEnsureOfficeGuestBadgesTable).toHaveBeenCalled()
    expect(mockUpsertOfficeGuestBadge).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      lobbyRequestId: 'request-1',
      allowedZoneId: 'zone-1'
    }))
  })

  it('returns parsed embed source for approved guest room handshakes', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      zone_id: 'zone-1',
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      message: [
        'Website visitor from pricing page',
        'Source: embed',
        'Prejoin: mic ready, camera off, AI notes not approved, recording not approved'
      ].join('\n'),
      status: 'accepted',
      handled_at: new Date().toISOString(),
      zone_slug: 'meeting-room',
      zone_name: 'Meeting Room',
      zone_capacity: 12
    })
    mockQueryOne.mockResolvedValueOnce(null)

    const response = await handler(fakeEvent())

    expect(response.guest).toMatchObject({
      note: 'Website visitor from pricing page',
      source: 'embed'
    })
  })

  it('returns canonical meeting context for approved meeting guests', async () => {
    const badgeExpiresAt = new Date(Date.now() + 60_000).toISOString()
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      zone_id: 'zone-1',
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      message: [
        'Joining Client Review',
        'Meeting ID: 11111111-1111-4111-8111-111111111111',
        'Meeting: Client Review',
        'Prejoin: mic ready, camera on, AI notes approved, recording approved'
      ].join('\n'),
      status: 'accepted',
      handled_at: new Date().toISOString(),
      scheduled_start_at: '2026-05-25T01:00:00.000Z',
      zone_slug: 'meeting-room',
      zone_name: 'Meeting Room',
      zone_capacity: 12
    })
    mockQueryOne.mockResolvedValueOnce({
      id: 'badge-1',
      status: 'active',
      allowed_zone_id: 'zone-1',
      expires_at: badgeExpiresAt
    })
    mockQueryOne.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      scheduled_start_at: '2026-05-25T01:15:00.000Z',
      duration_minutes: 45,
      zone_capacity: 12
    })

    const response = await handler(fakeEvent())

    expect(response.meeting).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      scheduledStartAt: '2026-05-25T01:15:00.000Z',
      durationMinutes: 45
    })
    expect(response.guest.accessExpiresAt).toBe(badgeExpiresAt)
    expect(response.guest.prejoin).toEqual({
      micReady: true,
      cameraOn: true,
      notesApproved: true,
      recordingApproved: true
    })
    expect(mockUpsertOfficeGuestBadge).not.toHaveBeenCalled()
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
  })

  it('refuses accepted legacy requests without an approved room', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      zone_id: null,
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      message: '',
      status: 'accepted',
      handled_at: new Date().toISOString(),
      zone_slug: null,
      zone_name: null,
      zone_capacity: null
    })

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Guest room link is missing an approved room'
    })

    expect(mockExpireStaleOfficeLobbyRequests).toHaveBeenCalledWith('office-1', 'request-1')
    expect(mockSignOfficeJwt).not.toHaveBeenCalled()
  })

  it('recovers legacy accepted requests from the invited meeting room', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      zone_id: null,
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      message: [
        'Meeting ID: 11111111-1111-4111-8111-111111111111',
        'Meeting: Client Review'
      ].join('\n'),
      status: 'accepted',
      handled_at: new Date().toISOString(),
      scheduled_start_at: null,
      zone_slug: null,
      zone_name: null,
      zone_capacity: null
    })
    mockQueryOne.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      zone_id: 'meeting-zone-1',
      zone_slug: 'meeting-room-d',
      zone_name: 'Meeting Room D',
      zone_capacity: 8,
      scheduled_start_at: '2026-05-25T01:15:00.000Z',
      duration_minutes: 45
    })
    mockQueryOne.mockResolvedValueOnce({ id: 'request-1' })
    mockQueryOne.mockResolvedValueOnce(null)

    const response = await handler(fakeEvent())

    expect(response.zone).toEqual({
      id: 'meeting-zone-1',
      slug: 'meeting-room-d',
      name: 'Meeting Room D'
    })
    expect(response.meeting).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Canonical Client Review',
      scheduledStartAt: '2026-05-25T01:15:00.000Z',
      durationMinutes: 45
    })
    expect(mockQueryOne.mock.calls[2][0]).toContain('UPDATE office_lobby_requests')
    expect(mockQueryOne.mock.calls[2][1]).toEqual(['meeting-zone-1', 'office-1', 'request-1'])
    expect(mockUpsertOfficeGuestBadge).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      lobbyRequestId: 'request-1',
      allowedZoneId: 'meeting-zone-1'
    }))
    expect(mockSignOfficeJwt).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedZoneId: 'meeting-zone-1',
        guestBadgeId: 'badge-1',
        zoneCapacities: { 'meeting-zone-1': 8 }
      }),
      'secret'
    )
    expect(mockEnsureOfficeMeetingArtifactsTables).toHaveBeenCalledOnce()
  })

  it('refuses active guest badges for a different approved room', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      zone_id: 'zone-1',
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      message: '',
      status: 'accepted',
      handled_at: new Date().toISOString(),
      zone_slug: 'meeting-room',
      zone_name: 'Meeting Room',
      zone_capacity: 12
    })
    mockQueryOne.mockResolvedValueOnce({
      id: 'badge-1',
      status: 'active',
      allowed_zone_id: 'zone-2',
      expires_at: new Date(Date.now() + 60_000).toISOString()
    })

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Guest badge room does not match approved room'
    })

    expect(mockUpsertOfficeGuestBadge).not.toHaveBeenCalled()
    expect(mockSignOfficeJwt).not.toHaveBeenCalled()
  })

  it('refuses active guest badges without an approved room restriction', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'request-1',
      office_id: 'office-1',
      zone_id: 'zone-1',
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      message: '',
      status: 'accepted',
      handled_at: new Date().toISOString(),
      zone_slug: 'meeting-room',
      zone_name: 'Meeting Room',
      zone_capacity: 12
    })
    mockQueryOne.mockResolvedValueOnce({
      id: 'badge-1',
      status: 'active',
      allowed_zone_id: null,
      expires_at: new Date(Date.now() + 60_000).toISOString()
    })

    await expect(handler(fakeEvent())).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Guest badge room does not match approved room'
    })

    expect(mockUpsertOfficeGuestBadge).not.toHaveBeenCalled()
    expect(mockSignOfficeJwt).not.toHaveBeenCalled()
  })
})
