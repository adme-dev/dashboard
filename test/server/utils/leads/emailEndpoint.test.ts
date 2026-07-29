import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const query = vi.fn()
const transaction = vi.fn(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))

vi.mock('~~/server/utils/db', () => ({
  queryOne: vi.fn(), queryRows: vi.fn(), transaction: (...args: unknown[]) => transaction(...args)
}))
vi.mock('~~/server/utils/leads/emailRoutingPreset', () => ({ applyEmailRoutingPreset: vi.fn() }))

const clientId = '11111111-1111-4111-8111-111111111111'
const actorId = '22222222-2222-4222-8222-222222222222'

function result(rows: unknown[] = []) {
  return { rows }
}

function senderDomainAudit(domains: string[]) {
  const normalized = [...new Set(domains.map(domain => domain.trim().toLowerCase()))].sort()
  return {
    allowed_sender_domains_count: normalized.length,
    allowed_sender_domains_sha256: createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
  }
}

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333', client_id: clientId,
    label: 'carsales', address_prefix: 'carsales', address_token: '0123456789',
    email_address: 'carsales-0123456789@leads.xeroflow.io',
    expected_provider: null, parser_mode: 'auto', ai_extraction_mode: 'disabled', allowed_sender_domains: [],
    ai_privacy_approval_version: null, ai_privacy_approved_at: null, ai_privacy_approved_by: null,
    expected_max_silence_hours: null, first_response_sla_minutes: null,
    form_id: 'email_endpoint:33333333-3333-4333-8333-333333333333', form_name: 'Carsales', enabled: true,
    previous_address_token: null, previous_token_grace_until: null, last_received_at: null, last_accepted_at: null,
    last_failure_at: null, consecutive_failures: 0, created_by: actorId, retired_at: null,
    created_at: '2026-07-29T00:00:00.000Z', updated_at: '2026-07-29T00:00:00.000Z', ...overrides
  }
}

