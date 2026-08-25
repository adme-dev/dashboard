import { describe, it, expect, vi, beforeEach } from 'vitest'

import { defaultPageConfig } from '../../shared/qr/page'

const { resolve, loadPage, accept, mode, assign, exec } = vi.hoisted(() => ({
  resolve: vi.fn(), loadPage: vi.fn(), accept: vi.fn(), mode: vi.fn(), assign: vi.fn(), exec: vi.fn()
}))
vi.mock('~~/server/utils/qr/resolve', () => ({ resolveQrCode: resolve }))
vi.mock('~~/server/utils/qr/pages', () => ({ loadPublicQrPage: loadPage }))
vi.mock('~~/server/utils/leads/acceptance', () => ({ acceptLead: accept, resolveLeadCaptureMode: mode }))
vi.mock('~~/server/utils/leads/autoAssign', () => ({ resolveAssignedAm: assign }))
vi.mock('~~/server/utils/turnstile', () => ({ isTurnstileEnabled: () => false, verifyTurnstile: vi.fn() }))
vi.mock('~~/server/utils/tracking/client-ip', () => ({ resolveClientIp: () => '1.2.3.4' }))
vi.mock('~~/server/utils/tracking/consent', () => ({ snapshotConsent: () => ({ tracking: 'granted' }) }))
vi.mock('~~/server/utils/exportTokens', () => ({ sha256Hex: async (s: string) => `h:${s}` }))
vi.mock('~~/server/utils/db', () => ({ execute: exec }))
vi.mock('~~/server/utils/leads/rateLimit', () => ({ allowRequest: vi.fn(() => ({ allowed: true })) }))

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: any, k: string) => e.params[k]
g.getQuery = (e: any) => e.query ?? {}
g.getHeader = (e: any, k: string) => e.headers?.[k] ?? null
g.getCookie = () => undefined
g.getRequestIP = () => '1.2.3.4'
g.readBody = async (e: any) => e.body
g.setResponseStatus = (e: any, s: number) => { e.status = s }
g.setResponseHeaders = () => {}

function ev(body: any, extra: any = {}) {
  return { params: { code: 'AbC1234' }, body, headers: {}, status: 200, ...extra }
}

beforeEach(() => {
  vi.clearAllMocks()
  resolve.mockResolvedValue({ id: 'q1', clientId: 'c1', url: 'https://x', active: true, code: 'AbC1234', utmMedium: 'print', campaign: 'Flyer' })
  loadPage.mockResolvedValue({ clientId: 'c1', clientName: 'FMG', assets: {}, page: { id: 'p1', config: defaultPageConfig('competition', { clientName: 'FMG' }) } })
  accept.mockResolvedValue({ status: 'created', leadId: 'l1' })
  mode.mockResolvedValue('capture_only')
  assign.mockResolvedValue(null)
  exec.mockResolvedValue(undefined)
})

describe('POST /q/:code/submit', () => {
  it('creates a qr-sourced lead with normalised fields and QR attribution', async () => {
    const handler = (await import('../../server/api/q/[code]/submit.post')).default
    const e = ev({ full_name: ' Jo ', phone: '0412 345 678', postcode: 'VIC 3199', marketing_consent: 'yes', landing_page: 'https://app.xeroflow.io/q/AbC1234' })
    const res = await handler(e)
    expect(res).toEqual({ ok: true, redirect: null })
    const lead = accept.mock.calls[0][1].lead
    expect(lead.source).toBe('qr')
    expect(lead.source_lead_id).toMatch(/^AbC1234:/)
    expect(lead.field_data).toEqual({ full_name: 'Jo', phone: '0412 345 678', postcode: '3199', marketing_consent: 'yes' })
    expect(lead.attribution).toMatchObject({ xf_qr: 'AbC1234', utm_source: 'qr', utm_medium: 'print', utm_campaign: 'flyer', utm_content: 'AbC1234', landing_page: 'https://app.xeroflow.io/q/AbC1234' })
    expect(exec).toHaveBeenCalledOnce()
  })
  it('rejects missing required fields and bad postcodes with 422', async () => {
    const handler = (await import('../../server/api/q/[code]/submit.post')).default
    const e1 = ev({ full_name: 'Jo' })
    expect(await handler(e1)).toMatchObject({ ok: false, message: 'Mobile is required' })
    expect(e1.status).toBe(422)
    const e2 = ev({ full_name: 'Jo', phone: '0412345678', postcode: '31' })
    expect(await handler(e2)).toMatchObject({ ok: false, message: 'Postcode should be 4 digits' })
    expect(accept).not.toHaveBeenCalled()
  })
  it('silently accepts honeypot hits without creating a lead', async () => {
    const handler = (await import('../../server/api/q/[code]/submit.post')).default
    expect(await handler(ev({ full_name: 'Bot', phone: '0400000000', postcode: '3000', website: 'http://spam' }))).toEqual({ ok: true })
    expect(accept).not.toHaveBeenCalled()
  })
  it('blocks preview submissions and unpublished pages', async () => {
    const handler = (await import('../../server/api/q/[code]/submit.post')).default
    const e = ev({}, { query: { xf_preview: '1' } })
    await handler(e)
    expect(e.status).toBe(403)
    loadPage.mockResolvedValue(null)
    const e2 = ev({ full_name: 'Jo' })
    await handler(e2)
    expect(e2.status).toBe(404)
  })
})
