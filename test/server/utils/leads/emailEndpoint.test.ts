import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const transaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(), queryRows: vi.fn(), transaction: (...args: unknown[]) => transaction(...args)
}))
vi.mock('~~/server/utils/leads/emailRoutingPreset', () => ({ applyEmailRoutingPreset: vi.fn() }))

const clientId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'

function result(rows: unknown[] = []) { return { rows } }

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333', client_id: clientId,
    label: 'carsales', address_prefix: 'carsales', address_token: 'lead_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    email_address: 'carsales-lead_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@leads.xeroflow.io',
    expected_provider: null, parser_mode: 'auto', ai_extraction_mode: 'disabled', allowed_sender_domains: [],
    expected_max_silence_hours: null, first_response_sla_minutes: null,
    form_id: 'email_endpoint:33333333-3333-4333-8333-333333333333', form_name: 'Carsales', enabled: true,
    previous_address_token: null, previous_token_grace_until: null, last_received_at: null, last_accepted_at: null,
    last_failure_at: null, consecutive_failures: 0, created_by: actorId, retired_at: null,
    created_at: '2026-07-29T00:00:00.000Z', updated_at: '2026-07-29T00:00:00.000Z', ...overrides
  }
}

describe('email endpoint service', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates a client-authorized endpoint and immutable endpoint-scoped form metadata in one transaction', async () => {
    const { createEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ lead_capture_mode: 'capture_only' }]))
      .mockResolvedValueOnce(result([endpoint({ label: 'carsales-nsw', address_prefix: 'carsales-nsw' })]))
      .mockResolvedValueOnce(result())

    const created = await createEmailEndpoint({ clientId, label: 'Carsales NSW!', formName: 'Carsales' }, actorId)

    expect(created.address_prefix).toBe('carsales-nsw')
    const insert = query.mock.calls[2]
    expect(insert[1][2]).toBe('carsales-nsw')
    expect(insert[1][12]).toMatch(/^email_endpoint:[0-9a-f-]{36}$/)
    expect(query.mock.calls[3][0]).toContain('INSERT INTO lead_form_metadata')
    expect(query.mock.calls[3][1][0]).toBe(insert[1][12])
    expect(transaction).toHaveBeenCalledOnce()
  })

  it('rejects a caller who is not authorized for the requested client before any endpoint write', async () => {
    const { createEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ allowed: false }]))

    await expect(createEmailEndpoint({ clientId, label: 'Carsales', formName: 'Carsales' }, actorId)).rejects.toMatchObject({ statusCode: 403 })
    expect(query).toHaveBeenCalledOnce()
  })

  it('rejects analytics-only clients and out-of-range endpoint health values', async () => {
    const { createEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    await expect(createEmailEndpoint({ clientId, label: 'Carsales', formName: 'Carsales', expectedMaxSilenceHours: 0 }, actorId)).rejects.toMatchObject({ statusCode: 400 })

    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ lead_capture_mode: 'analytics_only' }]))
    await expect(createEmailEndpoint({ clientId, label: 'Carsales', formName: 'Carsales' }, actorId)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('does not expose opaque address tokens in the operator list projection', async () => {
    const { listEmailEndpoints } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ id: 'endpoint-1', email_address: 'carsales-lead_opaque@leads.xeroflow.io' }]))

    await expect(listEmailEndpoints(clientId, actorId)).resolves.toEqual([{ id: 'endpoint-1', email_address: 'carsales-lead_opaque@leads.xeroflow.io' }])
    expect(query.mock.calls[1][0]).not.toContain('address_token')
    expect(query.mock.calls[1][0]).not.toContain('previous_address_token')
  })

  it('keeps every rotated token valid for its full 24-hour grace window', async () => {
    const { rotateEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([endpoint({ previous_token_grace_until: '2999-01-01T00:00:00.000Z' })]))
      .mockResolvedValueOnce(result([{ allowed: true }]))

    await expect(rotateEmailEndpoint('33333333-3333-4333-8333-333333333333', actorId))
      .rejects.toMatchObject({ statusCode: 409, statusMessage: 'rotation_grace_active' })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('soft-retires an endpoint by disabling it without deleting its audit history', async () => {
    const { updateEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([endpoint()]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ received: false }]))
      .mockResolvedValueOnce(result([endpoint({ enabled: false, retired_at: '2026-07-29T01:00:00.000Z' })]))

    const updated = await updateEmailEndpoint('33333333-3333-4333-8333-333333333333', { retire: true }, actorId)
    expect(updated.enabled).toBe(false)
    expect(query.mock.calls[3][1][10]).toBe(false)
    expect(query.mock.calls[3][0]).toContain('retired_at = COALESCE')
  })
})
