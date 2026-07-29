import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
  acceptLead: vi.fn(),
  resolveLeadCaptureMode: vi.fn(),
  duplicateSignal: vi.fn()
}))

mocks.transaction.mockImplementation(async (callback: (db: { query: typeof mocks.query }) => Promise<unknown>) => callback({ query: mocks.query }))

vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.queryOne, transaction: mocks.transaction }))
vi.mock('~~/server/utils/leads/emailEndpoint', () => ({ resolveEmailEndpointToken: vi.fn() }))
vi.mock('~~/server/utils/leads/acceptance', () => ({
  acceptLead: mocks.acceptLead,
  resolveLeadCaptureMode: mocks.resolveLeadCaptureMode
}))
vi.mock('~~/server/utils/leads/emailDuplicateSignal', () => ({
  findEmailLeadDuplicateSignal: mocks.duplicateSignal
}))

import { acceptEmailEnvelope } from '../../../../server/utils/leads/emailIngestion'

const ENDPOINT_ID = '11111111-1111-4111-8111-111111111111'
const CLIENT_ID = '22222222-2222-4222-8222-222222222222'
const INGESTION_ID = '33333333-3333-4333-8333-333333333333'
const CORRELATION_ID = '44444444-4444-4444-8444-444444444444'
const HASH = 'a'.repeat(64)

const endpoint = {
  id: ENDPOINT_ID, client_id: CLIENT_ID,
  form_id: `email_endpoint:${ENDPOINT_ID}`, form_name: 'Carsales',
  address_token: '0123456789', previous_address_token: null, previous_token_grace_until: null,
  expected_provider: 'carsales', parser_mode: 'auto', ai_extraction_mode: 'disabled',
  ai_privacy_approval_version: null, ai_privacy_approved_at: null, ai_privacy_approved_by: null,
  allowed_sender_domains: ['carsales.com.au'], enabled: true, retired_at: null,
  lead_capture_mode: 'full_crm'
}

function ingestion(overrides: Record<string, unknown> = {}) {
  return {
    id: INGESTION_ID, endpoint_id: ENDPOINT_ID, client_id: CLIENT_ID,
    correlation_id: CORRELATION_ID, external_id_hash: HASH, message_id_hash: HASH,
    transport: 'cloudflare_email_routing',
    raw_content_hash_version: 1, raw_content_hash: 'c'.repeat(64),
    status: 'received', terminal_at: null, next_attempt_at: null, attempt_count: 0,
    staged_expires_at: '2099-08-05T00:00:00.000Z',
    staged_ready: true,
    recovery_lease_token: null,
    ...overrides
  }
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const, correlationId: CORRELATION_ID, ingestionId: INGESTION_ID,
    transport: 'cloudflare_email_routing' as const, recipientToken: '0123456789',
    recipientAddressHash: HASH, envelopeSenderDomain: 'notify.carsales.com.au',
    headerFromDomain: 'carsales.com.au', messageIdHash: HASH, externalIdHash: HASH,
    rawContentHashVersion: 1 as const, rawContentHash: 'c'.repeat(64),
    receivedAt: '2026-07-29T00:00:00.000Z', rawSize: 1024, attachmentCount: 0,
    extraction: {
      provider: 'carsales', externalIdHash: HASH, sourceName: 'Carsales',
      medium: 'classifieds' as const, parser: 'provider' as const,
      fields: { email: { value: 'customer@example.test', confidence: 0.9, provenance: 'body' as const } },
      overallConfidence: 0.9, needsReview: false, reviewReasons: []
    },
    safeEvidence: { hasText: true, hasHtml: false, hasAdf: false, fieldKeys: ['email'] },
    ...overrides
  }
}

function queryOneSql(pattern: RegExp): string | undefined {
  return mocks.queryOne.mock.calls
    .map(([sql]) => sql as string)
    .find(sql => pattern.test(sql))
}

function transactionSql(pattern: RegExp): string | undefined {
  return mocks.query.mock.calls
    .map(([sql]) => sql as string)
    .find(sql => pattern.test(sql))
}

