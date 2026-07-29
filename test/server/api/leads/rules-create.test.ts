import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  body?: Record<string, unknown>
}

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: TestEvent) => Promise<Record<string, unknown>>
}
globals.defineEventHandler = handler => handler
globals.readBody = async event => event.body ?? {}

const requireRole = vi.fn()
const queryOne = vi.fn()
const query = vi.fn()
const transaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) =>
  callback({ query })
)

vi.mock('~~/server/utils/auth', () => ({
  requireRole: (...args: unknown[]) => requireRole(...args)
}))
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => queryOne(...args),
  transaction: (...args: unknown[]) => transaction(...args)
}))

const { default: handler } = await import('../../../../server/api/leads/rules/index.post')

const CLIENT_A = '11111111-1111-4111-8111-111111111111'
const CLIENT_B = '22222222-2222-4222-8222-222222222222'
const ENDPOINT_FORM = 'email_endpoint:33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
  requireRole.mockResolvedValue({ id: 'actor-1' })
  queryOne.mockResolvedValue({ id: 'unsafe-rule' })
})

describe('POST /api/leads/rules tenant isolation', () => {
  it('rejects an email endpoint form owned by another client', async () => {
    query.mockResolvedValueOnce({ rows: [] })

    await expect(handler({
      body: {
        client_id: CLIENT_A,
        source: 'email',
        form_id: ENDPOINT_FORM,
        form_name: 'Inbound enquiries'
      }
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'email_endpoint_client_mismatch'
    })
  })

  it('rejects an existing email rule conflict instead of reassigning its client', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'endpoint-1' }] })
      .mockResolvedValueOnce({ rows: [] })

    await expect(handler({
      body: {
        client_id: CLIENT_B,
        source: 'email',
        form_id: ENDPOINT_FORM,
        form_name: 'Inbound enquiries'
      }
    } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'form_rule_client_conflict'
    })
  })

  it('preserves the existing non-email rule upsert behavior', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'google-rule' }] })

    await expect(handler({
      body: {
        client_id: CLIENT_A,
        source: 'google',
        form_id: 'google-form-1',
        form_name: 'Google form'
      }
    } as never)).resolves.toEqual({ ok: true, id: 'google-rule' })
  })
})
