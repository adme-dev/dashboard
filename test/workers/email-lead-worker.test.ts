import { createHash, createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decryptRawEmail, encryptRawEmail } from '../../workers/email-lead-intake/src/quarantine'
import { createSignedHeaders } from '../../workers/email-lead-intake/src/signing'
import { handleEmailMessage } from '../../workers/email-lead-intake/src/index'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const TOKEN = '0123456789'
const CORRELATION_ID = '11111111-1111-4111-8111-111111111111'
const INGESTION_ID = '22222222-2222-4222-8222-222222222222'
const OBJECT_KEY = 'email-ingestions/abcdefghijklmnop'
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

class MemoryBucket {
  readonly objects = new Map<string, Uint8Array>()
  readonly puts: string[] = []
  readonly deletes: string[] = []

  async put(key: string, value: Uint8Array) {
    this.puts.push(key)
    this.objects.set(key, new Uint8Array(value))
    return {}
  }

  async delete(key: string) {
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

function environment(bucket = new MemoryBucket()) {
  return {
    APPLICATION_ORIGIN: 'https://app.example.test',
    EMAIL_INGEST_HMAC_SECRET: 'hmac-secret-that-is-not-the-encryption-key',
    EMAIL_QUARANTINE_ENCRYPTION_SECRET: 'encryption-secret-that-is-separate',
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
      return responseJson({ schemaVersion: 1, outcome: 'reserved', ingestionId: INGESTION_ID, encryptedObjectKey: OBJECT_KEY })
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
    expect(env.bucket.puts).toEqual([])
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
      return responseJson({ schemaVersion: 1, outcome: 'duplicate', ingestionId: INGESTION_ID, encryptedObjectKey: null })
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
    expect(stage.messageIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(stage)).not.toContain('provider-42')
    expect(JSON.stringify(stage)).not.toContain('alex@example.test')
    expect(env.bucket.puts).toEqual([])
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
    const ingest = bodyOf(calls[2]?.[1])
    expect(ingest.correlationId).toBe(CORRELATION_ID)
    expect(ingest.externalIdHash).toBe(stage.externalIdHash)
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

  it('uses authenticated encryption with separate secret material', async () => {
    const encrypted = await encryptRawEmail(RAW, 'encryption-secret-that-is-separate')
    expect(decoder.decode(encrypted)).not.toContain('alex@example.test')
    await expect(decryptRawEmail(encrypted, 'encryption-secret-that-is-separate')).resolves.toEqual(RAW)
    const tampered = new Uint8Array(encrypted)
    tampered[tampered.length - 1] ^= 1
    await expect(decryptRawEmail(tampered, 'encryption-secret-that-is-separate')).rejects.toThrow()
    await expect(decryptRawEmail(encrypted, 'different-secret')).rejects.toThrow()
  })

  it('retries retryable canonical failures with bounded deterministic backoff and stable identity', async () => {
    const ingestBodies: string[] = []
    let ingestAttempts = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/email-policy')) return responseJson(policy)
      if (path.endsWith('/email-stage')) {
        return responseJson({ schemaVersion: 1, outcome: 'reserved', ingestionId: INGESTION_ID, encryptedObjectKey: OBJECT_KEY })
      }
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
      .mockImplementationOnce(async () => responseJson({ schemaVersion: 1, outcome: 'reserved', ingestionId: INGESTION_ID, encryptedObjectKey: OBJECT_KEY }))
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
        return responseJson({ schemaVersion: 1, outcome: 'reserved', ingestionId: INGESTION_ID, encryptedObjectKey: OBJECT_KEY })
      }
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
