import { createHash, createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createOpaqueEmailObjectKey,
  decryptStagedEmail,
  decryptRawEmail,
  encryptRawEmail,
  encryptStagedEmail
} from '../../workers/email-lead-intake/src/quarantine'
import { createSignedHeaders } from '../../workers/email-lead-intake/src/signing'
import worker, { handleEmailMessage } from '../../workers/email-lead-intake/src/index'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const TOKEN = '0123456789'
const CORRELATION_ID = '11111111-1111-4111-8111-111111111111'
const STORED_CORRELATION_ID = '99999999-9999-4999-8999-999999999999'
const INGESTION_ID = '22222222-2222-4222-8222-222222222222'
const OBJECT_KEY = 'email-ingestions/abcdefghijklmnop'
const EXTERNAL_ID_HASH = 'dcb3450e3d753d1a0f98277376b9343c271610515ece8298d421e42b95a49371'
const MESSAGE_ID_HASH = 'c554a336f571d0d9e9cdc3715c80e3544a9832bb2a1bcb755816387462ec5326'
const RAW_CONTENT_HASH = '9e1754126fd6a723f2a3ce4b3b06a124bcf6e9378c545cd86bed370923cdc5b7'
const HMAC_SECRET = 'f2713ba16b143c940d34cc43aa1059a9e786b5072eaf0776255ad11ee490fd6f'
const ENCRYPTION_SECRET = '4945a9bf0618d4ea7d38d28cfaec79917961dcd3efcd10e3352c560825f58fc6'
const RAW_TEXT = [
  'From: Carsales <relay@carsales.example>',
  'Subject: New Carsales enquiry',
  'Message-ID: <lead-42@example.test>',
  '',
  'Lead ID: provider-42',
  'Name: Alex Example',
  'Email: alex@example.test',
  'Phone: +61 400 123 456'
].join('\r\n')
const RAW = encoder.encode(RAW_TEXT)
const STAGED_MANIFEST = {
  schemaVersion: 1 as const,
  ingestionId: INGESTION_ID,
  encryptedObjectKey: OBJECT_KEY,
  provider: 'carsales',
  externalIdHash: EXTERNAL_ID_HASH,
  messageIdHash: MESSAGE_ID_HASH,
  rawContentHashVersion: 1 as const,
  rawContentHash: RAW_CONTENT_HASH
}

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>()
  readonly puts: string[] = []
  readonly putAttempts: Array<{ key: string, value: Uint8Array, options: unknown }> = []
  readonly deletes: string[] = []
  readonly deleteAttempts: string[] = []
  private failuresRemaining: number
  private deleteFailuresRemaining: number

  constructor(failures = 0, deleteFailures = 0) {
    this.failuresRemaining = failures
    this.deleteFailuresRemaining = deleteFailures
  }

  async put(key: string, value: Uint8Array, options?: unknown) {
    this.puts.push(key)
    this.putAttempts.push({ key, value: new Uint8Array(value), options: structuredClone(options) })
    if (this.failuresRemaining-- > 0) throw new Error('R2 unavailable')
    if (
      this.objects.has(key)
      && (options as { onlyIf?: { etagDoesNotMatch?: string } } | undefined)
        ?.onlyIf?.etagDoesNotMatch === '*'
    ) {
      return null
    }
    this.objects.set(key, new Uint8Array(value))
    return {}
  }

  async delete(key: string) {
    this.deleteAttempts.push(key)
    if (this.deleteFailuresRemaining-- > 0) throw new Error('R2 delete unavailable')
    this.deletes.push(key)
    this.objects.delete(key)
  }
}

function message(overrides: Record<string, unknown> = {}) {
  let rawReads = 0
  let rejected: string | null = null
  const raw = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(RAW)
      controller.close()
    }
  })
  return {
    value: {
      from: 'relay@carsales.example',
      to: `carsales-${TOKEN}@leads.xeroflow.io`,
      headers: new Headers(),
      get raw() {
        rawReads++
        return raw
      },
      rawSize: RAW.byteLength,
      setReject(reason: string) { rejected = reason },
      ...overrides
    },
    pulls: () => rawReads,
    rejected: () => rejected
  }
}

function messageWithRaw(rawText: string) {
  const raw = encoder.encode(rawText)
  return message({
    raw: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(raw)
        controller.close()
      }
    }),
    rawSize: raw.byteLength
  })
}

function environment(bucket = new MemoryBucket()) {
  return {
    APPLICATION_ORIGIN: 'https://app.example.test',
    EMAIL_INGEST_HMAC_SECRET: HMAC_SECRET,
    EMAIL_QUARANTINE_ENCRYPTION_SECRET: ENCRYPTION_SECRET,
    EMAIL_QUARANTINE_BUCKET: bucket,
    AI: {},
    bucket
  }
}

