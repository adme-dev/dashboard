import { describe, expect, it, vi } from 'vitest'
import {
  reserveCrmSearchUsage,
  settleCrmSearchUsage
} from '~~/server/utils/crm/searchIndex/usageRepository'

const organisationScopeId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const correlationId = '33333333-3333-4333-8333-333333333333'
const reservationId = '44444444-4444-4444-8444-444444444444'
const rateCardId = '55555555-5555-4555-8555-555555555555'

const authorityRow = {
  global_state: 'enabled',
  indexing_ready: true,
  control_revision: '7',
  policy_state: 'shadow',
  policy_revision: '9',
  global_budget_usd_micros: '1000',
  client_budget_usd_micros: '900',
  global_max_provider_calls: '10',
  client_max_provider_calls: '8',
  global_max_query_dimensions: '7680',
  client_max_query_dimensions: '6144',
  global_max_inserted_dimensions: '0',
  client_max_inserted_dimensions: '0',
  global_max_stored_dimensions: '100000',
  client_max_stored_dimensions: '90000',
  rate_card_id: rateCardId,
  rate_card_revision: 'cloudflare-2026-08-09',
  rate_card_model_id: '@cf/baai/bge-base-en-v1.5',
  rate_card_valid_from: '2026-08-09T00:00:00.000Z',
  rate_card_valid_until: '2027-08-09T00:00:00.000Z',
  rate_card_revoked_at: null
}

const dailyRows = [
  {
    id: '66666666-6666-4666-8666-666666666666', usage_scope: 'global', client_id: null,
    rate_card_id: rateCardId,
    cap_provider_calls: '10', cap_model_input_tokens: '5120', cap_query_dimensions: '7680',
    cap_inserted_dimensions: '0', cap_stored_dimensions: '100000', cap_charged_usd_micros: '1000',
    reserved_provider_calls: '0', charged_provider_calls: '0', reserved_model_input_tokens: '0',
    charged_model_input_tokens: '0', reserved_query_dimensions: '0', charged_query_dimensions: '0',
    reserved_inserted_dimensions: '0', charged_inserted_dimensions: '0',
    stored_dimension_high_watermark: '0', reserved_usd_micros: '0', charged_usd_micros: '0'
  },
  {
    id: '77777777-7777-4777-8777-777777777777', usage_scope: 'client', client_id: clientId,
    rate_card_id: rateCardId,
    cap_provider_calls: '8', cap_model_input_tokens: '4096', cap_query_dimensions: '6144',
    cap_inserted_dimensions: '0', cap_stored_dimensions: '90000', cap_charged_usd_micros: '900',
    reserved_provider_calls: '0', charged_provider_calls: '0', reserved_model_input_tokens: '0',
    charged_model_input_tokens: '0', reserved_query_dimensions: '0', charged_query_dimensions: '0',
    reserved_inserted_dimensions: '0', charged_inserted_dimensions: '0',
    stored_dimension_high_watermark: '0', reserved_usd_micros: '0', charged_usd_micros: '0'
  }
]

const reserveInput = {
  organisationScopeId,
  clientId,
  correlationId,
  operationId: null,
  usageKind: 'query' as const,
  provider: 'workers_ai' as const,
  reservationAt: '2026-08-10T00:00:00.000Z',
  providerCalls: 1,
  modelInputTokens: 512,
  queryDimensions: 0,
  insertedDimensions: 0,
  storedDimensions: 0,
  usdMicros: 35,
  rateCardRevision: 'cloudflare-2026-08-09'
}

function reservationRow() {
  return {
    id: reservationId,
    organisation_scope_id: organisationScopeId,
    client_id: clientId,
    usage_kind: 'query',
    correlation_id: correlationId,
    operation_id: null,
    control_revision: '7',
    policy_revision: '9',
    rate_card_id: rateCardId,
    reserved_provider_calls: 1,
    reserved_model_input_tokens: 512,
    reserved_query_dimensions: '0',
    reserved_inserted_dimensions: '0',
    reserved_stored_dimensions: '0',
    reserved_usd_micros: '35',
    state: 'reserved',
    provider_call_sent: null,
    completion_class: null
  }
}