describe('email endpoint service', () => {
  beforeEach(() => {
    query.mockReset()
    transaction.mockClear()
  })

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

  it('audits a stable sender-policy digest and count when an endpoint is created', async () => {
    const { createEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    const domains = ['z.example', 'a.example']
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ lead_capture_mode: 'capture_only' }]))
      .mockResolvedValueOnce(result([endpoint({ allowed_sender_domains: domains })]))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result())

    await createEmailEndpoint({
      clientId,
      label: 'Carsales',
      formName: 'Carsales',
      allowedSenderDomains: [' Z.Example ', 'a.example', 'z.example']
    }, actorId)

    expect(query.mock.calls[2][1][9]).toBe(JSON.stringify(['a.example', 'z.example']))
    const auditCall = query.mock.calls.find(([sql]) => String(sql).includes('lead_email_endpoint_audits'))
    const afterState = JSON.parse(auditCall?.[1]?.[5] as string)
    expect(afterState).toMatchObject(senderDomainAudit(domains))
    expect(afterState).not.toHaveProperty('allowed_sender_domains')
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

  it('rejects direct fallback creation unless the runtime capability and current privacy approval are both present', async () => {
    const {
      createEmailEndpoint,
      EMAIL_AI_PRIVACY_APPROVAL_VERSION
    } = await import('~~/server/utils/leads/emailEndpoint')

    await expect(createEmailEndpoint({
      clientId,
      label: 'General',
      formName: 'General enquiries',
      aiExtractionMode: 'fallback',
      aiPrivacyApprovalVersion: EMAIL_AI_PRIVACY_APPROVAL_VERSION
    }, actorId)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'email_ai_capability_unavailable'
    })

    await expect(createEmailEndpoint({
      clientId,
      label: 'General',
      formName: 'General enquiries',
      aiExtractionMode: 'fallback'
    }, actorId, { aiExtractionAvailable: true })).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'email_ai_privacy_approval_required'
    })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('restricts fallback approval to an administrator and persists the current approval version', async () => {
    const {
      createEmailEndpoint,
      EMAIL_AI_PRIVACY_APPROVAL_VERSION
    } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ lead_capture_mode: 'capture_only' }]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([endpoint({
        ai_extraction_mode: 'fallback',
        ai_privacy_approval_version: EMAIL_AI_PRIVACY_APPROVAL_VERSION,
        ai_privacy_approved_at: '2026-07-30T00:00:00.000Z',
        ai_privacy_approved_by: actorId
      })]))
      .mockResolvedValueOnce(result())

    await createEmailEndpoint({
      clientId,
      label: 'General',
      formName: 'General enquiries',
      aiExtractionMode: 'fallback',
      aiPrivacyApprovalVersion: EMAIL_AI_PRIVACY_APPROVAL_VERSION
    }, actorId, { aiExtractionAvailable: true })

    expect(query.mock.calls[2][0]).toContain(`permission_group = 'ADMIN'`)
    expect(query.mock.calls[3][1]).toContain(EMAIL_AI_PRIVACY_APPROVAL_VERSION)
    expect(query.mock.calls[3][1]).toContain(actorId)
  })

  it('rejects a non-admin fallback approval before writing the endpoint', async () => {
    const {
      createEmailEndpoint,
      EMAIL_AI_PRIVACY_APPROVAL_VERSION
    } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ lead_capture_mode: 'capture_only' }]))
      .mockResolvedValueOnce(result([{ allowed: false }]))

    await expect(createEmailEndpoint({
      clientId,
      label: 'General',
      formName: 'General enquiries',
      aiExtractionMode: 'fallback',
      aiPrivacyApprovalVersion: EMAIL_AI_PRIVACY_APPROVAL_VERSION
    }, actorId, { aiExtractionAvailable: true })).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_ai_privacy_approval_forbidden'
    })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('does not expose opaque address tokens in the operator list projection', async () => {
    const { listEmailEndpoints } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ id: 'endpoint-1', email_address: 'carsales-lead_opaque@leads.xeroflow.io' }]))

    await expect(listEmailEndpoints(clientId, actorId)).resolves.toEqual([{ id: 'endpoint-1', email_address: 'carsales-lead_opaque@leads.xeroflow.io' }])
    expect(query.mock.calls[1][0]).not.toContain('address_token')
    expect(query.mock.calls[1][0]).not.toContain('previous_address_token')
  })

  it('batch-lists only clients in the actor management scope without per-client queries', async () => {
    const { listEmailEndpointsForActor } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ id: clientId, name: 'Northside Motors' }]))
      .mockResolvedValueOnce(result([{
        id: 'endpoint-1',
        client_id: clientId,
        email_address: 'carsales-lead_opaque@leads.xeroflow.io',
        oldest_nonterminal_at: '2026-07-30T00:00:00.000Z',
        non_terminal_count: 1,
        recovery_attempt_count: 2,
        exhausted_recovery_count: 0,
        recovery_state: 'retrying',
        address_prefix_locked: true
      }]))

    await expect(listEmailEndpointsForActor(actorId)).resolves.toEqual({
      clients: [{ id: clientId, name: 'Northside Motors' }],
      items: [expect.objectContaining({
        id: 'endpoint-1',
        recovery_state: 'retrying',
        address_prefix_locked: true
      })]
    })

    expect(query).toHaveBeenCalledTimes(2)
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toContain('client_team_assignments')
      expect(sql).toContain(`tm.user_role IN ('owner', 'admin', 'lead', 'project_manager')`)
      expect(params).toEqual([actorId])
    }
    const endpointSql = query.mock.calls[1][0] as string
    expect(endpointSql).toContain('LEFT JOIN LATERAL')
    expect(endpointSql).toContain('i.client_id = endpoint.client_id')
    expect(endpointSql).toMatch(/COUNT\(\*\)\s*>\s*0\s+AS address_prefix_locked/i)
    expect(endpointSql).toContain('oldest_nonterminal_at')
    expect(endpointSql).toContain('recovery_attempt_count')
    expect(endpointSql).toContain('exhausted_recovery_count')
    expect(endpointSql).toContain('address_prefix_locked')
    expect(endpointSql).not.toContain('address_token')
    expect(endpointSql).not.toContain('previous_address_token')
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
    expect(query.mock.calls[3][1][11]).toBe(false)
    expect(query.mock.calls[3][0]).toContain('retired_at = COALESCE')
  })

  it('always lets an authorized manager disable fallback and revokes its approval without the runtime capability', async () => {
    const { updateEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([endpoint({
      ai_extraction_mode: 'fallback',
      ai_privacy_approval_version: 1,
      ai_privacy_approved_at: '2026-07-30T00:00:00.000Z',
      ai_privacy_approved_by: actorId
    })]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ received: false }]))
      .mockResolvedValueOnce(result([endpoint({
        ai_extraction_mode: 'disabled',
        ai_privacy_approval_version: null,
        ai_privacy_approved_at: null,
        ai_privacy_approved_by: null
      })]))

    await expect(updateEmailEndpoint(
      '33333333-3333-4333-8333-333333333333',
      { aiExtractionMode: 'disabled' },
      actorId
    )).resolves.toMatchObject({
      ai_extraction_mode: 'disabled',
      ai_privacy_approval_version: null
    })

    expect(query.mock.calls[3][1]).toContain('disabled')
    expect(query.mock.calls[3][1]).toContain(null)
    expect(query.mock.calls.some(([sql]) => String(sql).includes(`permission_group = 'ADMIN'`))).toBe(false)
  })

  it('preserves the ingestion-backed prefix lock in update responses', async () => {
    const { toSafeEmailEndpoint, updateEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([endpoint({ last_received_at: null })]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ received: true }]))
      .mockResolvedValueOnce(result([endpoint({ label: 'updated', last_received_at: null })]))
      .mockResolvedValueOnce(result())

    const updated = await updateEmailEndpoint(
      '33333333-3333-4333-8333-333333333333',
      { label: 'Updated' },
      actorId
    )

    expect(toSafeEmailEndpoint(updated).address_prefix_locked).toBe(true)
  })

  it('uses exactly ten lowercase Crockford Base32 characters for every recipient token', async () => {
    const { generateEmailEndpointToken } = await import('~~/server/utils/leads/emailEndpoint')
    const { EmailStageRequestSchema } = await import('../../../../../shared/leads/email/contracts')
    const token = generateEmailEndpointToken()

    expect(token).toMatch(/^[0123456789abcdefghjkmnpqrstvwxyz]{10}$/)
    expect(token).not.toContain('lead_')
    expect(EmailStageRequestSchema.shape.recipientToken.safeParse(token).success).toBe(true)
  })

  it('rejects a whitespace-only form name before opening a transaction', async () => {
    const { createEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')

    await expect(createEmailEndpoint({ clientId, label: 'Carsales', formName: '   ' }, actorId))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_form_name' })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('atomically recomputes an unused address and synchronizes the form name everywhere', async () => {
    const { updateEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    const old = endpoint()
    const changed = endpoint({ address_prefix: 'website', email_address: 'website-0123456789@leads.xeroflow.io', form_name: 'Website leads' })
    query.mockResolvedValueOnce(result([old]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ received: false }]))
      .mockResolvedValueOnce(result([changed]))
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result())

    await expect(updateEmailEndpoint(old.id, { addressPrefix: 'Website', formName: '  Website leads  ' }, actorId))
      .resolves.toMatchObject({ email_address: 'website-0123456789@leads.xeroflow.io', form_name: 'Website leads' })
    expect(query.mock.calls[3][1][3]).toBe('website-0123456789@leads.xeroflow.io')
    expect(query.mock.calls[4][0]).toContain('UPDATE lead_form_metadata SET form_name')
    expect(query.mock.calls[5][0]).toContain('UPDATE lead_form_rules SET form_name')
    expect(query.mock.calls[6][0]).toContain('lead_email_endpoint_audits')
  })

  it('audits before and after sender-policy evidence when the allowlist changes', async () => {
    const { updateEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    const oldDomains = ['z.example', 'a.example']
    const newDomains = ['b.example', 'a.example']
    const old = endpoint({ allowed_sender_domains: oldDomains })
    const changed = endpoint({ allowed_sender_domains: newDomains })
    query.mockResolvedValueOnce(result([old]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{ received: false }]))
      .mockResolvedValueOnce(result([changed]))
      .mockResolvedValueOnce(result())

    await updateEmailEndpoint(old.id, {
      allowedSenderDomains: [' B.Example ', 'a.example', 'b.example']
    }, actorId)

    expect(query.mock.calls[3][1][7]).toBe(JSON.stringify(['a.example', 'b.example']))
    const auditCall = query.mock.calls.find(([sql]) => String(sql).includes('lead_email_endpoint_audits'))
    const beforeState = JSON.parse(auditCall?.[1]?.[4] as string)
    const afterState = JSON.parse(auditCall?.[1]?.[5] as string)
    expect(beforeState).toMatchObject(senderDomainAudit(oldDomains))
    expect(afterState).toMatchObject(senderDomainAudit(newDomains))
    expect(beforeState).not.toHaveProperty('allowed_sender_domains')
    expect(afterState).not.toHaveProperty('allowed_sender_domains')
  })

  it('does not rotate a disabled endpoint', async () => {
    const { rotateEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([endpoint({ enabled: false })]))
      .mockResolvedValueOnce(result([{ allowed: true }]))

    await expect(rotateEmailEndpoint('33333333-3333-4333-8333-333333333333', actorId))
      .rejects.toMatchObject({ statusCode: 409, statusMessage: 'email_endpoint_disabled' })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('preserves the tenant-scoped prefix lock in rotation responses', async () => {
    const { rotateEmailEndpoint, toSafeEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([endpoint({
      last_received_at: null,
      address_prefix_locked: true
    })]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([endpoint({
        email_address: 'carsales-abcdefghjk@leads.xeroflow.io',
        last_received_at: null
      })]))
      .mockResolvedValueOnce(result())

    const rotated = await rotateEmailEndpoint(
      '33333333-3333-4333-8333-333333333333',
      actorId
    )

    expect(query.mock.calls[0][0]).toContain('ingestion.client_id = endpoint.client_id')
    expect(toSafeEmailEndpoint(rotated).address_prefix_locked).toBe(true)
  })

  it('does not allow an unbounded ingestion history query', async () => {
    const { listEmailEndpointIngestions } = await import('~~/server/utils/leads/emailEndpoint')

    await expect(listEmailEndpointIngestions('33333333-3333-4333-8333-333333333333', actorId, { limit: 101 }))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_history_limit' })
    expect(transaction).not.toHaveBeenCalled()
  })

  it('projects only safe recovery status and replay eligibility into ingestion history', async () => {
    const { listEmailEndpointIngestions } = await import('~~/server/utils/leads/emailEndpoint')
    query.mockResolvedValueOnce(result([{ client_id: clientId }]))
      .mockResolvedValueOnce(result([{ allowed: true }]))
      .mockResolvedValueOnce(result([{
        id: '44444444-4444-4444-8444-444444444444',
        status: 'quarantined',
        replay_available: true,
        replay_unavailable_reason: null
      }]))

    await expect(listEmailEndpointIngestions(
      '33333333-3333-4333-8333-333333333333',
      actorId
    )).resolves.toMatchObject({
      items: [{ status: 'quarantined', replay_available: true }]
    })

    const historySql = query.mock.calls[2][0] as string
    for (const unsafe of [
      'correlation_id', 'sender_domain', 'safe_evidence', 'parser',
      'confidence', 'processing_ms'
    ]) {
      expect(historySql).not.toContain(unsafe)
    }
    expect(historySql).toContain('replay_available')
    expect(historySql).toContain('replay_unavailable_reason')
    expect(historySql).toContain('recovery_claimed_at')
    expect(historySql).toContain('Replay is already in progress')
    expect(historySql).toContain('replay_endpoint.client_id = i.client_id')
  })

  it('removes both raw token fields from serialized endpoint responses', async () => {
    const { toSafeEmailEndpoint } = await import('~~/server/utils/leads/emailEndpoint')

    const safe = toSafeEmailEndpoint(endpoint({
      previous_token_grace_until: '2026-07-31T00:00:00.000Z',
      ai_privacy_approval_version: 1,
      ai_privacy_approved_at: '2026-07-30T00:00:00.000Z',
      ai_privacy_approved_by: actorId
    }))
    expect(safe).not.toHaveProperty('address_token')
    expect(safe).not.toHaveProperty('previous_address_token')
    expect(safe).not.toHaveProperty('previous_token_grace_until')
    expect(safe).not.toHaveProperty('created_by')
    expect(safe).not.toHaveProperty('ai_privacy_approved_by')
    expect(safe).toMatchObject({
      ai_privacy_approval_version: 1,
      ai_privacy_approved_at: '2026-07-30T00:00:00.000Z'
    })
    expect(safe.email_address).toContain('@leads.xeroflow.io')
  })
})
