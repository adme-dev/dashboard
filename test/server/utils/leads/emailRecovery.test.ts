import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
  encryptRawEmail,
  encryptStagedEmail
} from '../../../../workers/email-lead-intake/src/quarantine'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  query: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({
  transaction: mocks.transaction
}))

import {
  claimNextEmailRecovery,
  claimNextTerminalEmailObject,
  claimNextEmailTerminalReconciliation,
  cleanupTerminalEmailEvidence,
  processEmailRecoveryClaim,
  recoverEmailIngestions,
  replayEmailIngestion
} from '../../../../server/utils/leads/emailRecovery'

const INGESTION_ID = '11111111-1111-4111-8111-111111111111'
const ENDPOINT_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const LEASE_TOKEN = '44444444-4444-4444-8444-444444444444'
const SECRET = 'separate-email-quarantine-secret'
const EXTERNAL_ID_HASH = 'dcb3450e3d753d1a0f98277376b9343c271610515ece8298d421e42b95a49371'
const MESSAGE_ID_HASH = 'c554a336f571d0d9e9cdc3715c80e3544a9832bb2a1bcb755816387462ec5326'
const RAW_CONTENT_HASH = '4df9cd872e8e2e9786cc585921e189631b5fbc31a9e0dfe3449666747edfbf17'
const RAW = new TextEncoder().encode([
  'From: Carsales <relay@carsales.com.au>',
  'Subject: New Carsales lead',
  'Message-ID: <lead-42@example.test>',
  '',
  'Lead ID: provider-42',
  'Name: Alex Example',
  'Email: alex@example.test'
].join('\r\n'))

const claimedRow = {
  id: INGESTION_ID,
  endpoint_id: ENDPOINT_ID,
  client_id: CLIENT_ID,
  correlation_id: '55555555-5555-4555-8555-555555555555',
  transport: 'cloudflare_email_routing',
  external_id_hash: EXTERNAL_ID_HASH,
  message_id_hash: MESSAGE_ID_HASH,
  raw_content_hash_version: 1,
  raw_content_hash: RAW_CONTENT_HASH,
  provider: 'carsales',
  sender_domain: 'carsales.com.au',
  header_from_domain: 'carsales.com.au',
  raw_size: RAW.byteLength,
  safe_evidence: { hasText: true, hasHtml: false, hasAdf: false, fieldKeys: ['email'] },
  staged_object_key: 'email-ingestions/opaque-random-key',
  staged_expires_at: '2026-08-05T00:00:00.000Z',
  staged_uploaded_at: '2026-07-29T00:00:01.000Z',
  attempt_count: 0,
  created_at: '2026-07-29T00:00:00.000Z',
  endpoint_enabled: true,
  endpoint_retired_at: null,
  address_token: '0123456789',
  email_address: 'carsales-0123456789@leads.xeroflow.io',
  expected_provider: 'carsales',
  parser_mode: 'auto',
  ai_extraction_mode: 'disabled',
  ai_privacy_approval_version: null,
  ai_privacy_approved_at: null,
  ai_privacy_approved_by: null,
  lead_capture_mode: 'full_crm',
  allowed_sender_domains: ['carsales.com.au']
}

function hashBytes(raw: Uint8Array): string {
  return createHash('sha256').update(raw).digest('hex')
}

function manifestFor(claim: typeof claimedRow) {
  return {
    schemaVersion: 1 as const,
    ingestionId: claim.id,
    encryptedObjectKey: claim.staged_object_key!,
    provider: claim.provider,
    externalIdHash: claim.external_id_hash,
    messageIdHash: claim.message_id_hash,
    rawContentHashVersion: 1 as const,
    rawContentHash: claim.raw_content_hash
  }
}

function recoveryHarness(overrides: Record<string, unknown> = {}) {
  const bucket = {
    get: vi.fn(async () => ({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          RAW,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(claimedRow)
        )
      ).buffer
    })),
    delete: vi.fn(async () => {})
  }
  const repository = {
    releaseCanonicalWindow: vi.fn(async () => 'rescheduled' as const),
    quarantine: vi.fn(async () => true),
    reschedule: vi.fn(async () => true),
    clearTerminalObject: vi.fn(async () => true),
    releaseTerminalLease: vi.fn(async () => true),
    audit: vi.fn(async () => {})
  }
  const acceptEnvelope = vi.fn(async () => ({
    status: 'accepted' as const,
    leadId: '77777777-7777-4777-8777-777777777777'
  }))
  return {
    bucket,
    repository,
    acceptEnvelope,
    dependencies: {
      bucket,
      encryptionSecret: SECRET,
      repository,
      acceptEnvelope,
      ai: null,
      nowMs: () => Date.parse('2026-07-29T01:00:00.000Z'),
      ...overrides
    }
  }
}

