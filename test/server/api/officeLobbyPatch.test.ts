import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
  body?: Record<string, unknown>
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context?.params?.[key]
testGlobal.readBody = async event => event.body ?? {}
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
const mockRequireOfficeAdmin = vi.fn()
const mockEnsureOfficeLobbiesTable = vi.fn()
const mockNormalizeOfficeLobbyHandle = vi.fn((handle: string) => handle.toLowerCase())
const mockLogOfficeAuditEvent = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeRoom', () => ({
  requireOfficeAdmin: (...args: unknown[]) => mockRequireOfficeAdmin(...args)
}))

vi.mock('~~/server/utils/officeLobbies', () => ({
  ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args),
  normalizeOfficeLobbyHandle: (...args: [string]) => mockNormalizeOfficeLobbyHandle(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/lobbies/[lobbyId].patch'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1', lobbyId: 'lobby-1' } },
    body
  } satisfies TestEvent
}

describe('PATCH /api/office/:officeId/lobbies/:lobbyId', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockRequireOfficeAdmin.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockNormalizeOfficeLobbyHandle.mockClear()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockQueryOne.mockResolvedValue({
      id: 'lobby-1',
      handle: 'sales',
      destination_zone_id: 'zone-1'
    })
  })

  it('updates typed scheduling config and audits the change', async () => {
    const response = await handler(fakeEvent({
      config: {
        availability_mode: 'scheduled',
        event_duration_minutes: 45,
        minimum_notice_minutes: 30,
        daily_cap: 5
      }
    }))

    expect(response.updated).toBe(1)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_lobbies'),
      [
        JSON.stringify({
          availability_mode: 'scheduled',
          event_duration_minutes: 45,
          minimum_notice_minutes: 30,
          daily_cap: 5
        }),
        'lobby-1',
        'office-1'
      ]
    )
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      officeId: 'office-1',
      actorId: 'admin-1',
      action: 'lobby.updated',
      targetType: 'office_lobby',
      targetId: 'lobby-1'
    }))
  })

  it('updates supported lobby brand config', async () => {
    const response = await handler(fakeEvent({
      config: {
        brand: {
          logo_url: 'https://example.com/logo.png',
          background: '#10b981',
          texture: 'mesh',
          verified: true
        }
      }
    }))

    expect(response.updated).toBe(1)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_lobbies'),
      [
        JSON.stringify({
          brand: {
            logo_url: 'https://example.com/logo.png',
            background: '#10b981',
            texture: 'mesh',
            verified: true
          }
        }),
        'lobby-1',
        'office-1'
      ]
    )
  })

  it('updates waiting-room shelf items', async () => {
    const response = await handler(fakeEvent({
      config: {
        shelf_items: [
          {
            label: 'Press',
            value: 'Latest product coverage',
            url: 'https://example.com/press'
          }
        ]
      }
    }))

    expect(response.updated).toBe(1)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_lobbies'),
      [
        JSON.stringify({
          shelf_items: [
            {
              label: 'Press',
              value: 'Latest product coverage',
              url: 'https://example.com/press'
            }
          ]
        }),
        'lobby-1',
        'office-1'
      ]
    )
  })

  it('updates custom intake fields', async () => {
    const response = await handler(fakeEvent({
      config: {
        intake_fields: [
          {
            id: 'budget',
            label: 'Budget range',
            type: 'select',
            required: false,
            options: ['$5k-$10k', '$10k+']
          }
        ]
      }
    }))

    expect(response.updated).toBe(1)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_lobbies'),
      [
        JSON.stringify({
          intake_fields: [
            {
              id: 'budget',
              label: 'Budget range',
              type: 'select',
              required: false,
              options: ['$5k-$10k', '$10k+']
            }
          ]
        }),
        'lobby-1',
        'office-1'
      ]
    )
  })

  it('updates scheduled availability windows', async () => {
    const response = await handler(fakeEvent({
      config: {
        availability_mode: 'scheduled',
        availability_windows: [
          {
            days: [1, 3, 5],
            start: '10:00',
            end: '15:30',
            timezone: 'Australia/Melbourne'
          }
        ]
      }
    }))

    expect(response.updated).toBe(1)
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE office_lobbies'),
      [
        JSON.stringify({
          availability_mode: 'scheduled',
          availability_windows: [
            {
              days: [1, 3, 5],
              start: '10:00',
              end: '15:30',
              timezone: 'Australia/Melbourne'
            }
          ]
        }),
        'lobby-1',
        'office-1'
      ]
    )
  })

  it('rejects invalid waiting-room shelf links', async () => {
    await expect(handler(fakeEvent({
      config: {
        shelf_items: [
          {
            label: 'Press',
            value: 'Latest product coverage',
            url: 'not-a-url'
          }
        ]
      }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects unsupported lobby brand textures', async () => {
    await expect(handler(fakeEvent({
      config: {
        brand: {
          texture: 'diagonal-lines'
        }
      }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects non-hex lobby brand background colors', async () => {
    await expect(handler(fakeEvent({
      config: {
        brand: {
          background: 'green'
        }
      }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('validates destination rooms before updating the lobby', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'zone-1' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales',
        destination_zone_id: 'zone-1'
      })

    const response = await handler(fakeEvent({
      destination_zone_id: '11111111-1111-4111-8111-111111111111'
    }))

    expect(response.updated).toBe(1)
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('FROM office_zones')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'office-1'
    ])
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('UPDATE office_lobbies')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'lobby-1',
      'office-1'
    ])
  })

  it('rejects destination rooms outside the office or desk zones', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      destination_zone_id: '11111111-1111-4111-8111-111111111111'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Destination room not found'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('zone_type <> \'desk\'')
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects invalid scheduling config', async () => {
    await expect(handler(fakeEvent({
      config: {
        availability_mode: 'scheduled',
        event_duration_minutes: 999
      }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
