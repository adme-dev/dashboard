/**
 * The campaign hard send gate, Resend client, app URL and sender domains read the request's
 * Cloudflare bindings first; process.env is only a local fallback. The switch is the legacy
 * EMAIL_SENDING_ENABLED binding (wins whenever present, including false/malformed/undefined) or
 * `emailSending` in MARKETING_PROVIDER_CONFIG. No provider is called and nothing is sent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()
const mockQueryOne = vi.fn()
const mockGetResendClient = vi.fn()
const mockGetAppUrl = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))
// Mirrors the real resolver's precedence: request binding, then process.env.
vi.mock('~~/server/utils/email', () => ({
  isEmailConfigured: (event?: { context?: { cloudflare?: { env?: Record<string, unknown> } } }) =>
    !!(event?.context?.cloudflare?.env?.RESEND_API_KEY ?? process.env.RESEND_API_KEY),
  getResendClient: (...args: unknown[]) => mockGetResendClient(...args),
  getCachedBinding: vi.fn(() => undefined)
}))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: (...args: unknown[]) => mockGetAppUrl(...args) }))
vi.mock('~~/server/utils/crm/commsDb', () => ({ bridgeCommunication: vi.fn() }))
vi.mock('~~/server/utils/email-marketing/campaigns', () => ({
  getCampaign: vi.fn(async () => ({ id: 'camp-1', status: 'sending' })),
  prepareCampaignHtmlForSend: vi.fn(async (campaign: unknown) => campaign),
  setCampaignStatus: vi.fn()
}))

const { isCampaignSendingEnabled, campaignSendingRuntimeEnv, sendCampaignChunk, runCampaignSend, dispatchCampaigns } = await import('~~/server/utils/email-marketing/campaignSender')
const { resolveCampaignSenderDomains } = await import('~~/server/utils/email-marketing/senderIdentity')

const ENV_KEYS = ['EMAIL_SENDING_ENABLED', 'MARKETING_PROVIDER_CONFIG', 'RESEND_API_KEY', 'EMAIL_SENDER_DOMAINS', 'EMAIL_FROM'] as const
const saved = new Map<string, string | undefined>()
const event = (env?: Record<string, unknown>) => ({ context: env ? { cloudflare: { env } } : {} }) as never
const compact = (value: Record<string, boolean>) => JSON.stringify(value)
const campaign = { id: 'camp-1', status: 'sending', body_html: '<p>x</p>', from_email: 'a@adme.net.au', client_id: null } as never

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key])
    Reflect.deleteProperty(process.env, key)
  }
  mockQueryRows.mockResolvedValue([])
  mockExecute.mockResolvedValue(0)
  mockQueryOne.mockResolvedValue({ n: 0 })
  mockGetResendClient.mockReturnValue({ batch: { send: vi.fn() } })
  mockGetAppUrl.mockReturnValue('https://app.test')
})
afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key)
    if (value === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = value
  }
})

describe('isCampaignSendingEnabled(event)', () => {
  it('is closed by default', () => {
    expect(isCampaignSendingEnabled()).toBe(false)
    expect(isCampaignSendingEnabled(event({ RESEND_API_KEY: 're_x' }))).toBe(false)
  })

  it('keeps process.env as the local fallback (no request bindings)', () => {
    process.env.EMAIL_SENDING_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_local'
    expect(isCampaignSendingEnabled()).toBe(true)
    expect(isCampaignSendingEnabled(event())).toBe(true)
  })

  it('opens from the compact request binding with a request-bound Resend key', () => {
    expect(isCampaignSendingEnabled(event({ MARKETING_PROVIDER_CONFIG: compact({ emailSending: true }), RESEND_API_KEY: 're_req' }))).toBe(true)
  })

  it('still requires a Resend key', () => {
    expect(isCampaignSendingEnabled(event({ MARKETING_PROVIDER_CONFIG: compact({ emailSending: true }) }))).toBe(false)
  })

  it.each([
    ['false', 'false'],
    ['malformed', 'TRUE'],
    ['empty', ''],
    ['present but undefined', undefined]
  ])('a request legacy switch that is %s overrides process.env true and the compact setting', (_label, value) => {
    process.env.EMAIL_SENDING_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_local'
    const env: Record<string, unknown> = { MARKETING_PROVIDER_CONFIG: compact({ emailSending: true }), RESEND_API_KEY: 're_req' }
    env.EMAIL_SENDING_ENABLED = value
    expect(isCampaignSendingEnabled(event(env))).toBe(false)
  })

  it('a request compact false overrides a process.env compact true', () => {
    process.env.MARKETING_PROVIDER_CONFIG = compact({ emailSending: true })
    process.env.RESEND_API_KEY = 're_local'
    expect(isCampaignSendingEnabled()).toBe(true)
    expect(isCampaignSendingEnabled(event({ MARKETING_PROVIDER_CONFIG: compact({ emailSending: false }) }))).toBe(false)
  })

  it('an explicit legacy false in the process fallback still wins over a request compact true', () => {
    process.env.EMAIL_SENDING_ENABLED = 'false'
    expect(isCampaignSendingEnabled(event({ MARKETING_PROVIDER_CONFIG: compact({ emailSending: true }), RESEND_API_KEY: 're_req' }))).toBe(false)
  })

  it('a malformed compact binding fails closed', () => {
    expect(isCampaignSendingEnabled(event({ MARKETING_PROVIDER_CONFIG: '{"emailSending":"true"}', RESEND_API_KEY: 're_req' }))).toBe(false)
    expect(isCampaignSendingEnabled(event({ MARKETING_PROVIDER_CONFIG: '{not json', RESEND_API_KEY: 're_req' }))).toBe(false)
  })

  it('merges request bindings over process.env without mutating either', () => {
    process.env.EMAIL_FROM = 'local@adme.net.au'
    const requestEnv = { EMAIL_FROM: 'req@adme.net.au' }
    const merged = campaignSendingRuntimeEnv(event(requestEnv))
    expect(merged.EMAIL_FROM).toBe('req@adme.net.au')
    expect(process.env.EMAIL_FROM).toBe('local@adme.net.au')
    expect(requestEnv).toEqual({ EMAIL_FROM: 'req@adme.net.au' })
  })
})

describe('native sender uses the request bindings', () => {
  it('sendCampaignChunk refuses on a request-disabled gate before touching the client or database', async () => {
    process.env.EMAIL_SENDING_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_local'
    await expect(sendCampaignChunk(campaign, event({ EMAIL_SENDING_ENABLED: 'false' }))).rejects.toMatchObject({ statusMessage: 'sending_disabled' })
    expect(mockGetResendClient).not.toHaveBeenCalled()
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('runCampaignSend passes the request event to the Resend client and app URL', async () => {
    const ev = event({ MARKETING_PROVIDER_CONFIG: compact({ emailSending: true }), RESEND_API_KEY: 're_req' })
    const result = await runCampaignSend(campaign, { prepareHtml: false, maxChunks: 1, event: ev })
    expect(mockGetResendClient).toHaveBeenCalledWith(ev)
    expect(result).toMatchObject({ sent: 0, failed: 0 })
  })

  it('dispatchCampaigns is a no-op when the request gate is closed even if process.env is open', async () => {
    process.env.EMAIL_SENDING_ENABLED = 'true'
    process.env.RESEND_API_KEY = 're_local'
    expect(await dispatchCampaigns({ event: event({ EMAIL_SENDING_ENABLED: 'false' }) })).toMatchObject({ skipped: 'sending_disabled', sent: 0 })
    expect(mockQueryRows).not.toHaveBeenCalled()
  })

  it('sender domains prefer the request binding; process.env stays the fallback; adme.net.au from EMAIL_FROM otherwise', () => {
    process.env.EMAIL_SENDER_DOMAINS = 'local.test'
    expect(resolveCampaignSenderDomains(event({ EMAIL_SENDER_DOMAINS: 'client.test' }))).toEqual(['client.test'])
    expect(resolveCampaignSenderDomains(event({}))).toEqual(['local.test'])
    delete process.env.EMAIL_SENDER_DOMAINS
    expect(resolveCampaignSenderDomains(event({ EMAIL_FROM: 'notification@adme.net.au' }))).toEqual(['adme.net.au'])
  })
})

describe('GET /api/email/campaigns/config', () => {
  it('reports only the boolean (no key, binding or config values)', async () => {
    const g = globalThis as Record<string, unknown>
    g.defineEventHandler = (fn: unknown) => fn
    vi.doMock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => ({ id: 'u1' })) }))
    const { default: handler } = await import('../../server/api/email/campaigns/config.get')
    const body = await (handler as (e: unknown) => Promise<unknown>)(event({ MARKETING_PROVIDER_CONFIG: compact({ emailSending: true }), RESEND_API_KEY: 're_secret_value' }))
    expect(body).toEqual({ sending_enabled: true })
    expect(JSON.stringify(body)).not.toContain('re_secret_value')
    const closed = await (handler as (e: unknown) => Promise<unknown>)(event({ EMAIL_SENDING_ENABLED: 'false', RESEND_API_KEY: 're_secret_value' }))
    expect(closed).toEqual({ sending_enabled: false })
  })
})
