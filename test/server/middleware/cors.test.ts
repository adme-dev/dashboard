import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = {
  method: string
  url: string
  headers: Record<string, string | undefined>
  responseHeaders: Record<string, string>
  status?: number
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  getRequestURL: (event: TestEvent) => URL
  getHeader: (event: TestEvent, key: string) => string | undefined
  setHeader: (event: TestEvent, key: string, value: string) => void
  setResponseStatus: (event: TestEvent, status: number) => void
}

testGlobal.defineEventHandler = fn => fn
testGlobal.getRequestURL = event => new URL(event.url)
testGlobal.getHeader = (event, key) => event.headers[key.toLowerCase()]
testGlobal.setHeader = (event, key, value) => {
  event.responseHeaders[key.toLowerCase()] = value
}
testGlobal.setResponseStatus = (event, status) => {
  event.status = status
}

const { default: handler } = await import('../../../server/middleware/00-cors')

function fakeEvent(input: Partial<TestEvent> = {}): TestEvent {
  return {
    method: input.method ?? 'GET',
    url: input.url ?? 'http://localhost:3000/api/office/office-1/lobbies/analytics',
    headers: input.headers ?? {},
    responseHeaders: {}
  }
}

describe('API CORS middleware', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows local cross-port API preflights before auth middleware runs', () => {
    const event = fakeEvent({
      method: 'OPTIONS',
      headers: {
        'origin': 'http://localhost:3001',
        'access-control-request-headers': 'authorization,content-type'
      }
    })

    const response = handler(event)

    expect(response).toBe('')
    expect(event.status).toBe(204)
    expect(event.responseHeaders['access-control-allow-origin']).toBe('http://localhost:3001')
    expect(event.responseHeaders['access-control-allow-credentials']).toBe('true')
    expect(event.responseHeaders['access-control-allow-methods']).toContain('GET')
    expect(event.responseHeaders['access-control-allow-headers']).toBe('authorization,content-type')
  })

  it('does not add CORS headers for non API routes', () => {
    const event = fakeEvent({
      url: 'http://localhost:3000/office',
      headers: { origin: 'http://localhost:3001' }
    })

    handler(event)

    expect(event.responseHeaders['access-control-allow-origin']).toBeUndefined()
  })

  it('allows the configured app origin', () => {
    vi.stubEnv('APP_URL', 'https://app.example.com/office')
    const event = fakeEvent({
      headers: { origin: 'https://app.example.com' }
    })

    handler(event)

    expect(event.responseHeaders['access-control-allow-origin']).toBe('https://app.example.com')
  })

  it('allows dealer-origin preflights only for public tracking endpoints', () => {
    const leadIntentEvent = fakeEvent({
      method: 'OPTIONS',
      url: 'https://app.example.com/api/public/lead-intent?k=write-key',
      headers: {
        origin: 'https://www.knoxgwmhaval.com.au',
        'access-control-request-headers': 'content-type'
      }
    })

    expect(handler(leadIntentEvent)).toBe('')
    expect(leadIntentEvent.status).toBe(204)
    expect(leadIntentEvent.responseHeaders['access-control-allow-origin'])
      .toBe('https://www.knoxgwmhaval.com.au')

    const privateApiEvent = fakeEvent({
      method: 'OPTIONS',
      url: 'https://app.example.com/api/agency/clients',
      headers: { origin: 'https://www.knoxgwmhaval.com.au' }
    })

    expect(handler(privateApiEvent)).toBeUndefined()
    expect(privateApiEvent.responseHeaders['access-control-allow-origin']).toBeUndefined()
  })
})