describe('email recovery claims', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async callback => callback({ query: mocks.query }))
  })

  it('atomically claims one due ingestion with skip-locked ownership', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [claimedRow] })

    await expect(claimNextEmailRecovery(LEASE_TOKEN)).resolves.toEqual(claimedRow)

    const [sql, params] = mocks.query.mock.calls[0]!
    expect(sql).toMatch(/FOR UPDATE OF i SKIP LOCKED/)
    expect(sql).toMatch(/recovery_lease_token = \$1::uuid/)
    expect(sql).toMatch(/recovery_claimed_at = NOW\(\)/)
    expect(sql).toMatch(/next_attempt_at = NOW\(\) \+ MAKE_INTERVAL/)
    expect(sql).toMatch(/recovery_claimed_at <= NOW\(\) - MAKE_INTERVAL/)
    expect(sql).toMatch(
      /staged_expires_at > clock_timestamp\(\)\s*\+\s*MAKE_INTERVAL\(secs => \$3::int\)/
    )
    expect(sql).not.toMatch(/staged_uploaded_at IS NOT NULL/)
    expect(params).toEqual([LEASE_TOKEN, 300, 30])
    expect(sql).toMatch(/JOIN agency_clients/)
    expect(sql).toMatch(/lead_capture_mode/)
  })

  it('does not install a recovery lease with less than the canonical safety window remaining', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] })

    await expect(claimNextEmailRecovery(LEASE_TOKEN)).resolves.toBeNull()

    const [sql, params] = mocks.query.mock.calls[0]!
    expect(sql).toMatch(
      /staged_expires_at > clock_timestamp\(\)\s*\+\s*MAKE_INTERVAL\(secs => \$3::int\)/
    )
    expect(params).toEqual([LEASE_TOKEN, 300, 30])
  })

  it('reschedules missing unconfirmed evidence without consuming a canonical attempt', async () => {
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce(null)
    await expect(processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, staged_uploaded_at: null, attempt_count: 0 },
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'rescheduled' })
    expect(harness.repository.reschedule).toHaveBeenCalledWith(
      claimedRow.id,
      LEASE_TOKEN,
      300,
      'missing_evidence'
    )
    expect(harness.repository.quarantine).not.toHaveBeenCalled()
    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('returns a row to only one of two concurrent claimers', async () => {
    let available = true
    mocks.query.mockImplementation(async () => {
      if (!available) return { rows: [] }
      available = false
      await Promise.resolve()
      return { rows: [claimedRow] }
    })

    const claims = await Promise.all([
      claimNextEmailRecovery(LEASE_TOKEN),
      claimNextEmailRecovery('66666666-6666-4666-8666-666666666666')
    ])

    expect(claims.filter(Boolean)).toEqual([claimedRow])
  })

  it('claims expired or exhausted rows independently of their retry schedule', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{
        ...claimedRow,
        attempt_count: 5,
        staged_expires_at: '2026-07-28T00:00:00.000Z'
      }]
    })

    await expect(claimNextEmailTerminalReconciliation(LEASE_TOKEN)).resolves.toMatchObject({
      id: INGESTION_ID,
      attempt_count: 5
    })

    const [sql] = mocks.query.mock.calls[0]!
    expect(sql).toMatch(/FOR UPDATE OF i SKIP LOCKED/)
    expect(sql).toMatch(/i\.attempt_count >= 5/)
    expect(sql).toMatch(/i\.staged_expires_at IS NULL/)
    expect(sql).toMatch(/i\.staged_expires_at <= NOW\(\)/)
    expect(sql).not.toMatch(/i\.next_attempt_at <= NOW\(\)/)
    expect(sql).toMatch(/recovery_claimed_at <= NOW\(\) - MAKE_INTERVAL/)
  })

  it('reclaims stale terminal cleanup ownership after a crash-before-delete', async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: INGESTION_ID,
        staged_object_key: claimedRow.staged_object_key
      }]
    })

    await expect(claimNextTerminalEmailObject(LEASE_TOKEN)).resolves.toEqual({
      id: INGESTION_ID,
      staged_object_key: claimedRow.staged_object_key
    })

    const [sql, params] = mocks.query.mock.calls[0]!
    expect(sql).toMatch(/status IN \('accepted', 'duplicate'\)/)
    expect(sql).toMatch(
      /status IN \('quarantined', 'failed'\)[\s\S]*staged_expires_at IS NULL[\s\S]*staged_expires_at <= NOW\(\)/
    )
    expect(sql).toMatch(/recovery_claimed_at <= NOW\(\) - MAKE_INTERVAL/)
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/)
    expect(params).toEqual([LEASE_TOKEN, 300])
  })
})

