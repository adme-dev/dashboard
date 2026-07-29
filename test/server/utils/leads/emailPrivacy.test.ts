import { describe, expect, it, vi } from 'vitest'

import {
  EMAIL_INGESTION_EVENT_NAMES,
  emitEmailIngestionEvent
} from '../../../../shared/leads/email/telemetry'
import worker from '../../../../workers/email-lead-intake/src/index'
import { reconcileEmailHealthRows } from '../../../../server/utils/leads/emailHealth'

const CANARIES = [
  'Privacy Canary Person',
  'Canary subject 987',
  'privacy-canary@example.test',
  '+61 499 123 987',
  'A uniquely private body sentence',
  '<strong>uniquely private html</strong>',
  'private-attachment-name.pdf',
  'private attachment bytes',
  'sender-mailbox@example.test',
  'relay-identifier.example.test'
]

describe('email ingestion privacy telemetry', () => {
  it('defines the complete bounded operational event vocabulary', () => {
    expect(EMAIL_INGESTION_EVENT_NAMES).toEqual(expect.arrayContaining([
      'email_ingestion_receipt',
      'email_ingestion_policy',
      'email_ingestion_stage_reservation',
      'email_ingestion_r2_write',
      'email_ingestion_r2_delete',
      'email_ingestion_parse',
      'email_ingestion_ai',
      'email_ingestion_canonical',
      'email_ingestion_transport_duplicate',
      'email_ingestion_possible_duplicate',
      'email_ingestion_recovery_claim',
      'email_ingestion_recovery_outcome',
      'email_ingestion_quarantine',
      'email_ingestion_replay',
      'email_ingestion_failure'
    ]))
  })

  it('drops arbitrary content and caught error messages from structured output', () => {
    const write = vi.fn()
    emitEmailIngestionEvent({
      event: 'email_ingestion_failure',
      correlationId: '00000000-0000-4000-8000-000000000001',
      endpointId: '00000000-0000-4000-8000-000000000002',
      clientId: '00000000-0000-4000-8000-000000000003',
      provider: 'unknown-' + CANARIES[0],
      parser: 'untrusted-' + CANARIES[1],
      status: 'failed',
      durationMs: 42,
      errorClass: 'Error: ' + CANARIES.join(' / '),
      attemptCount: 2,
      unsafe: {
        subject: CANARIES[1],
        body: CANARIES[4],
        html: CANARIES[5],
        attachment: CANARIES[6]
      }
    } as never, write)

    const serialized = JSON.stringify(write.mock.calls)
    for (const canary of CANARIES) expect(serialized).not.toContain(canary)
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      event: 'email_ingestion_failure',
      provider: 'unknown',
      parser: 'unknown',
      errorClass: 'unexpected'
    }))
  })

  it('never lets telemetry failure break ingestion', () => {
    expect(() => emitEmailIngestionEvent({
      event: 'email_ingestion_receipt',
      status: 'received'
    }, () => {
      throw new Error('logger unavailable')
    })).not.toThrow()
  })

  it('keeps a full Worker canary out of batched logs and operator-safe projections', async () => {
    const rawText = [
      `From: ${CANARIES[0]} <${CANARIES[8]}>`,
      `Subject: ${CANARIES[1]}`,
      'Message-ID: <privacy-canary-message@example.test>',
      'Content-Type: multipart/mixed; boundary="privacy-boundary"',
      '',
      '--privacy-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      `${CANARIES[5]} ${CANARIES[4]} ${CANARIES[2]} ${CANARIES[3]}`,
      '--privacy-boundary',
      `Content-Disposition: attachment; filename="${CANARIES[6]}"`,
      'Content-Type: application/octet-stream',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(CANARIES[7]),
      '--privacy-boundary--'
    ].join('\r\n')
    const rawBytes = new TextEncoder().encode(rawText)
    const safeEvidence: unknown[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input : input.url
      ).pathname
      const body = JSON.parse(String(init?.body ?? '{}'))
      if (path.endsWith('/email-policy')) {
        return Response.json({
          schemaVersion: 1,
          parserMode: 'generic',
          aiExtractionMode: 'disabled',
          expectedProvider: null,
          allowedSenderDomains: [],
          maxRawBytes: 2 * 1024 * 1024,
          maxAdfAttachmentBytes: 256 * 1024
        })
      }
      if (path.endsWith('/email-stage')) {
        safeEvidence.push(body.safeEvidence)
        return Response.json({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: body.correlationId,
          ingestionId: '20000000-0000-4000-8000-000000000001',
          encryptedObjectKey: 'email-ingestions/abcdefghijklmnop'
        })
      }
      if (path.endsWith('/email-stage-confirm')) {
        return Response.json({ schemaVersion: 1, status: 'confirmed' })
      }
      return Response.json({
        status: 'accepted',
        leadId: '30000000-0000-4000-8000-000000000001'
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    const bucket = {
      put: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue(undefined)
    }
    const raw = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(rawBytes)
        controller.close()
      }
    })
    try {
      await worker.email({
        from: CANARIES[8],
        to: 'general-0123456789@leads.xeroflow.io',
        headers: new Headers(),
        raw,
        rawSize: rawBytes.byteLength,
        setReject: vi.fn()
      } as never, {
        APPLICATION_ORIGIN: 'https://app.example.test',
        EMAIL_INGEST_HMAC_SECRET: 'privacy-hmac-secret-1234',
        EMAIL_QUARANTINE_ENCRYPTION_SECRET: 'privacy-encryption-secret-5678',
        EMAIL_QUARANTINE_BUCKET: bucket,
        AI: {}
      } as never, {} as never)

      const health = reconcileEmailHealthRows([{
        id: '20000000-0000-4000-8000-000000000001',
        status: 'accepted',
        terminal_at: '2026-07-29T12:00:01Z',
        created_at: '2026-07-29T12:00:00Z',
        processing_ms: 1000,
        possible_duplicate: false,
        assigned: false,
        first_response_ms: null,
        recovery_attempts: 0,
        error_class: null
      }])
      const safeOutputs = {
        logs: logs.mock.calls,
        safeEvidence,
        health,
        audit: {
          action: 'recovery_completed',
          outcome: 'accepted',
          reason: null
        },
        notification: {
          title: 'Email lead ingestion needs attention',
          message: 'Operational alert: first response sla',
          metadata: { alertCode: 'first_response_sla' }
        }
      }
      const serialized = JSON.stringify(safeOutputs)
      for (const canary of CANARIES) expect(serialized).not.toContain(canary)
      expect(logs).toHaveBeenCalledOnce()
    } finally {
      logs.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
