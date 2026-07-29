// test/server/api/leads/webhook-google.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Polyfill Nitro / H3 auto-imports that are not available in the Vitest env
// ---------------------------------------------------------------------------
;(globalThis as any).defineEventHandler = (fn: any) => fn

;(globalThis as any).createError = (opts: { statusCode: number; statusMessage: string }) => {
  const error = new Error(opts.statusMessage) as any
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

;(globalThis as any).getRouterParam = (event: any, key: string) =>
  event?.context?.params?.[key]

;(globalThis as any).readBody = async (event: any) => event._readBody ?? null

;(globalThis as any).getRequestHeaders = (event: any) =>
  event?.context?._h ?? event?.node?.req?.headers ?? {}

;(globalThis as any).setResponseHeader = (_event: any, _name: string, _value: string) => {}

// ---------------------------------------------------------------------------
// Module mocks — must come before any import of the mocked modules
// ---------------------------------------------------------------------------

vi.mock('~~/server/utils/db', () => {
  const queryOne = vi.fn()
  const execute = vi.fn().mockResolvedValue(0)
  return { queryOne, execute, queryRows: vi.fn() }
})

vi.mock('../../../../server/utils/leads/db', async () => {
  const real = await vi.importActual<any>('../../../../server/utils/leads/db')
  return {
    ...real,
    upsertFormMetadata: vi.fn(),
    logIngestionError: vi.fn(),
  }
})

const { acceptLead } = vi.hoisted(() => ({
  acceptLead: vi.fn(),
}))

vi.mock('~~/server/utils/leads/acceptance', () => ({ acceptLead }))

vi.mock('../../../../server/utils/leads/autoAssign', () => ({
  resolveAssignedAm: vi.fn().mockResolvedValue('AM-1'),
}))

vi.mock('../../../../server/utils/leads/rateLimit', () => ({
  allowRequest: vi.fn().mockReturnValue({ allowed: true }),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { queryOne } from '~~/server/utils/db'

const handler = (
  await import('../../../../server/api/leads/webhook/google/[token].post')
).default

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeEvent(token: string, body: any, headers: Record<string, string> = {}) {
  return {
    context: { params: { token }, _h: headers },
    node: {
      req: { headers, on: () => {} },
      res: {},
    },
    _readBody: body,
  } as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/leads/webhook/google/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    acceptLead.mockResolvedValue({ status: 'created', leadId: 'LEAD-1' })
  })

  it('404 if no token row', async () => {
    ;(queryOne as any).mockResolvedValueOnce(null)
    await expect(handler(fakeEvent('bad', { google_key: 'x' })))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it('401 if key mismatch', async () => {
    ;(queryOne as any).mockResolvedValueOnce({
      id: 'EP1', client_id: 'C1', secret_key: 'real',
      secret_key_previous: null, secret_key_grace_until: null,
      lead_capture_mode: 'capture_only',
    })
    await expect(handler(fakeEvent('t1', { google_key: 'wrong' })))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('200 + canonical acceptance on valid', async () => {
    ;(queryOne as any).mockResolvedValueOnce({
      id: 'EP1', client_id: 'C1', secret_key: 'real',
      secret_key_previous: null, secret_key_grace_until: null,
      lead_capture_mode: 'capture_only',
    })
    const body = {
      google_key: 'real',
      lead_id: 'g1',
      form_id: 'F1',
      campaign_id: 'CAM1',
      user_column_data: [{ column_name: 'EMAIL', string_value: 'a@b.co' }],
    }
    const r = await handler(fakeEvent('t1', body))
    expect(r).toMatchObject({ ok: true })
    expect(acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      leadCaptureMode: 'capture_only',
      lead: expect.objectContaining({
        client_id: 'C1',
        source: 'google',
        source_lead_id: 'g1'
      })
    }))
  })

  it('200 with skipped:true on dedup', async () => {
    ;(queryOne as any).mockResolvedValueOnce({
      id: 'EP1', client_id: 'C1', secret_key: 'real',
      secret_key_previous: null, secret_key_grace_until: null,
      lead_capture_mode: 'capture_only',
    })
    acceptLead.mockResolvedValueOnce({ status: 'duplicate' })
    const r = await handler(fakeEvent('t1', {
      google_key: 'real', lead_id: 'g1', form_id: 'F1',
      user_column_data: [],
    }))
    expect(r).toMatchObject({ ok: true, skipped: true })
    expect(acceptLead).toHaveBeenCalledOnce()
  })
})