describe('email canonical ingress', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.query.mockResolvedValue({
      rows: [{ id: INGESTION_ID, endpoint_id: ENDPOINT_ID, client_id: CLIENT_ID }]
    })
    mocks.transaction.mockImplementation(async (callback: (db: { query: typeof mocks.query }) => Promise<unknown>) => callback({ query: mocks.query }))
    mocks.queryOne.mockResolvedValue({ id: INGESTION_ID })
    mocks.resolveLeadCaptureMode.mockResolvedValue('full_crm')
    mocks.acceptLead.mockResolvedValue({ status: 'created', leadId: '55555555-5555-4555-8555-555555555555' })
    mocks.duplicateSignal.mockResolvedValue(null)
  })

  it('rejects an unknown valid reservation before canonical lead acceptance', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [] })
    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.acceptLead).not.toHaveBeenCalled()
  })

  it.each([
    ['token endpoint', { endpoint_id: '99999999-9999-4999-8999-999999999999' }],
    ['correlation', { correlation_id: '99999999-9999-4999-8999-999999999999' }],
    ['external identity', { external_id_hash: 'b'.repeat(64) }],
    ['message identity', { message_id_hash: 'b'.repeat(64) }]
  ])('rejects a mismatched %s claim', async (_label, rowOverride) => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [ingestion(rowOverride)] })
    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.acceptLead).not.toHaveBeenCalled()
  })

  it('accepts the stored reservation correlation after a fresh transport redelivery proposed another value', async () => {
    const storedCorrelation = '88888888-8888-4888-8888-888888888888'
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({ correlation_id: storedCorrelation })]
    }).mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope({ correlationId: storedCorrelation })
    )).resolves.toEqual({
      status: 'accepted',
      leadId: '55555555-5555-4555-8555-555555555555'
    })
    expect(mocks.acceptLead).toHaveBeenCalledOnce()
  })

  it('returns duplicate for an already-terminal reservation', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [ingestion({ terminal_at: '2026-07-29T00:01:00.000Z', status: 'accepted' })] })
    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({ status: 'duplicate' })
  })

  it.each([
    [1, 0],
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4]
  ])('allows canonical handoff attempt %i', async (_attempt, priorAttempts) => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [ingestion({ attempt_count: priorAttempts })] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({
      status: 'accepted', leadId: '55555555-5555-4555-8555-555555555555'
    })
    expect(mocks.acceptLead).toHaveBeenCalledOnce()
  })

  it('keeps a crash immediately after final lease claim recoverable', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [ingestion({ attempt_count: 4 })] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.resolveLeadCaptureMode.mockImplementationOnce(() => new Promise(() => {}))

    void acceptEmailEnvelope({} as never, INGESTION_ID, envelope())
    await vi.waitFor(() => expect(mocks.resolveLeadCaptureMode).toHaveBeenCalledOnce())

    expect(mocks.query.mock.calls[2]?.[0]).toMatch(/error_class = 'final_attempt_leased'/)
    expect(mocks.query.mock.calls[2]?.[0]).toMatch(/next_attempt_at = NOW\(\) \+ MAKE_INTERVAL/)
    expect(mocks.query.mock.calls[2]?.[0]).not.toMatch(/attempt_count\s*=\s*\$2|terminal_at\s*=\s*NOW\(\)/)
    expect(mocks.acceptLead).not.toHaveBeenCalled()
  })

  it('returns in progress to a concurrent caller during the live final lease', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        attempt_count: 4,
        status: 'failed',
        error_class: 'final_attempt_leased',
        terminal_at: null,
        next_attempt_at: '2099-01-01T00:00:00.000Z'
      })]
    })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({ status: 'in_progress' })
    expect(mocks.acceptLead).not.toHaveBeenCalled()
  })

  it('recovers the same fifth logical attempt after its lease expires', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        attempt_count: 4,
        status: 'failed',
        error_class: 'final_attempt_leased',
        terminal_at: null,
        next_attempt_at: '2026-07-28T00:00:00.000Z'
      })]
    }).mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({
      status: 'accepted', leadId: '55555555-5555-4555-8555-555555555555'
    })
    expect(mocks.query.mock.calls[2]?.[0]).toMatch(/error_class = 'final_attempt_leased'/)
    expect(mocks.query.mock.calls[2]?.[0]).not.toMatch(/attempt_count\s*=\s*\$2|terminal_at\s*=\s*NOW\(\)/)
    expect(mocks.acceptLead).toHaveBeenCalledOnce()
    expect(transactionSql(/attempt_count = CASE/)).toMatch(/attempt_count = CASE[\s\S]*THEN 5/)
  })

  it('promotes a successful fifth-attempt lease to accepted only after handoff', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [ingestion({ attempt_count: 4 })] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({
      status: 'accepted', leadId: '55555555-5555-4555-8555-555555555555'
    })
    expect(mocks.query.mock.calls[2]?.[0]).toMatch(/error_class = 'final_attempt_leased'[\s\S]*next_attempt_at = NOW\(\) \+ MAKE_INTERVAL/)
    expect(mocks.query.mock.calls[2]?.[0]).not.toMatch(/terminal_at\s*=\s*NOW\(\)/)
    expect(transactionSql(/attempt_count = CASE/)).toMatch(/attempt_count = CASE[\s\S]*error_class = 'final_attempt_leased'[\s\S]*THEN 5/)
  })

  it('resolves a post-acceptance crash through canonical idempotency on final-lease recovery', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        attempt_count: 4,
        status: 'failed',
        error_class: 'final_attempt_leased',
        terminal_at: null,
        next_attempt_at: '2026-07-28T00:00:00.000Z'
      })]
    }).mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.acceptLead.mockResolvedValueOnce({ status: 'duplicate', leadId: '55555555-5555-4555-8555-555555555555' })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({ status: 'duplicate' })
    expect(mocks.acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      lead: expect.objectContaining({ source_lead_id: `email:${ENDPOINT_ID}:${HASH}` })
    }))
    expect(transactionSql(/attempt_count = CASE/)).toMatch(/attempt_count = CASE[\s\S]*THEN 5/)
  })

  it('terminally quarantines the exact fifth canonical failure without a sixth attempt', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [ingestion({ attempt_count: 4 })] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.acceptLead.mockRejectedValueOnce(new TypeError('canonical handoff failed'))

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope()))
      .resolves.toEqual({ status: 'quarantined' })
    expect(transactionSql(/status = \$2/)).toMatch(
      /status = \$2[\s\S]*attempt_count = CASE[\s\S]*THEN 5[\s\S]*error_class = \$12[\s\S]*terminal_at = NOW\(\)/
    )
  })

  it('atomically audits the exact fifth recovery failure as attempts exhausted', async () => {
    const recoveryLeaseToken = '66666666-6666-4666-8666-666666666666'
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({ attempt_count: 4, recovery_lease_token: recoveryLeaseToken })]
    }).mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.acceptLead.mockRejectedValueOnce(new Error('canonical handoff failed'))
    const recoveryQueries = vi.fn(async (sql: string) => ({
      rows: sql.includes('UPDATE lead_email_ingestions')
        ? [{ id: INGESTION_ID, endpoint_id: ENDPOINT_ID, client_id: CLIENT_ID }]
        : sql.includes('UPDATE lead_email_endpoints')
          ? [{ id: ENDPOINT_ID }]
          : []
    }))
    mocks.transaction
      .mockImplementationOnce(async callback => callback({ query: mocks.query }))
      .mockImplementationOnce(async callback => callback({ query: recoveryQueries }))

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope(),
      {
        recoveryLeaseToken,
        recoveryAudit: {
          actorId: null,
          actorType: 'cron',
          action: 'recovery_completed'
        }
      }
    )).resolves.toEqual({ status: 'quarantined' })
    expect(recoveryQueries.mock.calls[0]?.[0]).toMatch(/status = \$2[\s\S]*attempt_count = CASE/)
    expect(recoveryQueries.mock.calls[1]?.[0]).toMatch(/lead_email_endpoints/)
    expect(recoveryQueries.mock.calls[2]?.[0]).toMatch(/lead_email_ingestion_audits[\s\S]*reason/)
    expect(recoveryQueries.mock.calls[2]?.[1]).toContain('attempts_exhausted')
  })

  it('does not start a sixth canonical handoff after the fifth claim is terminal', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        attempt_count: 5,
        status: 'failed',
        terminal_at: '2026-07-29T00:01:00.000Z',
        next_attempt_at: null
      })]
    })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({ status: 'duplicate' })
    expect(mocks.acceptLead).not.toHaveBeenCalled()
  })

  it('calls the canonical full-CRM boundary with rules enabled and keeps similarity failure advisory', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [ingestion()] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.duplicateSignal.mockRejectedValueOnce(new Error('similarity unavailable'))

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({
      status: 'accepted', leadId: '55555555-5555-4555-8555-555555555555'
    })
    expect(mocks.resolveLeadCaptureMode).toHaveBeenCalledWith(CLIENT_ID)
    expect(mocks.acceptLead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      leadCaptureMode: 'full_crm',
      consentDecision: 'unknown',
      emailEvidenceGuard: {
        ingestionId: INGESTION_ID,
        leaseToken: expect.any(String)
      },
      lead: expect.objectContaining({
        client_id: CLIENT_ID, source: 'email',
        source_lead_id: `email:${ENDPOINT_ID}:${HASH}`,
        form_id: `email_endpoint:${ENDPOINT_ID}`
      })
    }))
    expect(mocks.acceptLead.mock.calls[0]?.[1]).not.toHaveProperty('runRules', false)
  })

  it('terminally quarantines an endpoint whose client became analytics-only before claim', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{ ...endpoint, lead_capture_mode: 'analytics_only' }]
    }).mockResolvedValueOnce({ rows: [ingestion()] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope()))
      .resolves.toEqual({ status: 'quarantined' })

    expect(mocks.resolveLeadCaptureMode).not.toHaveBeenCalled()
    expect(mocks.acceptLead).not.toHaveBeenCalled()
    expect(transactionSql(/status = \$2/)).toMatch(/error_class = \$12/)
    expect(mocks.query.mock.calls.some(([sql, params]) => (
      /UPDATE lead_email_ingestions/.test(sql as string)
      && (params as unknown[])?.includes('capture_mode_ineligible')
    ))).toBe(true)
  })

  it('never reports a late analytics-only mode skip as a duplicate', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] })
      .mockResolvedValueOnce({ rows: [ingestion()] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.resolveLeadCaptureMode.mockResolvedValueOnce('analytics_only')
    mocks.acceptLead.mockResolvedValueOnce({ status: 'mode_skipped' })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope()))
      .resolves.toEqual({ status: 'quarantined' })

    expect(transactionSql(/status = \$2/)).toBeDefined()
    expect(mocks.query.mock.calls.some(([sql, params]) => (
      /UPDATE lead_email_ingestions/.test(sql as string)
      && (params as unknown[])?.includes('capture_mode_ineligible')
    ))).toBe(true)
  })

  it('counts terminal quarantines once per message and resets on a processed duplicate', async () => {
    let consecutiveFailures = 0
    const transactionGroups: string[][] = []
    const correlationByIngestion = new Map<string, string>()
    for (let index = 1; index <= 6; index++) {
      correlationByIngestion.set(
        `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
        `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`
      )
    }
    mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (/FROM lead_email_endpoints/.test(sql)) return { rows: [endpoint] }
      if (/SELECT id, endpoint_id/.test(sql)) {
        const id = params[0] as string
        return {
          rows: [ingestion({
            id,
            correlation_id: correlationByIngestion.get(id)
          })]
        }
      }
      if (/UPDATE lead_email_ingestions/.test(sql)) {
        return {
          rows: [{
            id: params[0],
            endpoint_id: ENDPOINT_ID,
            client_id: CLIENT_ID
          }]
        }
      }
      if (/UPDATE lead_email_endpoints/.test(sql)) {
        if (/consecutive_failures = consecutive_failures \+ 1/.test(sql)) consecutiveFailures++
        if (/consecutive_failures = 0/.test(sql)) consecutiveFailures = 0
        return { rows: [{ id: ENDPOINT_ID }] }
      }
      return { rows: [] }
    })
    mocks.transaction.mockImplementation(async (callback) => {
      const group: string[] = []
      transactionGroups.push(group)
      return callback({
        query: (sql: string, params: unknown[]) => {
          group.push(sql)
          return mocks.query(sql, params)
        }
      })
    })

    for (let index = 1; index <= 5; index++) {
      const id = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`
      await expect(acceptEmailEnvelope(
        {} as never,
        id,
        envelope({
          ingestionId: id,
          correlationId: correlationByIngestion.get(id),
          extraction: null,
          quarantine: {
            reason: 'Extraction requires review',
            encryptedObjectKey: 'email-ingestions/retained-evidence',
            expiresAt: '2099-08-05T00:00:00.000Z'
          }
        })
      )).resolves.toEqual({ status: 'quarantined' })
    }

    expect(consecutiveFailures).toBe(5)
    expect(transactionGroups.filter(group => (
      group.some(sql => /UPDATE lead_email_ingestions/.test(sql))
      && group.some(sql => /UPDATE lead_email_endpoints/.test(sql))
    ))).toHaveLength(5)

    const successId = '33333333-3333-4333-8333-000000000006'
    mocks.acceptLead.mockResolvedValueOnce({ status: 'duplicate' })
    await expect(acceptEmailEnvelope(
      {} as never,
      successId,
      envelope({
        ingestionId: successId,
        correlationId: correlationByIngestion.get(successId)
      })
    )).resolves.toEqual({ status: 'duplicate' })

    expect(consecutiveFailures).toBe(0)
    expect(transactionGroups.some(group => (
      group.some(sql => /status = \$2/.test(sql))
      && group.some(sql => /consecutive_failures = 0/.test(sql))
    ))).toBe(true)
  })

  it('does not count a transient canonical retry as another endpoint failure', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] })
      .mockResolvedValueOnce({ rows: [ingestion()] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.acceptLead.mockRejectedValueOnce(new Error('canonical temporarily unavailable'))

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope()))
      .rejects.toThrow('canonical temporarily unavailable')

    expect(queryOneSql(/UPDATE lead_email_endpoints/)).toBeUndefined()
    expect(transactionSql(/UPDATE lead_email_endpoints/)).toBeUndefined()
  })

  it('leases a claim so a concurrent retry cannot call canonical acceptance twice', async () => {
    let releaseAcceptance!: (value: { status: 'created', leadId: string }) => void
    mocks.acceptLead.mockImplementationOnce(() => new Promise(resolve => { releaseAcceptance = resolve }))
    mocks.query
      .mockResolvedValueOnce({ rows: [endpoint] })
      .mockResolvedValueOnce({ rows: [ingestion()] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
      .mockResolvedValueOnce({ rows: [endpoint] })
      .mockResolvedValueOnce({ rows: [ingestion({ next_attempt_at: '2099-01-01T00:00:00.000Z' })] })

    const first = acceptEmailEnvelope({} as never, INGESTION_ID, envelope())
    await vi.waitFor(() => expect(mocks.acceptLead).toHaveBeenCalledOnce())
    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope())).resolves.toEqual({ status: 'in_progress' })
    releaseAcceptance({ status: 'created', leadId: '55555555-5555-4555-8555-555555555555' })
    await expect(first).resolves.toEqual({ status: 'accepted', leadId: '55555555-5555-4555-8555-555555555555' })
    expect(mocks.acceptLead).toHaveBeenCalledOnce()
  })

  it('allows only the matching recovery owner through a live recovery lease', async () => {
    const recoveryLeaseToken = '66666666-6666-4666-8666-666666666666'
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        recovery_lease_token: recoveryLeaseToken,
        next_attempt_at: '2099-01-01T00:00:00.000Z'
      })]
    }).mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope(),
      { recoveryLeaseToken }
    )).resolves.toEqual({
      status: 'accepted',
      leadId: '55555555-5555-4555-8555-555555555555'
    })

    expect(mocks.acceptLead).toHaveBeenCalledOnce()
    expect(mocks.query.mock.calls[2]?.[0]).toMatch(/recovery_lease_token = \$3::uuid/)
    expect(mocks.query.mock.calls[2]?.[1]).toEqual([
      INGESTION_ID,
      expect.any(Number),
      recoveryLeaseToken
    ])
    expect(transactionSql(/recovery_lease_token = \$11::uuid/)).toMatch(/recovery_lease_token = \$11::uuid/)
  })

  it('requires the matching recovery owner when reserving the fifth attempt', async () => {
    const recoveryLeaseToken = '66666666-6666-4666-8666-666666666666'
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        attempt_count: 4,
        recovery_lease_token: recoveryLeaseToken,
        next_attempt_at: '2099-01-01T00:00:00.000Z'
      })]
    }).mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope(),
      { recoveryLeaseToken }
    )).resolves.toEqual({
      status: 'accepted',
      leadId: '55555555-5555-4555-8555-555555555555'
    })

    expect(mocks.query.mock.calls[2]?.[0]).toMatch(/recovery_lease_token = \$3::uuid/)
    expect(mocks.query.mock.calls[2]?.[1]).toEqual([
      INGESTION_ID,
      expect.any(Number),
      recoveryLeaseToken
    ])
  })

  it('does not let a stale recovery owner cross another live lease', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        recovery_lease_token: '77777777-7777-4777-8777-777777777777',
        next_attempt_at: '2099-01-01T00:00:00.000Z'
      })]
    })

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope(),
      { recoveryLeaseToken: '66666666-6666-4666-8666-666666666666' }
    )).resolves.toEqual({ status: 'in_progress' })

    expect(mocks.acceptLead).not.toHaveBeenCalled()
  })

  it('does not report acceptance when a delayed owner loses the terminal compare-and-set', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] })
      .mockResolvedValueOnce({ rows: [ingestion()] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
      .mockResolvedValueOnce({ rows: [] })
    mocks.queryOne.mockResolvedValueOnce({ id: INGESTION_ID })

    await expect(acceptEmailEnvelope({} as never, INGESTION_ID, envelope()))
      .resolves.toEqual({ status: 'in_progress' })

    expect(mocks.acceptLead).toHaveBeenCalledOnce()
  })

  it('rolls back a recovery terminal state when its audit insert fails', async () => {
    const recoveryLeaseToken = '66666666-6666-4666-8666-666666666666'
    let persistedStatus = 'received'
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({ recovery_lease_token: recoveryLeaseToken })]
    }).mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.transaction
      .mockImplementationOnce(async callback => callback({ query: mocks.query }))
      .mockImplementationOnce(async callback => callback({ query: mocks.query }))
      .mockImplementationOnce(async (callback) => {
        const before = persistedStatus
        try {
          return await callback({
            query: vi.fn(async (sql: string) => {
              if (sql.includes('UPDATE lead_email_ingestions')) {
                persistedStatus = 'accepted'
                return {
                  rows: [{
                    id: INGESTION_ID,
                    endpoint_id: ENDPOINT_ID,
                    client_id: CLIENT_ID
                  }]
                }
              }
              if (sql.includes('UPDATE lead_email_endpoints')) return { rows: [{ id: ENDPOINT_ID }] }
              throw new Error('audit unavailable')
            })
          })
        } catch (error) {
          persistedStatus = before
          throw error
        }
      })

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope(),
      {
        recoveryLeaseToken,
        recoveryAudit: {
          actorId: null,
          actorType: 'cron',
          action: 'recovery_completed'
        }
      }
    )).rejects.toThrow('audit unavailable')
    expect(persistedStatus).toBe('received')
    expect(mocks.queryOne).toHaveBeenCalledOnce()
    expect(mocks.queryOne.mock.calls[0]?.[0]).toMatch(/SELECT id[\s\S]*staged_expires_at > clock_timestamp\(\)/)
  })

  it('expires a late canonical claim before lead acceptance in the same recovery audit transaction', async () => {
    const recoveryLeaseToken = '66666666-6666-4666-8666-666666666666'
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        recovery_lease_token: recoveryLeaseToken,
        staged_expires_at: '2026-07-28T00:00:00.000Z',
        staged_expired: true
      })]
    })
    const expiryQueries = vi.fn(async (sql: string) => ({
      rows: sql.includes('UPDATE lead_email_ingestions')
        ? [{ id: INGESTION_ID, endpoint_id: ENDPOINT_ID, client_id: CLIENT_ID }]
        : sql.includes('UPDATE lead_email_endpoints')
          ? [{ id: ENDPOINT_ID }]
          : []
    }))
    mocks.transaction
      .mockImplementationOnce(async callback => callback({ query: mocks.query }))
      .mockImplementationOnce(async callback => callback({ query: expiryQueries }))

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope(),
      {
        recoveryLeaseToken,
        recoveryAudit: {
          actorId: null,
          actorType: 'cron',
          action: 'recovery_completed'
        }
      }
    )).resolves.toEqual({ status: 'quarantined' })
    expect(mocks.acceptLead).not.toHaveBeenCalled()
    expect(expiryQueries.mock.calls[0]?.[0]).toMatch(/evidence_expired/)
    expect(expiryQueries.mock.calls[1]?.[0]).toMatch(/lead_email_endpoints/)
    expect(expiryQueries.mock.calls[2]?.[0]).toMatch(/lead_email_ingestion_audits/)
  })

  it('hands a late normal-transport claim to audited recovery without terminalizing it', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        staged_expires_at: null,
        staged_expired: true
      })]
    })

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope()
    )).resolves.toEqual({ status: 'in_progress' })

    expect(mocks.acceptLead).not.toHaveBeenCalled()
    expect(mocks.queryOne.mock.calls[0]?.[0]).toMatch(
      /status = 'failed'[\s\S]*terminal_at = NULL[\s\S]*next_attempt_at = NOW\(\)[\s\S]*staged_expires_at IS NULL[\s\S]*recovery_lease_token IS NULL/
    )
    expect(mocks.queryOne.mock.calls[0]?.[1]).toEqual([INGESTION_ID])
  })

  it('does not start canonical work without the conservative evidence window', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [ingestion({
        staged_expired: false,
        staged_ready: false
      })]
    })

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope()
    )).resolves.toEqual({ status: 'in_progress' })

    expect(mocks.acceptLead).not.toHaveBeenCalled()
    expect(mocks.query.mock.calls[1]?.[0]).toMatch(
      /staged_expires_at > clock_timestamp\(\)[\s\S]*MAKE_INTERVAL\(secs => \$2::int\) AS staged_ready/
    )
  })

  it('stops before canonical acceptance when evidence expires during async mode resolution', async () => {
    const recoveryLeaseToken = '66666666-6666-4666-8666-666666666666'
    mocks.query.mockResolvedValueOnce({ rows: [endpoint] })
      .mockResolvedValueOnce({ rows: [ingestion({
        recovery_lease_token: recoveryLeaseToken,
        staged_expires_at: '2026-07-29T00:05:00.000Z',
        staged_expired: false,
        staged_ready: true
      })] })
      .mockResolvedValueOnce({ rows: [{ id: INGESTION_ID }] })
    mocks.resolveLeadCaptureMode.mockResolvedValueOnce('full_crm')
    mocks.queryOne.mockResolvedValueOnce(null)
    const expiryQueries = vi.fn(async (sql: string) => ({
      rows: sql.includes('UPDATE lead_email_ingestions')
        ? [{ id: INGESTION_ID, endpoint_id: ENDPOINT_ID, client_id: CLIENT_ID }]
        : sql.includes('UPDATE lead_email_endpoints')
          ? [{ id: ENDPOINT_ID }]
          : []
    }))
    mocks.transaction
      .mockImplementationOnce(async callback => callback({ query: mocks.query }))
      .mockImplementationOnce(async callback => callback({ query: expiryQueries }))

    await expect(acceptEmailEnvelope(
      {} as never,
      INGESTION_ID,
      envelope(),
      {
        recoveryLeaseToken,
        recoveryAudit: {
          actorId: null,
          actorType: 'cron',
          action: 'recovery_completed'
        }
      }
    )).resolves.toEqual({ status: 'quarantined' })

    expect(mocks.acceptLead).not.toHaveBeenCalled()
    expect(expiryQueries.mock.calls[0]?.[0]).toMatch(/evidence_expired/)
    expect(expiryQueries.mock.calls[1]?.[0]).toMatch(/lead_email_endpoints/)
    expect(expiryQueries.mock.calls[2]?.[0]).toMatch(/lead_email_ingestion_audits/)
  })
})
