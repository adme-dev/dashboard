import { afterEach, describe, expect, it, vi } from 'vitest'

import worker from '../../workers/page-studio-control/src/index'

const secret = 's'.repeat(48)

function environment(overrides: Record<string, string> = {}) {
  return {
    DASHBOARD_ORIGIN: 'https://preview.agency-dashboard-6cm.pages.dev',
    PAGE_STUDIO_CONTROL_SECRET: secret,
    ...overrides
  } as never
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://xeroflow-control.internal${path}`, init)
}

describe('Page Studio control gateway Worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports health only when the exact runtime configuration is usable', async () => {
    await expect(worker.fetch(request('/healthz'), environment(), {} as never))
      .resolves.toMatchObject({ status: 200 })

    const unavailable = await worker.fetch(
      request('/healthz'),
      environment({ PAGE_STUDIO_CONTROL_SECRET: '' }),
      {} as never
    )
    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toEqual({
      error: {
        code: 'CONTROL_GATEWAY_UNAVAILABLE',
        message: 'Page Studio control gateway is not configured'
      }
    })

    const wrongMethod = await worker.fetch(
      request('/healthz', { method: 'POST' }),
      environment(),
      {} as never
    )
    expect(wrongMethod.status).toBe(405)
  })

  it('allows only GET and POST under the exact internal Page Studio namespace', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    for (const candidate of [
      request('/api/agency/page-studio/sites'),
      request('/internal/page-studio-other/checkpoints'),
      request('/internal/page-studio/../admin'),
      request('/internal/page-studio/checkpoints', { method: 'PUT' })
    ]) {
      const response = await worker.fetch(candidate, environment(), {} as never)
      expect([404, 405]).toContain(response.status)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('strips caller credentials and forwards only allowlisted headers with the gateway secret', async () => {
    const fetchMock = vi.fn(async (_input: Request) => Response.json(
      { acknowledged: true },
      { status: 200, headers: { 'x-request-id': 'request-1', 'set-cookie': 'must-not-pass=1' } }
    ))
    vi.stubGlobal('fetch', fetchMock)
    const input = request('/internal/page-studio/checkpoints?trace=1', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer caller-controlled',
        'cookie': 'session=caller-controlled',
        'content-type': 'application/json',
        'idempotency-key': 'checkpoint_01',
        'x-forwarded-host': 'attacker.invalid',
        'x-request-id': 'request-1',
        'x-xeroflow-service': 'spoofed'
      },
      body: JSON.stringify({ checkpointId: 'checkpoint_01' })
    })

    const response = await worker.fetch(input, environment(), {} as never)
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('x-request-id')).toBe('request-1')
    expect(response.headers.get('cache-control')).toBe('no-store')

    expect(fetchMock).toHaveBeenCalledOnce()
    const forwarded = fetchMock.mock.calls[0]?.[0]
    expect(forwarded).toBeInstanceOf(Request)
    expect(forwarded.url).toBe(
      'https://preview.agency-dashboard-6cm.pages.dev/internal/page-studio/checkpoints?trace=1'
    )
    expect(forwarded.method).toBe('POST')
    expect(forwarded.redirect).toBe('manual')
    expect(forwarded.headers.get('authorization')).toBe(`Bearer ${secret}`)
    expect(forwarded.headers.get('cookie')).toBeNull()
    expect(forwarded.headers.get('x-forwarded-host')).toBeNull()
    expect(forwarded.headers.get('x-xeroflow-service')).toBe('page-studio')
    expect(forwarded.headers.get('idempotency-key')).toBe('checkpoint_01')
    await expect(forwarded.json()).resolves.toEqual({ checkpointId: 'checkpoint_01' })
  })

  it('forwards a preview credential only to the exact preview authorization route', async () => {
    const fetchMock = vi.fn(async () => Response.json({ acknowledged: true }))
    vi.stubGlobal('fetch', fetchMock)

    await worker.fetch(request('/internal/page-studio/delivery/previews/authorize', {
      method: 'POST',
      headers: { 'x-xeroflow-preview-token': 'signed-preview-token' },
      body: JSON.stringify({ hostname: 'site.preview.example.com' })
    }), environment(), {} as never)

    const previewRequest = fetchMock.mock.calls[0]?.[0]
    expect(previewRequest.headers.get('authorization')).toBe(`Bearer ${secret}`)
    expect(previewRequest.headers.get('x-xeroflow-preview-token')).toBe('signed-preview-token')

    await worker.fetch(request('/internal/page-studio/checkpoints', {
      method: 'POST',
      headers: { 'x-xeroflow-preview-token': 'must-not-pass' },
      body: '{}'
    }), environment(), {} as never)

    const checkpointRequest = fetchMock.mock.calls[1]?.[0]
    expect(checkpointRequest.headers.get('x-xeroflow-preview-token')).toBeNull()
  })

  it('fails closed for unapproved origins and weak or oversized credentials', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const env of [
      environment({ DASHBOARD_ORIGIN: 'http://preview.agency-dashboard-6cm.pages.dev' }),
      environment({ DASHBOARD_ORIGIN: 'https://attacker.invalid' }),
      environment({ DASHBOARD_ORIGIN: 'https://app.xeroflow.io/redirect' }),
      environment({ PAGE_STUDIO_CONTROL_SECRET: 'short' }),
      environment({ PAGE_STUDIO_CONTROL_SECRET: 'a'.repeat(257) })
    ]) {
      const response = await worker.fetch(
        request('/internal/page-studio/checkpoints/latest'),
        env,
        {} as never
      )
      expect(response.status).toBe(503)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns safe errors for upstream failures and refuses redirects that could leak credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('secret upstream detail')))
    const failed = await worker.fetch(
      request('/internal/page-studio/checkpoints/latest'),
      environment(),
      {} as never
    )
    expect(failed.status).toBe(503)
    await expect(failed.json()).resolves.toEqual({
      error: { code: 'CONTROL_UPSTREAM_UNAVAILABLE', message: 'Page Studio control unavailable' }
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: 'https://attacker.invalid/capture' }
    })))
    const redirected = await worker.fetch(
      request('/internal/page-studio/checkpoints/latest'),
      environment(),
      {} as never
    )
    expect(redirected.status).toBe(502)
    expect(redirected.headers.get('location')).toBeNull()
  })
})
