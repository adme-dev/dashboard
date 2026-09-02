import { describe, expect, it, vi } from 'vitest'
import type { DealerEvidenceEndpoint } from '~~/server/utils/measurement/dealerEvidence'
import { createPostgresDealerEvidenceRepository } from '~~/server/utils/measurement/dealerEvidenceRepository'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'

function endpointRow() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    client_id: CLIENT_ID,
    profile_id: '22222222-2222-4222-8222-222222222222',
    endpoint_key: 'northern-gac-evidence-endpoint-key-001',
    source_system: 'dealer_platform',
    status: 'test',
    replay_window_seconds: 300,
    tracking_site_id: 'northern-gac-site',
    current_secret_ref: 'DEALER_EVIDENCE_CURRENT',
    previous_secret_ref: null,
    previous_secret_valid_until: null,
    allow_server_delivery: false,
    browser_server_dedup_validated: false
  }
}

function input(endpoint: DealerEvidenceEndpoint) {
  return {
    endpoint,
    nonce: 'nonce-100',
    nonceExpiresAt: new Date('2026-09-02T05:05:00.000Z'),
    receivedAt: new Date('2026-09-02T05:00:00.000Z'),
    payload: {
      version: 'dealer.measurement.evidence.v1' as const,
      clientId: CLIENT_ID,
      siteId: 'northern-gac-site',
      eventId: 'evt-100',
      event: { name: 'phone_click' as const },
      occurredAt: '2026-09-02T04:59:30.000Z',
      consent: { analytics: 'granted' as const, advertising: 'granted' as const },
      evidence: [{ stage: 'captured' as const, outcome: 'observed' as const }]
    }
  }
}

describe('dealer evidence repository', () => {
  it('resolves secrets by reference without returning references', async () => {
    const queryOne = vi.fn(async () => endpointRow())
    const repository = createPostgresDealerEvidenceRepository({
      queryOne: queryOne as never,
      transaction: vi.fn() as never,
      resolveSecret: reference => reference === 'DEALER_EVIDENCE_CURRENT' ? 'resolved-secret' : null
    })

    await expect(repository.resolveEndpoint('northern-gac-evidence-endpoint-key-001'))
      .resolves.toMatchObject({ clientId: CLIENT_ID, currentSecret: 'resolved-secret' })
    expect(JSON.stringify(await repository.resolveEndpoint('northern-gac-evidence-endpoint-key-001')))
      .not.toContain('DEALER_EVIDENCE_CURRENT')
  })

  it('persists event and stage rows with client predicates and hashed nonces', async () => {
    const queries: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params })
        if (/SELECT id\s+FROM measurement_evidence_events/.test(sql)) return { rows: [] }
        if (/INSERT INTO measurement_evidence_nonces/.test(sql)) return { rows: [{ id: 'nonce-row' }] }
        if (/INSERT INTO measurement_evidence_events/.test(sql)) return { rows: [{ id: 'event-row' }] }
        return { rows: [] }
      })
    }
    const repository = createPostgresDealerEvidenceRepository({
      queryOne: vi.fn() as never,
      transaction: async callback => callback(db),
      resolveSecret: () => null
    })
    const endpoint = {
      id: endpointRow().id,
      clientId: CLIENT_ID,
      profileId: endpointRow().profile_id,
      endpointKey: endpointRow().endpoint_key,
      sourceSystem: 'dealer_platform',
      status: 'test' as const,
      replayWindowSeconds: 300,
      trackingSiteId: 'northern-gac-site',
      currentSecret: 'secret',
      previousSecret: null,
      previousSecretValidUntil: null,
      allowServerDelivery: false,
      browserServerDedupValidated: false
    }

    await expect(repository.persist(input(endpoint))).resolves.toEqual({ status: 'created' })
    expect(queries.every(query => query.params.includes(CLIENT_ID))).toBe(true)
    const nonceInsert = queries.find(query => /INSERT INTO measurement_evidence_nonces/.test(query.sql))!
    expect(nonceInsert.params[2]).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(queries)).not.toContain('nonce-100')
  })

  it('returns duplicate before reserving a nonce and replay before inserting an event', async () => {
    const endpoint = {
      id: endpointRow().id,
      clientId: CLIENT_ID,
      profileId: endpointRow().profile_id,
      endpointKey: endpointRow().endpoint_key,
      sourceSystem: 'dealer_platform',
      status: 'test' as const,
      replayWindowSeconds: 300,
      trackingSiteId: 'northern-gac-site',
      currentSecret: 'secret',
      previousSecret: null,
      previousSecretValidUntil: null,
      allowServerDelivery: false,
      browserServerDedupValidated: false
    }
    const duplicateDb = { query: vi.fn(async () => ({ rows: [{ id: 'existing' }] })) }
    const duplicate = createPostgresDealerEvidenceRepository({
      queryOne: vi.fn() as never,
      transaction: async callback => callback(duplicateDb),
      resolveSecret: () => null
    })
    await expect(duplicate.persist(input(endpoint))).resolves.toEqual({ status: 'duplicate' })
    expect(duplicateDb.query).toHaveBeenCalledTimes(1)

    const replayDb = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) }
    const replay = createPostgresDealerEvidenceRepository({
      queryOne: vi.fn() as never,
      transaction: async callback => callback(replayDb),
      resolveSecret: () => null
    })
    await expect(replay.persist(input(endpoint))).resolves.toEqual({ status: 'replay' })
    expect(replayDb.query).toHaveBeenCalledTimes(2)
  })
})
