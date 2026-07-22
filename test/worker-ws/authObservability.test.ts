import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSql = vi.fn()

vi.mock('@neondatabase/serverless', () => ({
  neon: () => mockSql
}))

const { handleBannerConnect } = await import('../../worker-ws/index')

const env = {
  BANNER_ROOMS: {} as DurableObjectNamespace,
  BOARD_ROOMS: {} as DurableObjectNamespace,
  CHAT_ROOMS: {} as DurableObjectNamespace,
  DATABASE_URL: 'postgres://configured',
  JWT_SECRET: 'test-secret'
}

function request(cookie?: string) {
  return new Request('https://app.xeroflow.io/api/agency/banner-studio/project-1/connect', {
    headers: {
      Upgrade: 'websocket',
      ...(cookie ? { cookie } : {})
    }
  })
}

async function createToken(payload: object) {
  const data = new TextEncoder().encode(JSON.stringify(payload))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, data)
  return `${btoa(String.fromCharCode(...data))}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`
}

beforeEach(() => {
  mockSql.mockReset()
  vi.restoreAllMocks()
})

describe('realtime WebSocket auth observability', () => {
  it('reports a missing cookie without logging credentials', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await handleBannerConnect(request(), env, 'project-1')

    expect(response.status).toBe(401)
    expect(warn).toHaveBeenCalledWith('realtime.auth.denied', {
      reason: 'missing_auth_cookie',
      path: '/api/agency/banner-studio/project-1/connect'
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('auth_token')
  })

  it('distinguishes an invalid token without logging the token', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const response = await handleBannerConnect(request('auth_token_client=invalid.token'), env, 'project-1')

    expect(response.status).toBe(401)
    expect(warn).toHaveBeenCalledWith('realtime.auth.denied', {
      reason: 'invalid_session_token',
      path: '/api/agency/banner-studio/project-1/connect',
      jwtSecretConfigured: true
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('invalid.token')
  })

  it('reports an inactive or missing user without logging identity', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSql.mockResolvedValueOnce([])
    const token = await createToken({ userId: 'user-1', exp: Date.now() + 60_000 })

    const response = await handleBannerConnect(request(`auth_token_client=${token}`), env, 'project-1')

    expect(response.status).toBe(401)
    expect(warn).toHaveBeenCalledWith('realtime.auth.denied', {
      reason: 'inactive_or_missing_user',
      path: '/api/agency/banner-studio/project-1/connect'
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('user-1')
  })

  it('reports a database lookup failure using safe metadata only', async () => {
    const error = Object.assign(new Error('sensitive connection detail'), { code: '08006' })
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSql.mockRejectedValueOnce(error)
    const token = await createToken({ userId: 'user-1', exp: Date.now() + 60_000 })

    const response = await handleBannerConnect(request(`auth_token_client=${token}`), env, 'project-1')

    expect(response.status).toBe(401)
    expect(logError).toHaveBeenCalledWith('realtime.auth.denied', {
      reason: 'user_lookup_failed',
      path: '/api/agency/banner-studio/project-1/connect',
      databaseUrlConfigured: true,
      errorName: 'Error',
      errorCode: '08006'
    })
    expect(JSON.stringify(logError.mock.calls)).not.toContain('sensitive connection detail')
    expect(JSON.stringify(logError.mock.calls)).not.toContain(env.DATABASE_URL)
  })
})
