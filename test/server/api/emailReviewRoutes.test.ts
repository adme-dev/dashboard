/**
 * M06 route boundaries. The public hosted web version (/email/view) serves an
 * already-signed link of a gated campaign whatever the workflow flag says (a
 * rollback must not strand links), denies bad signatures/versions without
 * reading cookies and always ships the restrictive CSP. Staff review routes
 * always require a session; with the flag off they serve only existing gated
 * campaigns (enforced by the review service). No provider or outbound calls.
 */
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, type H3Event } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWebVersionUrl, WEB_VERSION_CSP } from '~~/server/utils/email-marketing/webVersion'

const mockQueryOneFresh = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: (...args: unknown[]) => mockQueryOneFresh(...args),
  queryRowsFresh: vi.fn(async () => []),
  transactionWithoutRetry: vi.fn(),
  getTransactionFailureStage: () => null
}))
vi.mock('~~/server/utils/email-marketing/links', async (original) => {
  const actual = await original<typeof import('~~/server/utils/email-marketing/links')>()
  return { ...actual, emailLinkSecret: () => 'secret' }
})
const mockValidateSession = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ validateSession: (...args: unknown[]) => mockValidateSession(...args) }))

const CAMPAIGN = '6f2b1a0c-1d2e-4f3a-9b8c-7d6e5f4a3b2c'
const DIGEST = 'a'.repeat(64)

function makeEvent(url: string, env: Record<string, unknown>, init: { method?: string, headers?: Record<string, string> } = {}): { event: H3Event, res: ServerResponse } {
  const req = new IncomingMessage(new Socket())
  req.url = url
  req.method = init.method ?? 'GET'
  req.headers = { host: 'app.example', ...(init.headers ?? {}) }
  const res = new ServerResponse(req)
  const event = createEvent(req, res)
  ;(event.context as Record<string, unknown>).cloudflare = { env }
  return { event, res }
}

const fetchSpy = vi.spyOn(globalThis, 'fetch')
afterEach(() => expect(fetchSpy).not.toHaveBeenCalled())

