import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/design/[...path]'

const base = 'https://app.xeroflow.io/api/email/design/'
const id = '10000000-0000-4000-8000-000000000001'
function app(env: Record<string, unknown>) {
  return toWebHandler(createApp().use(defineEventHandler((event) => {
    event.context.cloudflare = { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', ...env } }
  })).use(handler))
}

describe('private design service forwarding', () => {
  it.each(['PATCH', 'DELETE'])('keeps existing template %s available while design drafts are disabled', async (method) => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe(method)
      expect(request.url).toBe(`https://app.xeroflow.io/api/email/templates/${id}`)
      return Response.json({ ok: true })
    })
    const response = await app({ EMAIL_DESIGN: { fetch } })(new Request(`https://app.xeroflow.io/api/email/templates/${id}`, { method }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(['PATCH', 'DELETE'])('fails closed for existing template %s without its binding', async (method) => {
    const response = await app({})(new Request(`https://app.xeroflow.io/api/email/templates/${id}`, { method }))
    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('stays disabled without contacting a binding', async () => {
    const fetch = vi.fn()
    const response = await app({ EMAIL_DESIGN: { fetch } })(new Request(`${base}drafts/${id}`))
    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('fails closed when enabled without its private binding', async () => {
    const response = await app({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true' })(new Request(`${base}drafts/${id}`))
    expect(response.status).toBe(503)
  })
  it.each([
    ['GET', `drafts/${id}`], ['PATCH', `drafts/${id}`],
    ['PATCH', `drafts/${id}/metadata`], ['POST', 'drafts/initialize'], ['POST', 'roundtrip']
  ])('forwards %s %s with original authority and exact content', async (method, path) => {
    const body = method === 'GET' ? undefined : '{"subject":"你好","actorId":"untrusted"}'
    const fetch = vi.fn(async (request: Request) => {
      expect(request.url).toBe(`${base}${path}?version=1`)
      expect(request.method).toBe(method)
      expect(request.headers.get('cookie')).toBe('auth_token=session')
      expect(request.headers.get('origin')).toBe('https://app.xeroflow.io')
      expect(request.headers.get('x-xeroflow-email-design-environment')).toBe('production')
      expect(await request.text()).toBe(body ?? '')
      return new Response('{"revisionId":"receipt"}', { status: 409, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } })
    })
    const response = await app({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', EMAIL_DESIGN: { fetch } })(new Request(`${base}${path}?version=1`, {
      method, body, headers: { 'cookie': 'auth_token=session', 'origin': 'https://app.xeroflow.io', 'content-type': 'application/json', 'x-xeroflow-email-design-environment': 'staging' }
    }))
    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ revisionId: 'receipt' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each([['GET', 'roundtrip'], ['DELETE', `drafts/${id}`], ['GET', 'drafts/initialize'], ['POST', 'publish'], ['GET', `drafts/${id}/secret`]])('does not forward unsupported %s %s', async (method, path) => {
    const fetch = vi.fn()
    const response = await app({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', EMAIL_DESIGN: { fetch } })(new Request(`${base}${path}`, { method }))
    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([undefined, 'preview', ''])('refuses invalid configured environment %s before dispatch', async (environment) => {
    const fetch = vi.fn()
    const response = await app({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', PAGE_STUDIO_RELEASE_ENVIRONMENT: environment, EMAIL_DESIGN: { fetch } })(new Request(`${base}drafts/${id}`))
    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('redacts transport failures and never retries an uncertain mutation', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('private service connection details'))
    const response = await app({ FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true', EMAIL_DESIGN: { fetch } })(new Request(`${base}drafts/${id}`, { method: 'PATCH', body: '{}' }))
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private service')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
