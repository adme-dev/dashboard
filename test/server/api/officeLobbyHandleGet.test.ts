import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context?: { params?: Record<string, string> }
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
const mockEnsureOfficeLobbiesTable = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/officeLobbies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/officeLobbies')>()
  return {
    ...actual,
    ensureOfficeLobbiesTable: (...args: unknown[]) => mockEnsureOfficeLobbiesTable(...args)
  }
})

const { default: handler } = await import(
  '../../../../server/api/public/office-lobby/handle/[handle].get'
)

function fakeEvent(handle = 'sales-team') {
  return {
    context: { params: { handle } }
  } satisfies TestEvent
}

describe('GET /api/public/office-lobby/handle/:handle', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockEnsureOfficeLobbiesTable.mockReset()
    mockEnsureOfficeLobbiesTable.mockResolvedValue(undefined)
  })

  it('resolves active friendly lobby handles', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: 'lobby-1',
      office_id: 'office-1',
      handle: 'sales-team',
      name: 'Sales Team',
      description: 'Talk to sales.',
      destination_zone_id: 'zone-1',
      destination_zone_slug: 'meeting-room-a',
      destination_zone_name: 'Meeting Room A',
      office_name: 'XeroFlow HQ',
      config: { availability_mode: 'manual' }
    })

    const response = await handler(fakeEvent(' Sales Team! '))

    expect(response.lobby).toMatchObject({
      id: 'lobby-1',
      handle: 'sales-team',
      office_name: 'XeroFlow HQ',
      destination_zone_slug: 'meeting-room-a'
    })
    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('ol.is_active = true')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual(['sales-team'])
  })

  it('rejects handles that normalize to an empty value', async () => {
    await expect(handler(fakeEvent('!!!'))).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'valid handle required'
    })

    expect(mockEnsureOfficeLobbiesTable).toHaveBeenCalledOnce()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('returns 404 for inactive or missing handles', async () => {
    mockQueryOne.mockResolvedValueOnce(null)

    await expect(handler(fakeEvent('missing'))).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Lobby not found'
    })
  })
})