describe('CRM search usage repository', () => {
  it('locks global and client usage together and rejects either exceeded cap', async () => {
    const exhaustedRows = dailyRows.map(row => row.usage_scope === 'client'
      ? { ...row, reserved_provider_calls: row.cap_provider_calls }
      : row)
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [authorityRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: exhaustedRows })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    await expect(reserveCrmSearchUsage(reserveInput, {
      transactionWithoutRetry
    } as never)).rejects.toThrow('crm_search_budget_exhausted')

    expect(query.mock.calls[2]?.[0]).toContain('FOR UPDATE')
    expect(query.mock.calls[2]?.[0]).toContain('CASE usage_scope WHEN \'global\' THEN 0 ELSE 1 END')
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('reserves one provider attempt atomically against both scopes and stamps revisions/rate card', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [authorityRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: dailyRows })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [reservationRow()] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    const reservation = await reserveCrmSearchUsage(reserveInput, {
      transactionWithoutRetry
    } as never)
    expect(reservation).toMatchObject({
      id: reservationId,
      controlRevision: 7,
      policyRevision: 9,
      reservedModelInputTokens: 512,
      state: 'reserved'
    })
    expect(query.mock.calls[3]?.[0]).toContain('UPDATE crm_search_usage_daily')
    expect(query.mock.calls[4]?.[0]).toContain('INSERT INTO crm_search_usage_reservations')
    expect(query.mock.calls[4]?.[0]).toContain('created_at')
    expect(query.mock.calls[4]?.[1]).toContain(reserveInput.reservationAt)
    expect(query.mock.calls[0]?.[0]).toContain('$4::TIMESTAMPTZ')
  })

  it('fails closed when a locked daily scope does not match current rate-card authority', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [authorityRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: dailyRows.map(row => ({
        ...row,
        rate_card_id: '88888888-8888-4888-8888-888888888888'
      })) })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))
    await expect(reserveCrmSearchUsage(reserveInput, {
      transactionWithoutRetry
    } as never)).rejects.toThrow('crm_search_budget_exhausted')
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('charges the full 512-token reservation once a Workers AI call is sent, including late discard', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [reservationRow()] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ ...reservationRow(), state: 'late_charged' }], rowCount: 1 })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    const settled = await settleCrmSearchUsage({
      reservationId,
      providerCallSent: true,
      completion: 'late_discarded'
    }, { transactionWithoutRetry } as never)

    expect(settled.state).toBe('late_charged')
    expect(query.mock.calls[1]?.[0]).toContain('charged_model_input_tokens = charged_model_input_tokens + $')
    expect(query.mock.calls[1]?.[1]).toContain(512)
  })

  it('releases reserved capacity only with explicit evidence that no provider call was sent', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [reservationRow()] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ ...reservationRow(), state: 'released_no_call' }], rowCount: 1 })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))

    const settled = await settleCrmSearchUsage({
      reservationId,
      providerCallSent: false,
      completion: 'released_no_call'
    }, { transactionWithoutRetry } as never)
    expect(settled.state).toBe('released_no_call')
    expect(query.mock.calls[1]?.[0]).toContain('reserved_model_input_tokens = reserved_model_input_tokens - $')
  })

  it('settles idempotently without double charge after the first durable settlement', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      ...reservationRow(), state: 'charged', provider_call_sent: true, completion_class: 'completed'
    }] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))
    await expect(settleCrmSearchUsage({
      reservationId,
      providerCallSent: true,
      completion: 'completed'
    }, { transactionWithoutRetry } as never)).resolves.toMatchObject({ state: 'charged' })
    expect(query).toHaveBeenCalledOnce()
  })

  it('rolls back settlement unless both global and client daily rows are updated', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [reservationRow()] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))
    await expect(settleCrmSearchUsage({
      reservationId,
      providerCallSent: true,
      completion: 'completed'
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_usage_settlement_conflict')
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('requires a full 512-token reservation for each Workers AI attempt and rejects malformed authority', async () => {
    const transactionWithoutRetry = vi.fn()
    await expect(reserveCrmSearchUsage({
      ...reserveInput,
      modelInputTokens: 511
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_invalid_usage_reservation')
    await expect(reserveCrmSearchUsage({
      ...reserveInput,
      providerCalls: 2
    }, { transactionWithoutRetry } as never)).rejects.toThrow('crm_search_invalid_usage_reservation')
    expect(transactionWithoutRetry).not.toHaveBeenCalled()
  })

  it('fails closed before daily rows when configured token-cap multiplication is not exact', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{
      ...authorityRow,
      global_max_provider_calls: String(Number.MAX_SAFE_INTEGER)
    }] })
    const transactionWithoutRetry = vi.fn(async callback => await callback({ query }))
    await expect(reserveCrmSearchUsage(reserveInput, {
      transactionWithoutRetry
    } as never)).rejects.toThrow('crm_search_invalid_usage_reservation')
    expect(query).toHaveBeenCalledOnce()
  })
})