const policy = {
  schemaVersion: 1,
  parserMode: 'auto',
  aiExtractionMode: 'disabled',
  expectedProvider: 'carsales',
  allowedSenderDomains: ['carsales.example'],
  maxRawBytes: 2 * 1024 * 1024,
  maxAdfAttachmentBytes: 256 * 1024
}

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function successfulFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url).pathname
    if (path.endsWith('/email-policy')) return responseJson(policy)
    if (path.endsWith('/email-stage')) {
      return responseJson({
        schemaVersion: 1,
        outcome: 'reserved',
        correlationId: CORRELATION_ID,
        ingestionId: INGESTION_ID,
        encryptedObjectKey: OBJECT_KEY
      })
    }
    return responseJson({ status: 'accepted', leadId: '33333333-3333-4333-8333-333333333333' })
  })
}

function dependencies(fetchImpl = successfulFetch()) {
  let uuidIndex = 0
  const uuids = [
    CORRELATION_ID,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ]
  return {
    fetch: fetchImpl,
    nowMs: () => Date.parse('2026-07-29T00:00:00.000Z'),
    randomUUID: () => uuids[uuidIndex++] ?? 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    sleep: vi.fn(async () => {}),
    fetchImpl
  }
}

function bodyOf(init: RequestInit | undefined) {
  if (typeof init?.body !== 'string') throw new Error('Expected JSON string body')
  return JSON.parse(init.body) as Record<string, unknown>
}