describe('email recovery processing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('quarantines a reservation whose staged object is missing', async () => {
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce(null)

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'missing_evidence' })

    expect(harness.repository.quarantine).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN,
      'missing_evidence',
      true
    )
    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('recovers staged evidence through the canonical boundary with the original identity', async () => {
    const harness = recoveryHarness()

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'accepted' })

    const envelope = harness.acceptEnvelope.mock.calls[0]?.[2]
    expect(envelope).toMatchObject({
      ingestionId: INGESTION_ID,
      correlationId: claimedRow.correlation_id,
      externalIdHash: claimedRow.external_id_hash,
      messageIdHash: claimedRow.message_id_hash,
      recipientToken: claimedRow.address_token,
      extraction: {
        externalIdHash: claimedRow.external_id_hash
      }
    })
    expect(harness.acceptEnvelope.mock.calls[0]?.[3]).toMatchObject({
      recoveryLeaseToken: LEASE_TOKEN,
      recoveryAudit: {
        actorId: null,
        actorType: 'cron',
        action: 'recovery_completed'
      }
    })
    expect(harness.bucket.delete).toHaveBeenCalledWith(claimedRow.staged_object_key)
    expect(harness.repository.clearTerminalObject).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN
    )
  })

  it('preserves an unlabelled direct-customer envelope sender through recovery', async () => {
    const directRaw = new TextEncoder().encode([
      'From: Alex Example <alex@example.test>',
      'Subject: Website enquiry',
      'Message-ID: <direct-42@example.test>',
      '',
      'Hello, I am Alex Example. Phone: +61 400 123 456. I am interested in stock STK-7.',
      'Kind regards,',
      'Alex Example'
    ].join('\r\n'))
    const directClaim = {
      ...claimedRow,
      provider: 'generic',
      expected_provider: null,
      sender_domain: 'example.test',
      header_from_domain: 'example.test',
      allowed_sender_domains: [],
      external_id_hash: '6334c7c005476eb3167e3c14b2d299f53d060188b8b681a92767f7b0e28777e1',
      message_id_hash: '6334c7c005476eb3167e3c14b2d299f53d060188b8b681a92767f7b0e28777e1',
      raw_content_hash: '78f0f26a42ad8ce84828b8cbd6dd5eb4e1dc5d67909d4138f7d4f77b0e24412f',
      raw_size: directRaw.byteLength
    }
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          directRaw,
          'alex@example.test',
          SECRET,
          manifestFor(directClaim)
        )
      ).buffer
    })

    await processEmailRecoveryClaim(
      {} as never,
      directClaim,
      LEASE_TOKEN,
      harness.dependencies
    )

    expect(harness.acceptEnvelope.mock.calls[0]?.[2]).toMatchObject({
      extraction: {
        fields: {
          email: { value: 'alex@example.test' }
        }
      }
    })
  })

  it('fails legacy raw-only ciphertext closed for deterministic review', async () => {
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (await encryptRawEmail(RAW, SECRET)).buffer
    })

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'legacy_evidence' })
    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
    expect(harness.bucket.delete).not.toHaveBeenCalled()
    expect(harness.repository.quarantine).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN,
      'legacy_evidence',
      false
    )
  })

  it('records exactly one canonical completion audit for a quarantined attempt', async () => {
    const harness = recoveryHarness()
    harness.acceptEnvelope.mockImplementationOnce(async () => {
      await harness.repository.audit({
        ingestionId: INGESTION_ID,
        endpointId: ENDPOINT_ID,
        clientId: CLIENT_ID,
        actorId: null,
        actorType: 'cron',
        action: 'recovery_completed',
        outcome: 'quarantined'
      })
      return { status: 'quarantined' }
    })

    await processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )

    const completions = harness.repository.audit.mock.calls
      .map(([event]) => event)
      .filter(event => event.action === 'recovery_completed')
    expect(completions).toHaveLength(1)
    expect(harness.repository.releaseTerminalLease).not.toHaveBeenCalled()
  })

  it('atomically releases an owned in-progress claim for immediate terminal reconciliation', async () => {
    const releaseCanonicalWindow = vi.fn(async () => 'rescheduled' as const)
    const harness = recoveryHarness({
      repository: {
        ...recoveryHarness().repository,
        releaseCanonicalWindow
      }
    })
    harness.acceptEnvelope.mockResolvedValueOnce({ status: 'in_progress' })

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'rescheduled' })

    expect(releaseCanonicalWindow).toHaveBeenCalledWith(expect.objectContaining({
      ingestionId: INGESTION_ID,
      leaseToken: LEASE_TOKEN,
      actorId: null,
      actorType: 'cron',
      completionAction: 'recovery_completed'
    }))
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('terminalizes an exhausted in-progress claim with one completion audit and retains R2', async () => {
    const releaseCanonicalWindow = vi.fn(async () => 'quarantined' as const)
    const harness = recoveryHarness({
      repository: {
        ...recoveryHarness().repository,
        releaseCanonicalWindow
      }
    })
    harness.acceptEnvelope.mockResolvedValueOnce({ status: 'in_progress' })

    await expect(processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, attempt_count: 4 },
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'attempts_exhausted' })

    expect(releaseCanonicalWindow).toHaveBeenCalledWith(expect.objectContaining({
      ingestionId: INGESTION_ID,
      leaseToken: LEASE_TOKEN,
      actorId: null,
      actorType: 'cron',
      completionAction: 'recovery_completed'
    }))
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('uses the manual completion action when a replay exhausts during its canonical window', async () => {
    const releaseCanonicalWindow = vi.fn(async () => 'quarantined' as const)
    const harness = recoveryHarness({
      auditActor: {
        actorId: '88888888-8888-4888-8888-888888888888',
        actorType: 'team_member'
      },
      repository: {
        ...recoveryHarness().repository,
        releaseCanonicalWindow
      }
    })
    harness.acceptEnvelope.mockResolvedValueOnce({ status: 'in_progress' })

    await processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, attempt_count: 4 },
      LEASE_TOKEN,
      harness.dependencies
    )

    expect(releaseCanonicalWindow).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'team_member',
      completionAction: 'manual_replay_completed'
    }))
  })

  it('uses lifecycle-valid terminal SQL when the database count reached five', async () => {
    const harness = recoveryHarness()
    harness.acceptEnvelope.mockResolvedValueOnce({ status: 'in_progress' })
    const lifecycleQueries = vi.fn(async (sql: string) => ({
      rows: sql.includes('UPDATE lead_email_ingestions')
        ? [{
            id: INGESTION_ID,
            endpoint_id: ENDPOINT_ID,
            client_id: CLIENT_ID,
            status: 'quarantined',
            error_class: 'attempts_exhausted'
          }]
        : sql.includes('UPDATE lead_email_endpoints')
          ? [{ id: ENDPOINT_ID }]
          : []
    }))
    mocks.transaction.mockImplementationOnce(async callback => callback({
      query: lifecycleQueries
    }))
    const terminalRepository = {
      claimTerminalObject: vi.fn(async () => null),
      clearTerminalObject: vi.fn(async () => false),
      audit: vi.fn(async () => {})
    }

    await expect(recoverEmailIngestions(
      {} as never,
      { bucket: harness.bucket, encryptionSecret: SECRET, ai: null },
      {
        limit: 1,
        claimTerminal: vi.fn(async () => null),
        claimRecovery: vi.fn()
          .mockResolvedValueOnce({ ...claimedRow, attempt_count: 4 })
          .mockResolvedValueOnce(null),
        acceptEnvelope: harness.acceptEnvelope,
        terminalRepository,
        randomUUID: () => LEASE_TOKEN,
        nowMs: harness.dependencies.nowMs
      }
    )).resolves.toMatchObject({ quarantined: 1, failed: 0 })

    expect(lifecycleQueries.mock.calls[0]?.[0]).toMatch(
      /status = CASE[\s\S]*attempt_count >= 5 THEN 'quarantined'[\s\S]*terminal_at = CASE[\s\S]*next_attempt_at = CASE[\s\S]*recovery_lease_token = NULL/
    )
    expect(lifecycleQueries.mock.calls[0]?.[0]).toMatch(/attempt_count >= 5/)
    expect(lifecycleQueries.mock.calls[1]?.[0]).toMatch(
      /lead_email_endpoints[\s\S]*consecutive_failures = consecutive_failures \+ 1/
    )
    expect(lifecycleQueries.mock.calls[2]?.[0]).toMatch(/lead_email_ingestion_audits/)
    expect(lifecycleQueries.mock.calls[2]?.[1]).toEqual([
      INGESTION_ID,
      ENDPOINT_ID,
      CLIENT_ID,
      null,
      'cron',
      'recovery_completed',
      'quarantined',
      'attempts_exhausted'
    ])
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('atomically increments endpoint health for a recovery quarantine', async () => {
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce(null)
    const transitionQueries = vi.fn(async (sql: string) => ({
      rows: sql.includes('UPDATE lead_email_ingestions')
        ? [{ id: INGESTION_ID, endpoint_id: ENDPOINT_ID, client_id: CLIENT_ID }]
        : sql.includes('UPDATE lead_email_endpoints')
          ? [{ id: ENDPOINT_ID }]
          : []
    }))
    mocks.transaction.mockImplementationOnce(async callback => callback({
      query: transitionQueries
    }))
    const terminalRepository = {
      claimTerminalObject: vi.fn(async () => null),
      clearTerminalObject: vi.fn(async () => false),
      audit: vi.fn(async () => {})
    }

    await expect(recoverEmailIngestions(
      {} as never,
      { bucket: harness.bucket, encryptionSecret: SECRET, ai: null },
      {
        limit: 1,
        claimTerminal: vi.fn(async () => null),
        claimRecovery: vi.fn()
          .mockResolvedValueOnce(claimedRow)
          .mockResolvedValueOnce(null),
        acceptEnvelope: harness.acceptEnvelope,
        terminalRepository,
        randomUUID: () => LEASE_TOKEN,
        nowMs: harness.dependencies.nowMs
      }
    )).resolves.toMatchObject({ quarantined: 1, failed: 0 })

    expect(transitionQueries.mock.calls[0]?.[0]).toMatch(/UPDATE lead_email_ingestions/)
    expect(transitionQueries.mock.calls[1]?.[0]).toMatch(
      /UPDATE lead_email_endpoints[\s\S]*consecutive_failures = consecutive_failures \+ 1/
    )
    expect(transitionQueries.mock.calls[2]?.[0]).toMatch(/lead_email_ingestion_audits/)
  })

  it('atomically reschedules when notReady occurred before the database count reached five', async () => {
    const harness = recoveryHarness()
    harness.acceptEnvelope.mockResolvedValueOnce({ status: 'in_progress' })
    const lifecycleQueries = vi.fn(async (sql: string) => ({
      rows: sql.includes('UPDATE lead_email_ingestions')
        ? [{
            id: INGESTION_ID,
            endpoint_id: ENDPOINT_ID,
            client_id: CLIENT_ID,
            status: 'failed',
            error_class: 'canonical_window_elapsed'
          }]
        : []
    }))
    mocks.transaction.mockImplementationOnce(async callback => callback({
      query: lifecycleQueries
    }))
    const terminalRepository = {
      claimTerminalObject: vi.fn(async () => null),
      clearTerminalObject: vi.fn(async () => false),
      audit: vi.fn(async () => {})
    }

    await expect(recoverEmailIngestions(
      {} as never,
      { bucket: harness.bucket, encryptionSecret: SECRET, ai: null },
      {
        limit: 1,
        claimTerminal: vi.fn(async () => null),
        claimRecovery: vi.fn()
          .mockResolvedValueOnce({ ...claimedRow, attempt_count: 4 })
          .mockResolvedValueOnce(null),
        acceptEnvelope: harness.acceptEnvelope,
        terminalRepository,
        randomUUID: () => LEASE_TOKEN,
        nowMs: harness.dependencies.nowMs
      }
    )).resolves.toMatchObject({ rescheduled: 1, failed: 0 })

    expect(lifecycleQueries.mock.calls[0]?.[0]).toMatch(
      /error_class = CASE[\s\S]*canonical_window_elapsed[\s\S]*recovery_lease_token = NULL/
    )
    expect(lifecycleQueries.mock.calls[1]?.[1]).toEqual([
      INGESTION_ID,
      ENDPOINT_ID,
      CLIENT_ID,
      null,
      'cron',
      'recovery_rescheduled',
      'rescheduled',
      'canonical_window_elapsed'
    ])
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('cannot release an in-progress claim after ownership was lost', async () => {
    const releaseCanonicalWindow = vi.fn(async () => null)
    const harness = recoveryHarness({
      repository: {
        ...recoveryHarness().repository,
        releaseCanonicalWindow
      }
    })
    harness.acceptEnvelope.mockResolvedValueOnce({ status: 'in_progress' })

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'lease_lost' })

    expect(releaseCanonicalWindow).toHaveBeenCalledOnce()
    expect(harness.bucket.delete).not.toHaveBeenCalled()
  })

  it('rolls back the transient recovery state when its audit insert fails', async () => {
    const harness = recoveryHarness()
    harness.acceptEnvelope.mockRejectedValueOnce(new Error('canonical unavailable'))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    let persistedStatus = 'received'
    const before = persistedStatus
    mocks.transaction.mockImplementationOnce(async (callback) => {
      try {
        return await callback({
          query: vi.fn(async (sql: string) => {
            if (sql.includes('UPDATE lead_email_ingestions')) {
              persistedStatus = 'failed'
              return { rows: [{ id: INGESTION_ID }] }
            }
            throw new Error('audit unavailable')
          })
        })
      } catch (error) {
        persistedStatus = before
        throw error
      }
    })
    const terminalRepository = {
      claimTerminalObject: vi.fn(async () => null),
      clearTerminalObject: vi.fn(async () => false),
      audit: vi.fn(async () => {})
    }

    await expect(recoverEmailIngestions(
      {} as never,
      { bucket: harness.bucket, encryptionSecret: SECRET, ai: null },
      {
        limit: 1,
        claimTerminal: vi.fn(async () => null),
        claimRecovery: vi.fn()
          .mockResolvedValueOnce(claimedRow)
          .mockResolvedValueOnce(null),
        acceptEnvelope: harness.acceptEnvelope,
        terminalRepository,
        randomUUID: () => LEASE_TOKEN,
        nowMs: harness.dependencies.nowMs
      }
    )).resolves.toMatchObject({ failed: 1 })
    expect(persistedStatus).toBe('received')
    expect(log).toHaveBeenCalledWith(expect.stringContaining(
      '"errorClass":"recovery_transition_failed"'
    ))
  })

  it('uses bounded exponential backoff after a transient canonical failure', async () => {
    const harness = recoveryHarness()
    harness.acceptEnvelope.mockRejectedValueOnce(new Error('Nitro unavailable'))

    await expect(processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, attempt_count: 2 },
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'rescheduled' })

    expect(harness.repository.reschedule).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN,
      240,
      'canonical_transient'
    )
  })

  it('rechecks endpoint availability before reading staged evidence', async () => {
    const harness = recoveryHarness()

    await expect(processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, endpoint_enabled: false },
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'endpoint_unavailable' })

    expect(harness.bucket.get).not.toHaveBeenCalled()
    expect(harness.repository.quarantine).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN,
      'endpoint_unavailable',
      false
    )
  })

  it('quarantines analytics-only recovery before reading staged evidence', async () => {
    const harness = recoveryHarness()

    await expect(processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, lead_capture_mode: 'analytics_only' },
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({
      status: 'quarantined',
      reason: 'capture_mode_ineligible'
    })

    expect(harness.bucket.get).not.toHaveBeenCalled()
    expect(harness.repository.quarantine).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN,
      'capture_mode_ineligible',
      false
    )
  })

  it('invokes AI recovery only with current privacy approval and a runtime binding', async () => {
    const ai = {
      run: vi.fn(async () => ({ response: '{}' }))
    }
    const harness = recoveryHarness({ ai })
    const aiNeededRaw = new TextEncoder().encode([
      'From: Carsales <relay@carsales.com.au>',
      'Subject: New Carsales lead',
      'Message-ID: <lead-42@example.test>',
      '',
      'Lead ID: provider-42',
      'A customer submitted an enquiry.'
    ].join('\r\n'))
    const claim = {
      ...claimedRow,
      raw_content_hash: hashBytes(aiNeededRaw),
      raw_size: aiNeededRaw.byteLength,
      ai_extraction_mode: 'fallback' as const,
      ai_privacy_approval_version: 1,
      ai_privacy_approved_at: '2026-07-29T00:00:00.000Z',
      ai_privacy_approved_by: '88888888-8888-4888-8888-888888888888'
    }
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          aiNeededRaw,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(claim)
        )
      ).buffer
    })

    await processEmailRecoveryClaim(
      {} as never,
      claim,
      LEASE_TOKEN,
      harness.dependencies
    )

    expect(ai.run).toHaveBeenCalledOnce()
  })

  it('fails closed during recovery when an AI privacy approval is missing', async () => {
    const ai = {
      run: vi.fn(async () => ({ response: '{}' }))
    }
    const harness = recoveryHarness({ ai })
    const aiNeededRaw = new TextEncoder().encode([
      'From: Carsales <relay@carsales.com.au>',
      'Subject: New Carsales lead',
      'Message-ID: <lead-42@example.test>',
      '',
      'Lead ID: provider-42',
      'A customer submitted an enquiry.'
    ].join('\r\n'))
    const claim = {
      ...claimedRow,
      raw_content_hash: hashBytes(aiNeededRaw),
      raw_size: aiNeededRaw.byteLength,
      ai_extraction_mode: 'fallback' as const,
      ai_privacy_approval_version: null,
      ai_privacy_approved_at: null,
      ai_privacy_approved_by: null
    }
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          aiNeededRaw,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(claim)
        )
      ).buffer
    })

    await processEmailRecoveryClaim(
      {} as never,
      claim,
      LEASE_TOKEN,
      harness.dependencies
    )

    expect(ai.run).not.toHaveBeenCalled()
  })

  it('fails closed when the canonical attempt limit is exhausted', async () => {
    const harness = recoveryHarness()

    await expect(processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, attempt_count: 5 },
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'attempts_exhausted' })

    expect(harness.bucket.get).not.toHaveBeenCalled()
    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('expires seven-day evidence and removes the staged object', async () => {
    const harness = recoveryHarness()

    await expect(processEmailRecoveryClaim(
      {} as never,
      { ...claimedRow, staged_expires_at: '2026-07-29T00:59:59.000Z' },
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'evidence_expired' })

    expect(harness.bucket.get).not.toHaveBeenCalled()
    expect(harness.bucket.delete).toHaveBeenCalledWith(claimedRow.staged_object_key)
    expect(harness.repository.quarantine).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN,
      'evidence_expired',
      true
    )
  })

  it('quarantines corrupt authenticated ciphertext without canonical handoff', async () => {
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer
    })

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'corrupt_evidence' })

    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('rejects evidence whose authenticated manifest does not match the reservation', async () => {
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          RAW,
          'relay@carsales.com.au',
          SECRET,
          { ...manifestFor(claimedRow), provider: 'meta' }
        )
      ).buffer
    })

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'corrupt_evidence' })

    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('rejects staged bytes that do not match the reserved raw-content digest', async () => {
    const replacement = new TextEncoder().encode(
      new TextDecoder().decode(RAW).replace('Alex Example', 'Jamie Example')
    )
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          replacement,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(claimedRow)
        )
      ).buffer
    })

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'content_mismatch' })

    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('terminally quarantines deterministic parser failures during recovery', async () => {
    const malformed = new TextEncoder().encode([
      'From: Carsales <relay@carsales.com.au>',
      'Subject: New Carsales lead',
      'Message-ID: <malformed-recovery@example.test>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '<adf><prospect>&prohibited;</prospect></adf>'
    ].join('\r\n'))
    const malformedMessageIdHash = createHash('sha256')
      .update('message-id:v1:malformed-recovery@example.test')
      .digest('hex')
    const malformedClaim = {
      ...claimedRow,
      external_id_hash: malformedMessageIdHash,
      message_id_hash: malformedMessageIdHash,
      raw_content_hash: hashBytes(malformed),
      raw_size: malformed.byteLength,
      safe_evidence: {
        hasText: true,
        hasHtml: false,
        hasAdf: true,
        fieldKeys: []
      }
    }
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          malformed,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(malformedClaim)
        )
      ).buffer
    })

    await expect(processEmailRecoveryClaim(
      {} as never,
      malformedClaim,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'parse_failed' })

    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
    expect(harness.repository.quarantine).toHaveBeenCalledWith(
      INGESTION_ID,
      LEASE_TOKEN,
      'parse_failed',
      false
    )
  })

  it('never overwrites a parsed replacement identity with the reserved identity', async () => {
    const replacement = new TextEncoder().encode(
      new TextDecoder().decode(RAW).replace('provider-42', 'provider-99')
    )
    const replacementClaim = {
      ...claimedRow,
      raw_content_hash: hashBytes(replacement),
      raw_size: replacement.byteLength
    }
    const harness = recoveryHarness()
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          replacement,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(replacementClaim)
        )
      ).buffer
    })

    await expect(processEmailRecoveryClaim(
      {} as never,
      replacementClaim,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'identity_mismatch' })

    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('rechecks sender restrictions from decrypted MIME', async () => {
    const harness = recoveryHarness()
    const deniedRaw = new TextEncoder().encode(
      new TextDecoder().decode(RAW).replace('relay@carsales.com.au', 'relay@evil.example')
    )
    const deniedClaim = {
      ...claimedRow,
      raw_content_hash: hashBytes(deniedRaw),
      raw_size: deniedRaw.byteLength
    }
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          deniedRaw,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(deniedClaim)
        )
      ).buffer
    })

    await expect(processEmailRecoveryClaim(
      {} as never,
      deniedClaim,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'quarantined', reason: 'sender_policy_denied' })

    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('does not clear the database object key when R2 deletion fails', async () => {
    const harness = recoveryHarness()
    harness.bucket.delete.mockRejectedValueOnce(new Error('R2 unavailable'))

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).rejects.toThrow('R2 unavailable')

    expect(harness.repository.clearTerminalObject).not.toHaveBeenCalled()
  })

  it('treats canonical duplicate recovery as terminal and idempotently removes evidence', async () => {
    const harness = recoveryHarness()
    harness.acceptEnvelope.mockResolvedValueOnce({ status: 'duplicate' })

    await expect(processEmailRecoveryClaim(
      {} as never,
      claimedRow,
      LEASE_TOKEN,
      harness.dependencies
    )).resolves.toEqual({ status: 'duplicate' })

    expect(harness.bucket.delete).toHaveBeenCalledOnce()
    expect(harness.repository.clearTerminalObject).toHaveBeenCalledOnce()
  })

  it('retries residual accepted evidence cleanup after a crash-before-delete', async () => {
    const harness = recoveryHarness()
    const candidate = {
      id: INGESTION_ID,
      staged_object_key: claimedRow.staged_object_key
    }
    const cleanupRepository = {
      claimTerminalObject: vi.fn()
        .mockResolvedValueOnce(candidate)
        .mockResolvedValueOnce(candidate)
        .mockResolvedValueOnce(null),
      clearTerminalObject: vi.fn()
        .mockRejectedValueOnce(new Error('database unavailable'))
        .mockResolvedValueOnce(true),
      audit: vi.fn(async () => {})
    }

    await expect(cleanupTerminalEmailEvidence({
      bucket: harness.bucket,
      repository: cleanupRepository,
      randomUUID: () => LEASE_TOKEN,
      limit: 1
    })).rejects.toThrow('database unavailable')

    await expect(cleanupTerminalEmailEvidence({
      bucket: harness.bucket,
      repository: cleanupRepository,
      randomUUID: () => LEASE_TOKEN,
      limit: 1
    })).resolves.toEqual({ cleaned: 1 })

    expect(harness.bucket.delete).toHaveBeenCalledTimes(2)
  })

  it('deletes NULL-expiry terminal evidence and atomically clears its key with one audit', async () => {
    const harness = recoveryHarness()
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: INGESTION_ID,
        staged_object_key: claimedRow.staged_object_key
      }]
    }).mockResolvedValueOnce({
      rows: [{
        id: INGESTION_ID,
        endpoint_id: ENDPOINT_ID,
        client_id: CLIENT_ID
      }]
    }).mockResolvedValueOnce({ rows: [] })

    await expect(recoverEmailIngestions(
      {} as never,
      { bucket: harness.bucket, encryptionSecret: SECRET, ai: null },
      {
        limit: 1,
        claimTerminal: vi.fn(async () => null),
        claimRecovery: vi.fn(async () => null),
        randomUUID: () => LEASE_TOKEN,
        nowMs: harness.dependencies.nowMs
      }
    )).resolves.toMatchObject({ cleaned: 1, failed: 0 })

    expect(harness.bucket.delete).toHaveBeenCalledWith(claimedRow.staged_object_key)
    expect(mocks.query.mock.calls[0]?.[0]).toMatch(
      /status IN \('quarantined', 'failed'\)[\s\S]*staged_expires_at IS NULL/
    )
    expect(mocks.query.mock.calls[1]?.[0]).toMatch(
      /staged_object_key = NULL[\s\S]*staged_expires_at IS NULL/
    )
    expect(mocks.query.mock.calls[2]?.[0]).toMatch(/terminal_cleanup/)
  })

  it('audits the actor and reuses the same endpoint/client/identity for manual replay', async () => {
    const harness = recoveryHarness({
      auditActor: {
        actorId: '88888888-8888-4888-8888-888888888888',
        actorType: 'team_member'
      }
    })
    const claimReplay = vi.fn(async () => ({
      outcome: 'claimed' as const,
      claim: claimedRow,
      leaseToken: LEASE_TOKEN
    }))

    await expect(replayEmailIngestion(
      {} as never,
      INGESTION_ID,
      '88888888-8888-4888-8888-888888888888',
      { ...harness.dependencies, claimReplay, randomUUID: () => LEASE_TOKEN }
    )).resolves.toEqual({ status: 'accepted' })

    expect(claimReplay).toHaveBeenCalledWith(
      INGESTION_ID,
      '88888888-8888-4888-8888-888888888888',
      LEASE_TOKEN
    )
    expect(harness.acceptEnvelope.mock.calls[0]?.[2]).toMatchObject({
      ingestionId: INGESTION_ID,
      externalIdHash: claimedRow.external_id_hash
    })
    expect(harness.repository.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: '88888888-8888-4888-8888-888888888888',
      actorType: 'team_member',
      ingestionId: INGESTION_ID,
      endpointId: ENDPOINT_ID,
      clientId: CLIENT_ID
    }))
  })

  it('fails a concurrent manual replay closed without reading R2', async () => {
    const harness = recoveryHarness()
    const claimReplay = vi.fn(async () => ({
      outcome: 'rejected' as const,
      reason: 'lease_lost' as const
    }))

    await expect(replayEmailIngestion(
      {} as never,
      INGESTION_ID,
      '88888888-8888-4888-8888-888888888888',
      { ...harness.dependencies, claimReplay, randomUUID: () => LEASE_TOKEN }
    )).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'email_replay_in_progress'
    })

    expect(harness.bucket.get).not.toHaveBeenCalled()
    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('does not install a manual replay lease inside the canonical safety window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-07-29T01:00:00.000Z')
    try {
      const harness = recoveryHarness()
      mocks.query.mockResolvedValueOnce({
        rows: [{
          ...claimedRow,
          status: 'quarantined',
          terminal_at: '2026-07-29T00:30:00.000Z',
          recovery_lease_token: null,
          recovery_claimed_at: null,
          staged_expires_at: '2026-07-29T01:00:20.000Z',
          staged_ready: false
        }]
      }).mockResolvedValueOnce({ rows: [] })

      await expect(replayEmailIngestion(
        {} as never,
        INGESTION_ID,
        '88888888-8888-4888-8888-888888888888',
        { ...harness.dependencies, randomUUID: () => LEASE_TOKEN }
      )).rejects.toMatchObject({
        statusCode: 409,
        statusMessage: 'email_replay_evidence_expired'
      })

      expect(mocks.query.mock.calls.some(([sql]) => (
        String(sql).includes('SET status = \'failed\'')
      ))).toBe(false)
      expect(mocks.query.mock.calls[0]?.[0]).toMatch(
        /staged_expires_at > clock_timestamp\(\)[\s\S]*MAKE_INTERVAL\(secs => \$3::int\) AS staged_ready/
      )
      expect(harness.bucket.get).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cannot install a manual lease when the database safety-window CAS loses the race', async () => {
    const harness = recoveryHarness()
    mocks.query.mockResolvedValueOnce({
      rows: [{
        ...claimedRow,
        status: 'quarantined',
        terminal_at: '2026-07-29T00:30:00.000Z',
        recovery_lease_token: null,
        recovery_claimed_at: null,
        staged_ready: true
      }]
    }).mockResolvedValueOnce({ rows: [] })

    await expect(replayEmailIngestion(
      {} as never,
      INGESTION_ID,
      '88888888-8888-4888-8888-888888888888',
      { ...harness.dependencies, randomUUID: () => LEASE_TOKEN }
    )).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'email_replay_in_progress'
    })

    expect(mocks.query.mock.calls[1]?.[0]).toMatch(
      /staged_expires_at > clock_timestamp\(\)[\s\S]*MAKE_INTERVAL\(secs => \$5::int\)/
    )
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([
      INGESTION_ID,
      CLIENT_ID,
      LEASE_TOKEN,
      300,
      30
    ])
    expect(harness.bucket.get).not.toHaveBeenCalled()
  })

  it('trusts route-level ADMIN permission while requiring an active replay actor', async () => {
    const harness = recoveryHarness()
    mocks.query.mockResolvedValueOnce({ rows: [] })
    await expect(replayEmailIngestion(
      {} as never,
      INGESTION_ID,
      '88888888-8888-4888-8888-888888888888',
      { ...harness.dependencies, randomUUID: () => LEASE_TOKEN }
    )).rejects.toMatchObject({ statusCode: 409 })
    const sql = mocks.query.mock.calls[0]?.[0] as string
    expect(sql).toMatch(/tm\.is_active = TRUE/)
    expect(sql).not.toMatch(/tm\.user_role IN/)
  })

  it.each([
    [
      'disabled endpoint',
      { endpoint_enabled: false },
      'email_replay_endpoint_unavailable'
    ],
    [
      'analytics-only client',
      { lead_capture_mode: 'analytics_only' },
      'email_replay_capture_mode_ineligible'
    ],
    [
      'expired evidence',
      { staged_expires_at: '2026-07-28T00:00:00.000Z', staged_ready: false },
      'email_replay_evidence_expired'
    ],
    [
      'missing evidence',
      { staged_object_key: null },
      'email_replay_missing_evidence'
    ]
  ])('rejects manual replay with audited safe reason for %s', async (
    _case,
    overrides,
    statusMessage
  ) => {
    const harness = recoveryHarness()
    mocks.query.mockResolvedValueOnce({
      rows: [{
        ...claimedRow,
        status: 'quarantined',
        terminal_at: '2026-07-29T00:30:00.000Z',
        staged_ready: true,
        ...overrides
      }]
    }).mockResolvedValueOnce({ rows: [] })

    await expect(replayEmailIngestion(
      {} as never,
      INGESTION_ID,
      '88888888-8888-4888-8888-888888888888',
      { ...harness.dependencies, randomUUID: () => LEASE_TOKEN }
    )).rejects.toMatchObject({ statusCode: 409, statusMessage })

    expect(mocks.query.mock.calls[1]?.[0]).toMatch(/manual_replay_rejected/)
    expect(harness.bucket.get).not.toHaveBeenCalled()
    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
  })

  it('rechecks decrypted sender restrictions during manual replay', async () => {
    const harness = recoveryHarness()
    const deniedRaw = new TextEncoder().encode(
      new TextDecoder().decode(RAW).replace('relay@carsales.com.au', 'relay@evil.example')
    )
    const deniedClaim = {
      ...claimedRow,
      raw_content_hash: hashBytes(deniedRaw),
      raw_size: deniedRaw.byteLength
    }
    harness.bucket.get.mockResolvedValueOnce({
      arrayBuffer: async () => (
        await encryptStagedEmail(
          deniedRaw,
          'relay@carsales.com.au',
          SECRET,
          manifestFor(deniedClaim)
        )
      ).buffer
    })
    await expect(replayEmailIngestion(
      {} as never,
      INGESTION_ID,
      '88888888-8888-4888-8888-888888888888',
      {
        ...harness.dependencies,
        claimReplay: vi.fn(async () => ({
          outcome: 'claimed' as const,
          claim: deniedClaim,
          leaseToken: LEASE_TOKEN
        })),
        randomUUID: () => LEASE_TOKEN
      }
    )).resolves.toEqual({
      status: 'quarantined',
      reason: 'sender_policy_denied'
    })

    expect(harness.acceptEnvelope).not.toHaveBeenCalled()
    expect(harness.repository.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'team_member',
      action: 'manual_replay_rejected',
      reason: 'sender_policy_denied'
    }))
  })
})
