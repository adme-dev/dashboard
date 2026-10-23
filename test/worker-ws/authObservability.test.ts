import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()

const { handleBannerConnect } = await import('../../worker-ws/index')

const env = {
  BANNER_ROOMS: {} as DurableObjectNamespace,
  BOARD_ROOMS: {} as DurableObjectNamespace,
  CHAT_ROOMS: {} as DurableObjectNamespace,
  DATABASE_URL: 'postgresql://user:password@ep-test.us-east-1.aws.neon.tech/database',
  JWT_SECRET: 'test-secret'
}

function connectedEnv() {
  return {
    ...env,
    BANNER_ROOMS: {
      idFromName: vi.fn(() => ({ id: 'room-1' })),
      get: vi.fn(() => ({
        fetch: vi.fn(async () => new Response('connected'))
      }))
    } as unknown as DurableObjectNamespace
  }
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
  vi.restoreAllMocks()
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

function databaseRows(rows: unknown[][]) {
  return new Response(JSON.stringify({
    fields: [{ name: 'id' }, { name: 'name' }, { name: 'avatar_url' }],
    rows
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

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

  it('accepts a valid client token after a stale primary cookie', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch.mockResolvedValueOnce(databaseRows([['user-1', 'User', null]]))
    const token = await createToken({ userId: 'user-1', exp: Date.now() + 60_000 })

    const response = await handleBannerConnect(
      request(`auth_token=invalid.token; auth_token_client=${token}`),
      connectedEnv(),
      'project-1'
    )

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('connected')
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts the URL-encoded session cookie emitted by H3', async () => {
    mockFetch.mockResolvedValueOnce(databaseRows([['user-1', 'User', null]]))
    const token = await createToken({ userId: 'user-1', exp: Date.now() + 60_000 })
    // H3's cookie serializer escapes the base64 padding and signature characters.
    expect(encodeURIComponent(token)).not.toBe(token)
    await expect(handleBannerConnect(
      request(`auth_token=${encodeURIComponent(token)}`), connectedEnv(), 'project-1'
    )).resolves.toMatchObject({ status: 200 })
  })

  it.each(['expired', 'tampered'])('still rejects an encoded %s token', async (kind) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let token = await createToken({ userId: 'user-1', exp: Date.now() + (kind === 'expired' ? -60_000 : 60_000) })
    if (kind === 'tampered') {
      const [data, signature] = token.split('.')
      token = `${data}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    }
    await expect(handleBannerConnect(request(`auth_token=${encodeURIComponent(token)}`), connectedEnv(), 'project-1'))
      .resolves.toMatchObject({ status: 401 })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects malformed cookie encoding without forwarding or throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(handleBannerConnect(request('auth_token=%E0%A4%A'), connectedEnv(), 'project-1'))
      .resolves.toMatchObject({ status: 401 })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('bounds signature work when duplicate cookie names are supplied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const token = await createToken({ userId: 'user-1', exp: Date.now() + 60_000 })
    const cookie = [
      'auth_token=invalid-one.token',
      'auth_token=invalid-two.token',
      'auth_token_client=invalid-three.token',
      'auth_token_client=invalid-four.token',
      `auth_token_client=${token}`
    ].join('; ')

    const response = await handleBannerConnect(request(cookie), env, 'project-1')

    expect(response.status).toBe(401)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('reports an inactive or missing user without logging identity', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch.mockResolvedValueOnce(databaseRows([]))
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
    mockFetch.mockRejectedValueOnce(error)
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