describe('GET /email/view', () => {
  beforeEach(() => {
    mockQueryOneFresh.mockReset()
  })

  async function view(url: string, env: Record<string, unknown> = { FIGFLOW_EDM_WORKFLOW_ENABLED: 'true' }, headers: Record<string, string> = {}) {
    const handler = (await import('~~/server/routes/email/view.get')).default
    const { event, res } = makeEvent(url, env, { headers })
    const body = await handler(event)
    return { body: String(body), res }
  }

  it('keeps serving an already-signed gated link while the workflow flag is off; never an ungated row', async () => {
    const signed = new URL(await buildWebVersionUrl('https://app.example', CAMPAIGN, DIGEST, 'secret'))
    const row = { id: CAMPAIGN, status: 'sent', web_version_enabled: true, review_required: true, body_html: '<p>Frozen</p>', subject: 's', utm_settings: null, digest: DIGEST }
    mockQueryOneFresh.mockResolvedValueOnce(row)
    const served = await view(signed.pathname + signed.search, {})
    expect(served.res.statusCode).toBe(200)
    expect(served.res.getHeader('content-security-policy')).toBe(WEB_VERSION_CSP)
    expect(served.body).toContain('Frozen')
    mockQueryOneFresh.mockResolvedValueOnce({ ...row, review_required: false })
    const ungated = await view(signed.pathname + signed.search, {})
    expect(ungated.res.statusCode).toBe(404)
    expect(ungated.body).toContain('not available')
  })

  it('denies bad signatures before reading the database and ignores cookies', async () => {
    const { res } = await view(`/email/view?c=${CAMPAIGN}&v=${DIGEST}&t=${'0'.repeat(32)}`, undefined, { cookie: 'auth_token=staff' })
    expect(res.statusCode).toBe(404)
    expect(mockQueryOneFresh).not.toHaveBeenCalled()
    expect(mockValidateSession).not.toHaveBeenCalled()
    expect(res.getHeader('set-cookie')).toBeUndefined()
  })

  it('denies a valid link once the stored content no longer matches the signed version, and drafts', async () => {
    const signed = new URL(await buildWebVersionUrl('https://app.example', CAMPAIGN, DIGEST, 'secret'))
    mockQueryOneFresh.mockResolvedValueOnce({ id: CAMPAIGN, status: 'sent', web_version_enabled: true, review_required: true, body_html: '<p>x</p>', subject: 's', utm_settings: null, digest: 'b'.repeat(64) })
    expect((await view(signed.pathname + signed.search)).res.statusCode).toBe(404)
    mockQueryOneFresh.mockResolvedValueOnce({ id: CAMPAIGN, status: 'draft', web_version_enabled: true, review_required: true, body_html: '<p>x</p>', subject: 's', utm_settings: null, digest: DIGEST })
    expect((await view(signed.pathname + signed.search)).res.statusCode).toBe(404)
  })

  it('serves the frozen, recipient-free page for the exact signed version', async () => {
    const signed = new URL(await buildWebVersionUrl('https://app.example', CAMPAIGN, DIGEST, 'secret'))
    mockQueryOneFresh.mockResolvedValueOnce({
      id: CAMPAIGN, status: 'sending', web_version_enabled: true, review_required: true, subject: 's', utm_settings: { source: 'news' }, digest: DIGEST,
      body_html: '<p>Hi {{first_name | there}} {{email}}</p><a href="https://shop.example/">Shop</a><script>steal()</script>'
    })
    const { body, res } = await view(signed.pathname + signed.search)
    expect(res.statusCode).toBe(200)
    expect(res.getHeader('content-security-policy')).toBe(WEB_VERSION_CSP)
    expect(res.getHeader('x-frame-options')).toBe('DENY')
    expect(body).toContain('Hi there ')
    expect(body).not.toContain('<script')
    expect(body).toContain('utm_source=news')
    expect(mockQueryOneFresh.mock.calls[0]?.[1]).toEqual([CAMPAIGN])
  })
})

describe('staff review routes', () => {
  it('still require a fresh session (no-store) while the workflow flag is off, for gated recovery', async () => {
    const get = (await import('~~/server/api/email/review/[kind]/[id].get')).default
    const post = (await import('~~/server/api/email/review/[kind]/[id]/commands.post')).default
    const readback = (await import('~~/server/api/email/review/operations/[operationId].get')).default
    for (const [handler, method] of [[get, 'GET'], [post, 'POST'], [readback, 'GET']] as const) {
      mockValidateSession.mockResolvedValueOnce(null)
      const { event, res } = makeEvent(`/api/email/review/campaign/${CAMPAIGN}`, {}, {
        method,
        headers: { 'cookie': 'auth_token=x', 'content-type': 'application/json' }
      })
      ;(event.context as Record<string, unknown>).params = { kind: 'campaign', id: CAMPAIGN, operationId: CAMPAIGN }
      await expect(handler(event)).rejects.toMatchObject({ statusCode: 401, statusMessage: 'review_session_invalid' })
      expect(res.getHeader('cache-control')).toBe('no-store')
    }
    expect(mockValidateSession).toHaveBeenCalledTimes(3)
  })

  it('require a valid session when enabled', async () => {
    mockValidateSession.mockResolvedValueOnce(null)
    const get = (await import('~~/server/api/email/review/[kind]/[id].get')).default
    const { event } = makeEvent(`/api/email/review/campaign/${CAMPAIGN}`, { FIGFLOW_EDM_WORKFLOW_ENABLED: 'true' }, { headers: { cookie: 'auth_token=expired' } })
    ;(event.context as Record<string, unknown>).params = { kind: 'campaign', id: CAMPAIGN }
    await expect(get(event)).rejects.toMatchObject({ statusCode: 401, statusMessage: 'review_session_invalid' })
  })
})