describe('email lead intake Worker', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('implements the exact Web Crypto signing input and required headers', async () => {
    const body = '{"schemaVersion":1}'
    const headers = await createSignedHeaders(body, 'test-secret', {
      timestampSeconds: '1785283200',
      nonce: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    })
    const digest = createHash('sha256').update(body).digest('hex')
    const expected = createHmac('sha256', 'test-secret')
      .update(`v1\n1785283200\naaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\n${digest}`)
      .digest('hex')

    expect(headers).toEqual({
      'content-type': 'application/json',
      'x-xeroflow-email-timestamp': '1785283200',
      'x-xeroflow-email-nonce': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'x-xeroflow-email-signature': `v1=${expected}`
    })
  })

  it('rejects an unknown recipient without network, raw read, or retention', async () => {
    const incoming = message({ to: 'not-an-endpoint@leads.xeroflow.io' })
    const env = environment()
    const deps = dependencies()

    await expect(handleEmailMessage(incoming.value, env, deps)).resolves.toMatchObject({ status: 'rejected' })

    expect(incoming.pulls()).toBe(0)
    expect(incoming.rejected()).toMatch(/recipient/i)
    expect(deps.fetchImpl).not.toHaveBeenCalled()
    expect(env.bucket.puts).toEqual([])
  })

  it.each([
    ['missing HMAC secret', { EMAIL_INGEST_HMAC_SECRET: undefined }],
    ['short HMAC secret', { EMAIL_INGEST_HMAC_SECRET: 'too-short' }],
    ['repeated HMAC secret', { EMAIL_INGEST_HMAC_SECRET: 'a'.repeat(64) }],
    ['placeholder HMAC secret', { EMAIL_INGEST_HMAC_SECRET: Buffer.from('replace-this-placeholder-secret-now').toString('base64') }],
    ['missing encryption secret', { EMAIL_QUARANTINE_ENCRYPTION_SECRET: undefined }],
    ['short encryption secret', { EMAIL_QUARANTINE_ENCRYPTION_SECRET: 'too-short' }],
    ['low-diversity encryption secret', { EMAIL_QUARANTINE_ENCRYPTION_SECRET: 'abcd'.repeat(16) }],
    ['shared secret material', {
      EMAIL_INGEST_HMAC_SECRET: HMAC_SECRET,
      EMAIL_QUARANTINE_ENCRYPTION_SECRET: HMAC_SECRET
    }],
    ['insecure application origin', { APPLICATION_ORIGIN: 'http://app.example.test' }],
    ['missing quarantine bucket', { EMAIL_QUARANTINE_BUCKET: undefined }]
  ])('keeps mail retryable when Worker configuration has %s', async (_label, override) => {
    const incoming = message()
    const configured = environment()
    const env = { ...configured, ...override } as unknown as Env
    const deps = dependencies()

    await expect(handleEmailMessage(incoming.value, env, deps)).rejects.toMatchObject({
      name: 'RetryableEmailIntakeError',
      correlationId: CORRELATION_ID
    })

    expect(deps.fetchImpl).not.toHaveBeenCalled()
    expect(incoming.pulls()).toBe(0)
    expect(incoming.rejected()).toBeNull()
    expect(configured.bucket.puts).toEqual([])
  })

  it('rethrows invalid Worker configuration from the module handler', async () => {
    const incoming = message()
    const env = environment()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(worker.email(incoming.value, {
      ...env,
      EMAIL_QUARANTINE_ENCRYPTION_SECRET: env.EMAIL_INGEST_HMAC_SECRET
    }, {} as ExecutionContext)).rejects.toMatchObject({
      name: 'RetryableEmailIntakeError'
    })

    expect(incoming.pulls()).toBe(0)
    expect(incoming.rejected()).toBeNull()
    expect(env.bucket.puts).toEqual([])
    expect(String(log.mock.calls[0]?.[0])).toContain('retryable_error')
  })

  it('performs a freshly signed minimal policy lookup before reading raw MIME', async () => {
    const incoming = message()
    const env = environment()
    const deps = dependencies()

    await handleEmailMessage(incoming.value, env, deps)

    const firstCall = deps.fetchImpl.mock.calls[0]!
    expect(new URL(String(firstCall[0])).pathname).toBe('/api/internal/leads/email-policy')
    expect(bodyOf(firstCall[1])).toEqual({ recipientToken: TOKEN })
    expect((firstCall[1]?.headers as Record<string, string>)['x-xeroflow-email-signature']).toMatch(/^v1=[a-f0-9]{64}$/)
    expect(incoming.pulls()).toBeGreaterThan(0)
  })

  it.each([
    ['unknown endpoint', responseJson({ error: 'unavailable' }, 404)],
    ['disabled endpoint', responseJson({ error: 'unavailable' }, 409)]
  ])('denies %s policy before raw read', async (_label, denied) => {
    const incoming = message()
    const fetchImpl = vi.fn(async () => denied)
    const env = environment()

    await expect(handleEmailMessage(incoming.value, env, dependencies(fetchImpl))).resolves.toMatchObject({ status: 'rejected' })

    expect(incoming.pulls()).toBe(0)
    expect(incoming.rejected()).toMatch(/policy/i)
    expect(env.bucket.puts).toEqual([])
  })

  it.each([
    ['network exhaustion', () => Promise.reject(new Error('network unavailable'))],
    ['retryable status exhaustion', () => Promise.resolve(responseJson({ error: 'temporary' }, 503))]
  ])('propagates retryable policy %s without reading raw or permanently rejecting SMTP', async (_label, reply) => {
    const incoming = message()
    const fetchImpl = vi.fn(reply)
    const deps = dependencies(fetchImpl)

    await expect(handleEmailMessage(incoming.value, environment(), deps)).rejects.toMatchObject({
      name: 'RetryableEmailIntakeError',
      correlationId: CORRELATION_ID
    })

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(deps.sleep).toHaveBeenNthCalledWith(1, 100)
    expect(deps.sleep).toHaveBeenNthCalledWith(2, 200)
    expect(incoming.pulls()).toBe(0)
    expect(incoming.rejected()).toBeNull()
  })

  it('propagates a malformed successful policy response through the module handler with safe logging', async () => {
    const incoming = message()
    const fetchImpl = vi.fn(async () => new Response('{not-json', { status: 200 }))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchImpl)
    try {
      const pending = worker.email(incoming.value, environment(), {} as ExecutionContext)
      await expect(pending).rejects.toMatchObject({ name: 'RetryableEmailIntakeError' })
      expect(incoming.pulls()).toBe(0)
      expect(incoming.rejected()).toBeNull()
      expect(log).toHaveBeenCalledOnce()
      const serializedLog = String(log.mock.calls[0]?.[0])
      expect(serializedLog).toContain('retryable_error')
      expect(serializedLog).not.toContain(TOKEN)
      expect(serializedLog).not.toContain(`carsales-${TOKEN}`)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('propagates retryable policy exhaustion from the module handler instead of marking the message handled', async () => {
    const incoming = message()
    const fetchImpl = vi.fn(async () => responseJson({ error: 'temporary' }, 503))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchImpl)
    try {
      await expect(worker.email(incoming.value, environment(), {} as ExecutionContext)).rejects.toMatchObject({
        name: 'RetryableEmailIntakeError'
      })
      expect(fetchImpl).toHaveBeenCalledTimes(3)
      expect(incoming.pulls()).toBe(0)
      expect(incoming.rejected()).toBeNull()
      expect(String(log.mock.calls[0]?.[0])).toContain('retryable_error')
      expect(String(log.mock.calls[0]?.[0])).toContain('"errorClass":"internal_upstream_5xx"')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports a bounded network failure class without logging the upstream error', async () => {
    const incoming = message()
    const fetchImpl = vi.fn(async () => {
      throw new Error('private upstream detail')
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchImpl)
    try {
      await expect(worker.email(incoming.value, environment(), {} as ExecutionContext)).rejects.toMatchObject({
        name: 'RetryableEmailIntakeError'
      })
      const serializedLog = String(log.mock.calls[0]?.[0])
      expect(serializedLog).toContain('"errorClass":"internal_upstream_network"')
      expect(serializedLog).not.toContain('private upstream detail')
      expect(serializedLog).not.toContain(TOKEN)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('denies an unapproved envelope sender before raw read', async () => {
    const incoming = message({ from: 'attacker@evil.example' })
    const fetchImpl = vi.fn(async () => responseJson(policy))

    await expect(handleEmailMessage(incoming.value, environment(), dependencies(fetchImpl))).resolves.toMatchObject({ status: 'rejected' })

    expect(incoming.pulls()).toBe(0)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('rejects authoritative raw size over policy before consuming the stream', async () => {
    const incoming = message({ rawSize: policy.maxRawBytes + 1 })
    const fetchImpl = vi.fn(async () => responseJson(policy))

    await expect(handleEmailMessage(incoming.value, environment(), dependencies(fetchImpl))).resolves.toMatchObject({ status: 'rejected' })

    expect(incoming.pulls()).toBe(0)
  })

  it('signs a stage reservation with hashed identity and stops duplicates before R2 write', async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init])
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      return responseJson({
        schemaVersion: 1,
        outcome: 'duplicate',
        correlationId: CORRELATION_ID,
        ingestionId: INGESTION_ID,
        cleanupObjectKey: null
      })
    })
    const env = environment()

    await expect(handleEmailMessage(message().value, env, dependencies(fetchImpl))).resolves.toEqual({
      status: 'duplicate',
      correlationId: CORRELATION_ID
    })

    expect(calls).toHaveLength(2)
    const stage = bodyOf(calls[1]?.[1])
    expect(stage).toMatchObject({
      schemaVersion: 1,
      correlationId: CORRELATION_ID,
      recipientToken: TOKEN,
      envelopeSenderDomain: 'carsales.example',
      headerFromDomain: 'carsales.example',
      provider: 'carsales'
    })
    expect(stage.externalIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(stage.legacyExternalIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(stage.messageIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(stage).toMatchObject({
      rawContentHashVersion: 1,
      rawContentHash: RAW_CONTENT_HASH
    })
    expect(JSON.stringify(stage)).not.toContain('provider-42')
    expect(JSON.stringify(stage)).not.toContain('alex@example.test')
    expect(env.bucket.puts).toEqual([])
  })

  it('permanently rejects an endpoint disabled between policy and stage', async () => {
    const incoming = message()
    const env = environment()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      return responseJson({
        schemaVersion: 1,
        outcome: 'denied',
        code: 'email_endpoint_unavailable'
      })
    })

    await expect(handleEmailMessage(incoming.value, env, dependencies(fetchImpl))).resolves.toEqual({
      status: 'rejected'
    })
    expect(incoming.rejected()).toMatch(/stage/i)
    expect(env.bucket.puts).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('permanently rejects a parsed header-domain denial returned by the signed stage boundary', async () => {
    const headerDeniedRaw = encoder.encode(RAW_TEXT.replace(
      'From: Carsales <relay@carsales.example>',
      'From: Impostor <relay@evil.example>'
    ))
    const incoming = message({
      raw: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(headerDeniedRaw)
          controller.close()
        }
      }),
      rawSize: headerDeniedRaw.byteLength
    })
    const env = environment()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      expect(bodyOf(init).headerFromDomain).toBe('evil.example')
      return responseJson({
        schemaVersion: 1,
        outcome: 'denied',
        code: 'email_endpoint_policy_denied'
      })
    })

    await expect(handleEmailMessage(incoming.value, env, dependencies(fetchImpl))).resolves.toEqual({
      status: 'rejected'
    })
    expect(incoming.rejected()).toMatch(/stage/i)
    expect(env.bucket.puts).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('keeps transient stage failure retryable and never converts it to permanent SMTP rejection', async () => {
    const incoming = message()
    const env = environment()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      return responseJson({ error: 'temporary' }, 503)
    })

    await expect(handleEmailMessage(incoming.value, env, dependencies(fetchImpl))).rejects.toMatchObject({
      name: 'RetryableEmailIntakeError',
      correlationId: CORRELATION_ID
    })
    expect(incoming.rejected()).toBeNull()
    expect(env.bucket.puts).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it.each([
    ['malformed ADF body', [
      'From: Carsales <relay@carsales.example>',
      'Subject: New Carsales enquiry',
      'Message-ID: <malformed-body@example.test>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      '<adf><prospect><customer><email>alex@example.test</email></customer>&prohibited;</prospect></adf>'
    ].join('\r\n')],
    ['malformed XML attachment', [
      'From: Carsales <relay@carsales.example>',
      'Subject: New Carsales enquiry',
      'Message-ID: <malformed-attachment@example.test>',
      'Content-Type: multipart/mixed; boundary=\"adf-boundary\"',
      '',
      '--adf-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Attached lead.',
      '--adf-boundary',
      'Content-Type: application/xml',
      'Content-Disposition: attachment; filename=\"lead.xml\"',
      '',
      '<!DOCTYPE adf SYSTEM \"https://evil.example/adf.dtd\"><adf></adf>',
      '--adf-boundary--'
    ].join('\r\n')]
  ])('durably quarantines %s instead of retrying forever', async (_label, rawText) => {
    const incoming = messageWithRaw(rawText)
    const env = environment()
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init])
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        return responseJson({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: CORRELATION_ID,
          ingestionId: INGESTION_ID,
          encryptedObjectKey: OBJECT_KEY
        })
      }
      if (path.endsWith('/email-stage-confirm')) return responseJson({ status: 'confirmed' })
      return responseJson({ status: 'quarantined' })
    })
    const emitted = vi.fn()
    const deps = { ...dependencies(fetchImpl), emit: emitted }

    await expect(handleEmailMessage(incoming.value, env, deps)).resolves.toEqual({
      status: 'quarantined',
      correlationId: CORRELATION_ID
    })

    expect(calls).toHaveLength(4)
    const stage = bodyOf(calls[1]?.[1])
    expect(stage).toMatchObject({
      provider: 'carsales',
      rawContentHashVersion: 1
    })
    expect(stage.externalIdHash).toBe(stage.messageIdHash)
    const ingest = bodyOf(calls[3]?.[1])
    expect(ingest.extraction).toBeNull()
    expect(ingest.quarantine).toMatchObject({ reason: 'Parser rejected message' })
    expect(env.bucket.objects.has(OBJECT_KEY)).toBe(true)
    expect(incoming.rejected()).toBeNull()
    expect(emitted).toHaveBeenCalledWith(expect.objectContaining({
      event: 'email_ingestion_parse',
      status: 'failed',
      errorClass: 'parse_failed'
    }))
  })

  it('encrypts after reservation, awaits canonical ingestion, deletes on acceptance, and preserves correlation', async () => {
    const env = environment()
    const deps = dependencies()

    await expect(handleEmailMessage(message().value, env, deps)).resolves.toEqual({
      status: 'accepted',
      correlationId: CORRELATION_ID
    })

    expect(env.bucket.puts).toEqual([OBJECT_KEY])
    expect(env.bucket.deletes).toEqual([OBJECT_KEY])
    const calls = deps.fetchImpl.mock.calls
    const stage = bodyOf(calls[1]?.[1])
    const confirmation = bodyOf(calls[2]?.[1])
    expect(confirmation).toEqual({
      schemaVersion: 1,
      ingestionId: INGESTION_ID,
      correlationId: CORRELATION_ID,
      encryptedObjectKey: OBJECT_KEY,
      rawContentHashVersion: 1,
      rawContentHash: RAW_CONTENT_HASH
    })
    expect(env.bucket.puts).toEqual([OBJECT_KEY])
    const ingest = bodyOf(calls[3]?.[1])
    expect(ingest.correlationId).toBe(CORRELATION_ID)
    expect(ingest.externalIdHash).toBe(stage.externalIdHash)
    expect(ingest.rawContentHash).toBe(stage.rawContentHash)
    expect(ingest).toMatchObject({
      schemaVersion: 1,
      ingestionId: INGESTION_ID,
      recipientToken: TOKEN,
      envelopeSenderDomain: 'carsales.example',
      headerFromDomain: 'carsales.example'
    })
    const serialized = JSON.stringify(ingest)
    for (const forbidden of ['provider-42', RAW_TEXT, OBJECT_KEY, `carsales-${TOKEN}@leads.xeroflow.io`]) {
      expect(serialized).not.toContain(forbidden)
    }
    const signatures = calls.map(call => (call[1]?.headers as Record<string, string>)['x-xeroflow-email-signature'])
    const nonces = calls.map(call => (call[1]?.headers as Record<string, string>)['x-xeroflow-email-nonce'])
    expect(signatures.every(value => /^v1=[a-f0-9]{64}$/.test(value))).toBe(true)
    expect(new Set(nonces).size).toBe(calls.length)
  })

  it('retries a lost committed stage response with the exact same body and uses the returned reservation identity', async () => {
    const stageBodies: string[] = []
    let stageAttempts = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        stageBodies.push(String(init?.body))
        stageAttempts++
        if (stageAttempts === 1) throw new Error('response lost after commit')
        return responseJson({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: STORED_CORRELATION_ID,
          ingestionId: INGESTION_ID,
          encryptedObjectKey: OBJECT_KEY
        })
      }
      const ingest = bodyOf(init)
      expect(ingest.correlationId).toBe(STORED_CORRELATION_ID)
      return responseJson({ status: 'accepted', leadId: '33333333-3333-4333-8333-333333333333' })
    })

    await expect(handleEmailMessage(message().value, environment(), dependencies(fetchImpl))).resolves.toEqual({
      status: 'accepted',
      correlationId: STORED_CORRELATION_ID
    })
    expect(stageBodies).toHaveLength(2)
    expect(new Set(stageBodies).size).toBe(1)
  })

  it('uses a reused reservation correlation for R2 metadata and canonical ingestion on fresh redelivery', async () => {
    const env = environment()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        expect(bodyOf(init).correlationId).toBe(CORRELATION_ID)
        return responseJson({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: STORED_CORRELATION_ID,
          ingestionId: INGESTION_ID,
          encryptedObjectKey: OBJECT_KEY
        })
      }
      expect(bodyOf(init).correlationId).toBe(STORED_CORRELATION_ID)
      return responseJson({ status: 'accepted', leadId: '33333333-3333-4333-8333-333333333333' })
    })

    await expect(handleEmailMessage(message().value, env, dependencies(fetchImpl))).resolves.toEqual({
      status: 'accepted',
      correlationId: STORED_CORRELATION_ID
    })
    expect(env.bucket.putAttempts[0]?.options).toMatchObject({
      customMetadata: { correlationId: STORED_CORRELATION_ID }
    })
  })

  it('logs the authoritative reservation correlation after a successful redelivery', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        return responseJson({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: STORED_CORRELATION_ID,
          ingestionId: INGESTION_ID,
          encryptedObjectKey: OBJECT_KEY
        })
      }
      expect(bodyOf(init).correlationId).toBe(STORED_CORRELATION_ID)
      return responseJson({ status: 'accepted', leadId: '33333333-3333-4333-8333-333333333333' })
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchImpl)
    try {
      await worker.email(message().value, environment(), {} as ExecutionContext)
      const serializedLog = String(log.mock.calls[0]?.[0])
      expect(serializedLog).toContain(STORED_CORRELATION_ID)
      expect(serializedLog).not.toContain(CORRELATION_ID)
      expect(serializedLog).not.toContain(TOKEN)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('retries R2 writes with the identical key, ciphertext, and metadata', async () => {
    const bucket = new MemoryBucket(2)
    const env = environment(bucket)
    const deps = dependencies()

    await expect(handleEmailMessage(message().value, env, deps)).resolves.toEqual({
      status: 'accepted',
      correlationId: CORRELATION_ID
    })

    expect(bucket.putAttempts).toHaveLength(3)
    expect(bucket.putAttempts.map(attempt => attempt.key)).toEqual([OBJECT_KEY, OBJECT_KEY, OBJECT_KEY])
    expect(bucket.putAttempts[1]?.value).toEqual(bucket.putAttempts[0]?.value)
    expect(bucket.putAttempts[2]?.value).toEqual(bucket.putAttempts[0]?.value)
    expect(bucket.putAttempts[1]?.options).toEqual(bucket.putAttempts[0]?.options)
    expect(bucket.putAttempts[2]?.options).toEqual(bucket.putAttempts[0]?.options)
    expect(bucket.putAttempts[0]?.options).toMatchObject({
      onlyIf: { etagDoesNotMatch: '*' },
      customMetadata: {
        rawContentHashVersion: '1',
        rawContentHash: RAW_CONTENT_HASH
      }
    })
    expect(deps.sleep).toHaveBeenNthCalledWith(1, 100)
    expect(deps.sleep).toHaveBeenNthCalledWith(2, 200)
  })

  it('retains the exact staged object when upload confirmation is lost after R2 put', async () => {
    const env = environment()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        return responseJson({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: CORRELATION_ID,
          ingestionId: INGESTION_ID,
          encryptedObjectKey: OBJECT_KEY
        })
      }
      if (path.endsWith('/email-stage-confirm')) throw new Error('response lost')
      throw new Error('canonical ingest must not run')
    })

    await expect(handleEmailMessage(message().value, env, dependencies(fetchImpl)))
      .rejects.toMatchObject({ name: 'RetryableEmailIntakeError', correlationId: CORRELATION_ID })
    expect(env.bucket.puts).toEqual([OBJECT_KEY])
    expect(env.bucket.objects.has(OBJECT_KEY)).toBe(true)
    expect(env.bucket.deletes).toEqual([])
  })

  it('propagates exhausted R2 writes without a post-stage permanent rejection', async () => {
    const bucket = new MemoryBucket(3)
    const env = environment(bucket)
    const incoming = message()
    const deps = dependencies()

    await expect(handleEmailMessage(incoming.value, env, deps)).rejects.toMatchObject({
      name: 'RetryableEmailIntakeError',
      correlationId: CORRELATION_ID
    })

    expect(bucket.putAttempts).toHaveLength(3)
    expect(bucket.objects.has(OBJECT_KEY)).toBe(false)
    expect(incoming.rejected()).toBeNull()
    expect(deps.fetchImpl).toHaveBeenCalledTimes(2)
  })

  it.each(['accepted', 'duplicate'] as const)(
    'retries transient R2 deletion after canonical %s',
    async (canonicalStatus) => {
      const bucket = new MemoryBucket(0, 2)
      const env = environment(bucket)
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname
        if (path.endsWith('/email-policy')) return responseJson(policy)
        if (path.endsWith('/email-stage')) {
          return responseJson({
            schemaVersion: 1,
            outcome: 'reserved',
            correlationId: CORRELATION_ID,
            ingestionId: INGESTION_ID,
            encryptedObjectKey: OBJECT_KEY
          })
        }
        return canonicalStatus === 'accepted'
          ? responseJson({ status: 'accepted', leadId: '33333333-3333-4333-8333-333333333333' })
          : responseJson({ status: 'duplicate' })
      })
      const deps = dependencies(fetchImpl)

      await expect(handleEmailMessage(message().value, env, deps)).resolves.toEqual({
        status: canonicalStatus,
        correlationId: CORRELATION_ID
      })
      expect(bucket.deleteAttempts).toEqual([OBJECT_KEY, OBJECT_KEY, OBJECT_KEY])
      expect(bucket.deletes).toEqual([OBJECT_KEY])
      expect(deps.sleep).toHaveBeenNthCalledWith(1, 100)
      expect(deps.sleep).toHaveBeenNthCalledWith(2, 200)
    }
  )

  it('throws an authoritative retryable error when accepted-object deletion is exhausted without leaking the key', async () => {
    const bucket = new MemoryBucket(0, 3)
    const env = environment(bucket)
    const incoming = message()

    let thrown: unknown
    try {
      await handleEmailMessage(incoming.value, env, dependencies())
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      name: 'RetryableEmailIntakeError',
      correlationId: CORRELATION_ID
    })
    expect(JSON.stringify(thrown)).not.toContain(OBJECT_KEY)
    expect(thrown instanceof Error ? thrown.message : '').not.toContain(OBJECT_KEY)
    expect(bucket.deleteAttempts).toEqual([OBJECT_KEY, OBJECT_KEY, OBJECT_KEY])
    expect(incoming.rejected()).toBeNull()
  })

  it('cleans a terminal duplicate without R2 put or canonical ingestion', async () => {
    const env = environment()
    const incoming = message()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      return responseJson({
        schemaVersion: 1,
        outcome: 'duplicate',
        correlationId: STORED_CORRELATION_ID,
        ingestionId: INGESTION_ID,
        cleanupObjectKey: OBJECT_KEY
      })
    })

    await expect(handleEmailMessage(incoming.value, env, dependencies(fetchImpl))).resolves.toEqual({
      status: 'duplicate',
      correlationId: STORED_CORRELATION_ID
    })
    expect(env.bucket.puts).toEqual([])
    expect(env.bucket.deleteAttempts).toEqual([OBJECT_KEY])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(incoming.rejected()).toBeNull()
  })

  it('keeps exhausted terminal cleanup retryable with authoritative correlation and no key leak', async () => {
    const bucket = new MemoryBucket(0, 3)
    const env = environment(bucket)
    const incoming = message()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      return responseJson({
        schemaVersion: 1,
        outcome: 'duplicate',
        correlationId: STORED_CORRELATION_ID,
        ingestionId: INGESTION_ID,
        cleanupObjectKey: OBJECT_KEY
      })
    })

    let thrown: unknown
    try {
      await handleEmailMessage(incoming.value, env, dependencies(fetchImpl))
    }
    catch (error) {
      thrown = error
    }
    expect(thrown).toMatchObject({
      name: 'RetryableEmailIntakeError',
      correlationId: STORED_CORRELATION_ID
    })
    expect(JSON.stringify(thrown)).not.toContain(OBJECT_KEY)
    expect(bucket.puts).toEqual([])
    expect(bucket.deleteAttempts).toEqual([OBJECT_KEY, OBJECT_KEY, OBJECT_KEY])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(incoming.rejected()).toBeNull()
  })

  it('logs terminal cleanup exhaustion with authoritative correlation and no object key', async () => {
    const bucket = new MemoryBucket(0, 3)
    const env = environment(bucket)
    const incoming = message()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      return responseJson({
        schemaVersion: 1,
        outcome: 'duplicate',
        correlationId: STORED_CORRELATION_ID,
        ingestionId: INGESTION_ID,
        cleanupObjectKey: OBJECT_KEY
      })
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchImpl)
    try {
      await expect(worker.email(incoming.value, env, {} as ExecutionContext)).rejects.toMatchObject({
        name: 'RetryableEmailIntakeError',
        correlationId: STORED_CORRELATION_ID
      })
      const serializedLog = String(log.mock.calls[0]?.[0])
      expect(serializedLog).toContain('retryable_error')
      expect(serializedLog).toContain(STORED_CORRELATION_ID)
      expect(serializedLog).not.toContain(OBJECT_KEY)
      expect(incoming.rejected()).toBeNull()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it('treats a terminal duplicate without cleanup key as an authoritative no-op', async () => {
    const env = environment()
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      return responseJson({
        schemaVersion: 1,
        outcome: 'duplicate',
        correlationId: STORED_CORRELATION_ID,
        ingestionId: INGESTION_ID,
        cleanupObjectKey: null
      })
    })

    await expect(handleEmailMessage(message().value, env, dependencies(fetchImpl))).resolves.toEqual({
      status: 'duplicate',
      correlationId: STORED_CORRELATION_ID
    })
    expect(env.bucket.puts).toEqual([])
    expect(env.bucket.deleteAttempts).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('uses authenticated encryption with separate secret material', async () => {
    const encrypted = await encryptRawEmail(RAW, 'encryption-secret-that-is-separate')
    const independentlyEncrypted = await encryptRawEmail(RAW, 'encryption-secret-that-is-separate')
    expect(decoder.decode(encrypted)).not.toContain('alex@example.test')
    expect(independentlyEncrypted).not.toEqual(encrypted)
    const firstKey = createOpaqueEmailObjectKey()
    const secondKey = createOpaqueEmailObjectKey()
    expect(firstKey).toMatch(/^email-ingestions\/[a-f0-9]{64}$/)
    expect(secondKey).not.toBe(firstKey)
    expect(firstKey).not.toContain(TOKEN)
    await expect(decryptRawEmail(encrypted, 'encryption-secret-that-is-separate')).resolves.toEqual(RAW)
    const tampered = new Uint8Array(encrypted)
    tampered[tampered.length - 1] ^= 1
    await expect(decryptRawEmail(tampered, 'encryption-secret-that-is-separate')).rejects.toThrow()
    await expect(decryptRawEmail(encrypted, 'different-secret')).rejects.toThrow()
  })

  it('seals the exact envelope sender for direct-customer recovery without plaintext leakage', async () => {
    const encrypted = await encryptStagedEmail(
      RAW,
      'alex.customer@example.test',
      'encryption-secret-that-is-separate',
      STAGED_MANIFEST
    )
    expect(decoder.decode(encrypted)).not.toContain('alex.customer@example.test')
    await expect(decryptStagedEmail(
      encrypted,
      'encryption-secret-that-is-separate',
      STAGED_MANIFEST
    )).resolves.toEqual({
      format: 'sealed',
      raw: RAW,
      envelopeSender: 'alex.customer@example.test',
      manifest: STAGED_MANIFEST
    })
    await expect(decryptStagedEmail(
      encrypted,
      'encryption-secret-that-is-separate',
      { ...STAGED_MANIFEST, provider: 'meta' }
    )).rejects.toThrow()
    const legacy = await encryptRawEmail(RAW, 'encryption-secret-that-is-separate')
    await expect(decryptStagedEmail(legacy, 'encryption-secret-that-is-separate')).resolves.toEqual({
      format: 'legacy',
      raw: RAW,
      envelopeSender: null
    })
  })

  it('retries retryable canonical failures with bounded deterministic backoff and stable identity', async () => {
    const ingestBodies: string[] = []
    let ingestAttempts = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        return responseJson({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: CORRELATION_ID,
          ingestionId: INGESTION_ID,
          encryptedObjectKey: OBJECT_KEY
        })
      }
      if (path.endsWith('/email-stage-confirm')) return responseJson({ status: 'confirmed' })
      ingestBodies.push(String(init?.body))
      ingestAttempts++
      return ingestAttempts < 3
        ? responseJson({ error: 'temporary' }, 503)
        : responseJson({ status: 'accepted', leadId: '33333333-3333-4333-8333-333333333333' })
    })
    const deps = dependencies(fetchImpl)
    const env = environment()

    await expect(handleEmailMessage(message().value, env, deps)).resolves.toEqual({
      status: 'accepted',
      correlationId: CORRELATION_ID
    })

    expect(ingestAttempts).toBe(3)
    expect(deps.sleep).toHaveBeenNthCalledWith(1, 100)
    expect(deps.sleep).toHaveBeenNthCalledWith(2, 200)
    expect(new Set(ingestBodies).size).toBe(1)
    expect(env.bucket.deletes).toEqual([OBJECT_KEY])
  })

  it('retains encrypted MIME for quarantined and exhausted retry outcomes without SMTP rejection', async () => {
    const quarantineFetch = successfulFetch()
    quarantineFetch.mockImplementationOnce(async () => responseJson(policy))
      .mockImplementationOnce(async () => responseJson({
        schemaVersion: 1,
        outcome: 'reserved',
        correlationId: CORRELATION_ID,
        ingestionId: INGESTION_ID,
        encryptedObjectKey: OBJECT_KEY
      }))
      .mockImplementationOnce(async () => responseJson({ status: 'confirmed' }))
      .mockImplementationOnce(async () => responseJson({ status: 'quarantined' }))
    const quarantinedMessage = message()
    const quarantinedEnv = environment()

    await expect(handleEmailMessage(quarantinedMessage.value, quarantinedEnv, dependencies(quarantineFetch)))
      .resolves.toMatchObject({ status: 'quarantined' })
    expect(quarantinedEnv.bucket.objects.has(OBJECT_KEY)).toBe(true)
    expect(quarantinedMessage.rejected()).toBeNull()

    const failedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        return responseJson({
          schemaVersion: 1,
          outcome: 'reserved',
          correlationId: CORRELATION_ID,
          ingestionId: INGESTION_ID,
          encryptedObjectKey: OBJECT_KEY
        })
      }
      if (path.endsWith('/email-stage-confirm')) return responseJson({ status: 'confirmed' })
      return responseJson({ error: 'temporary' }, 503)
    })
    const failedMessage = message()
    const failedEnv = environment()

    await expect(handleEmailMessage(failedMessage.value, failedEnv, dependencies(failedFetch)))
      .resolves.toMatchObject({ status: 'failed' })
    expect(failedEnv.bucket.objects.has(OBJECT_KEY)).toBe(true)
    expect(failedMessage.rejected()).toBeNull()
  })
})
