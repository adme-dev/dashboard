import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  context: { params: { token?: string } }
  headers: Record<string, string | undefined>
  responseHeaders: Record<string, string>
  status?: number
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRouterParam: (event: TestEvent, key: string) => string | undefined
  getHeader: (event: TestEvent, key: string) => string | undefined
  setResponseHeaders: (event: TestEvent, headers: Record<string, string>) => void
  setResponseStatus: (event: TestEvent, status: number) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRouterParam = (event, key) => event.context.params[key as 'token']
testGlobal.getHeader = (event, key) => event.headers[key.toLowerCase()]
testGlobal.setResponseHeaders = (event, headers) => {
  for (const [key, value] of Object.entries(headers)) {
    event.responseHeaders[key.toLowerCase()] = value
  }
}
testGlobal.setResponseStatus = (event, status) => { event.status = status }
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

const queryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({ queryOne }))

const handler = (await import('../../../../../server/api/leads/webhook/generic/[token].options')).default

function fakeEvent(origin: string): TestEvent {
  return {
    context: { params: { token: 'token-1' } },
    headers: { origin, 'access-control-request-headers': 'content-type' },
    responseHeaders: {}
  }
}

describe('generic website lead webhook CORS', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a configured active tracking-site origin', async () => {
    queryOne.mockResolvedValue({ allowed: true })
    const event = fakeEvent('https://www.southmorangmotorgroup.com.au')

    const response = await handler(event as any)

    expect(response).toBe('')
    expect(event.status).toBe(204)
    expect(event.responseHeaders['access-control-allow-origin'])
      .toBe('https://www.southmorangmotorgroup.com.au')
    expect(event.responseHeaders['access-control-allow-methods']).toBe('POST, OPTIONS')
    expect(event.responseHeaders['access-control-allow-headers']).toBe('content-type')
    expect(event.responseHeaders.vary).toBe('Origin')
  })

  it('does not grant CORS to an unconfigured origin', async () => {
    queryOne.mockResolvedValue({ allowed: false })
    const event = fakeEvent('https://attacker.example')

    await expect(handler(event as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(event.responseHeaders['access-control-allow-origin']).toBeUndefined()
  })
})
