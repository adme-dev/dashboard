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
const mockNormalizeOfficeLobbyHandle = vi.fn((handle: string) => handle.toLowerCase().replaceAll(/\s+/g, '-'))
const mockGetOfficeSettings = vi.fn()
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

vi.mock('~~/server/utils/officeSettings', () => ({
  getOfficeSettings: (...args: unknown[]) => mockGetOfficeSettings(...args)
}))

vi.mock('~~/server/utils/officeAudit', () => ({
  logOfficeAuditEvent: (...args: unknown[]) => mockLogOfficeAuditEvent(...args)
}))

const { default: handler } = await import(
  '../../../../server/api/office/[officeId]/lobbies.post'
)

function fakeEvent(body: Record<string, unknown>) {
  return {
    context: { params: { officeId: 'office-1' } },
    body
  } satisfies TestEvent
}

describe('POST /api/office/:officeId/lobbies', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockRequireOfficeAdmin.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockNormalizeOfficeLobbyHandle.mockClear()
    mockGetOfficeSettings.mockReset()
    mockLogOfficeAuditEvent.mockReset()

    mockRequireOfficeAdmin.mockResolvedValue({ user: { id: 'admin-1' } })
    mockGetOfficeSettings.mockResolvedValue({
      guest_access_enabled: true,
      public_lobbies_enabled: true
    })
    mockEnsureOfficeLobbiesTable.mockResolvedValue(undefined)
    mockLogOfficeAuditEvent.mockResolvedValue(undefined)
  })

  it('creates a lobby after validating the destination room', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'zone-1' })
      .mockResolvedValueOnce({
        id: 'lobby-1',
        handle: 'sales-team',
        destination_zone_id: '11111111-1111-4111-8111-111111111111'
      })

    const response = await handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      destination_zone_id: '11111111-1111-4111-8111-111111111111',
      config: { availability_mode: 'manual' }
    }))

    expect(response.lobby).toMatchObject({ id: 'lobby-1', handle: 'sales-team' })
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('FROM office_zones')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      'office-1'
    ])
    expect(String(mockQueryOne.mock.calls[1]?.[0])).toContain('INSERT INTO office_lobbies')
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual([
      'office-1',
      'admin-1',
      'sales-team',
      'Sales Team',
      '',
      '11111111-1111-4111-8111-111111111111',
      true,
      JSON.stringify({ availability_mode: 'manual' })
    ])
    expect(mockLogOfficeAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'lobby.created',
      targetType: 'office_lobby',
      targetId: 'lobby-1'
    }))
  })

  it('creates a lobby with supported brand config', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'lobby-1',
      handle: 'sales-team',
      destination_zone_id: null
    })

    const response = await handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      config: {
        availability_mode: 'manual',
        brand: {
          logo_url: 'https://example.com/logo.png',
          background: '#0ea5e9',
          texture: 'grid',
          verified: true
        }
      }
    }))

    expect(response.lobby).toMatchObject({ id: 'lobby-1', handle: 'sales-team' })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_lobbies'),
      [
        'office-1',
        'admin-1',
        'sales-team',
        'Sales Team',
        '',
        null,
        true,
        JSON.stringify({
          availability_mode: 'manual',
          brand: {
            logo_url: 'https://example.com/logo.png',
            background: '#0ea5e9',
            texture: 'grid',
            verified: true
          }
        })
      ]
    )
  })

  it('creates a lobby with waiting-room shelf items', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'lobby-1',
      handle: 'sales-team',
      destination_zone_id: null
    })

    await handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      config: {
        shelf_items: [
          {
            label: 'Case study',
            value: 'See how teams launch faster',
            url: 'https://example.com/case-study'
          }
        ]
      }
    }))

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_lobbies'),
      [
        'office-1',
        'admin-1',
        'sales-team',
        'Sales Team',
        '',
        null,
        true,
        JSON.stringify({
          shelf_items: [
            {
              label: 'Case study',
              value: 'See how teams launch faster',
              url: 'https://example.com/case-study'
            }
          ]
        })
      ]
    )
  })

  it('creates a lobby with custom intake fields', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'lobby-1',
      handle: 'sales-team',
      destination_zone_id: null
    })

    await handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      config: {
        intake_fields: [
          {
            id: 'company_size',
            label: 'Company size',
            type: 'select',
            required: true,
            options: ['1-10', '11-50']
          }
        ]
      }
    }))

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_lobbies'),
      [
        'office-1',
        'admin-1',
        'sales-team',
        'Sales Team',
        '',
        null,
        true,
        JSON.stringify({
          intake_fields: [
            {
              id: 'company_size',
              label: 'Company size',
              type: 'select',
              required: true,
              options: ['1-10', '11-50']
            }
          ]
        })
      ]
    )
  })

  it('creates a scheduled lobby with availability windows', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'lobby-1',
      handle: 'sales-team',
      destination_zone_id: null
    })

    await handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      config: {
        availability_mode: 'scheduled',
        availability_windows: [
          {
            days: [1, 2, 3, 4, 5],
            start: '09:00',
            end: '17:00',
            timezone: 'Australia/Melbourne'
          }
        ]
      }
    }))

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO office_lobbies'),
      [
        'office-1',
        'admin-1',
        'sales-team',
        'Sales Team',
        '',
        null,
        true,
        JSON.stringify({
          availability_mode: 'scheduled',
          availability_windows: [
            {
              days: [1, 2, 3, 4, 5],
              start: '09:00',
              end: '17:00',
              timezone: 'Australia/Melbourne'
            }
          ]
        })
      ]
    )
  })

  it('rejects invalid waiting-room shelf links on creation', async () => {
    await expect(handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      config: {
        shelf_items: [
          {
            label: 'Case study',
            value: 'See how teams launch faster',
            url: '/relative-link'
          }
        ]
      }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects unsupported brand texture on creation', async () => {
    await expect(handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      config: {
        brand: {
          texture: 'waves'
        }
      }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects non-hex brand background on creation', async () => {
    await expect(handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      config: {
        brand: {
          background: 'emerald'
        }
      }
    }))).rejects.toBeTruthy()

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects destination rooms outside the office or desk zones', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team',
      destination_zone_id: '11111111-1111-4111-8111-111111111111'
    }))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Destination room not found'
    })

    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('zone_type <> \'desk\'')
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })

  it('rejects lobby creation when public lobbies are disabled', async () => {
    mockGetOfficeSettings.mockResolvedValueOnce({
      guest_access_enabled: true,
      public_lobbies_enabled: false
    })

    await expect(handler(fakeEvent({
      handle: 'Sales Team',
      name: 'Sales Team'
    }))).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'Public lobbies are disabled for this office'
    })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(mockLogOfficeAuditEvent).not.toHaveBeenCalled()
  })
})
