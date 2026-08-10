import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import {
  CRM_SEARCH_DEAD_LETTER_PATH,
  CRM_SEARCH_HEALTH_PATH,
  CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  CRM_SEARCH_PROCESS_PATH,
  canonicalCrmSearchIndexQueueMessage,
  type CrmSearchIndexQueueMessage,
  type CrmSearchPagesProtocolHealth
} from '../../shared/crmSearchIndexProtocol'
import {
  CRM_SEARCH_SERVICE_HEADERS,
  extractCrmSearchServiceRequest,
  parseCrmSearchServiceKeyring,
  verifyCrmSearchServiceRequest
} from '../../shared/crmSearchIndexSigning'
import {
  CRM_SEARCH_DEAD_LETTER_QUEUE_NAME,
  CRM_SEARCH_PRIMARY_QUEUE_NAME,
  CRM_SEARCH_RETRY_DELAY_SECONDS,
  consumeCrmSearchQueueBatch,
  type CrmSearchConsumerBindings,
  type CrmSearchConsumerDependencies,
  type CrmSearchQueueBatch,
  type CrmSearchQueueMessage
} from '../../workers/crm-search-consumer/src/consumer'
import {
  CRM_SEARCH_QUEUE_RETENTION_SECONDS,
  evaluateCrmSearchConsumerHealth,
  verifyCrmSearchEnvironmentResourceManifest
} from '../../workers/crm-search-consumer/src/health'

const NOW_MS = Date.parse('2026-08-10T04:05:06.000Z')
const IMPLEMENTATION_SHA = 'a'.repeat(40)
const WORKER_ARTIFACT_DIGEST = `sha256:${'b'.repeat(64)}`
const PAGES_ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`
const BINDING_MANIFEST_DIGEST = `sha256:${'d'.repeat(64)}`
const ACTIVE_SECRET = Buffer.alloc(32, 7).toString('base64url')
const PREVIOUS_SECRET = Buffer.alloc(32, 9).toString('base64url')
const RESOURCE_KEYS = generateKeyPairSync('ed25519')

const validMessage: CrmSearchIndexQueueMessage = Object.freeze({
  protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
  operationId: '123e4567-e89b-42d3-a456-426614174000',
  correlationId: '223e4567-e89b-42d3-a456-426614174000',
  enqueuedAt: '2026-08-10T04:05:00.000Z'
})

function serviceKeyring() {
  const activeNotBefore = Math.floor(NOW_MS / 1000) - 30
  return {
    activeKeyVersion: '2026-08-active',
    keys: {
      '2026-07-previous': {
        keyVersion: '2026-07-previous',
        secret: PREVIOUS_SECRET,
        status: 'previous' as const,
        notBefore: activeNotBefore - 3_600,
        notAfter: activeNotBefore + 3_600,
        overlapUntil: activeNotBefore + 3_600
      },
      '2026-08-active': {
        keyVersion: '2026-08-active',
        secret: ACTIVE_SECRET,
        status: 'active' as const,
        notBefore: activeNotBefore,
        notAfter: activeNotBefore + 86_400
      }
    }
  }
}

function resourceManifest(overrides: Record<string, unknown> = {}) {
  return {
    version: 'crm-search-environment-resource-manifest-v1',
    environment: 'production',
    issuedAt: '2026-08-10T00:00:00.000Z',
    expiresAt: '2026-08-11T00:00:00.000Z',
    readbackSource: 'cloudflare_api',
    plan: 'workers_paid',
    pages: {
      project: 'agency-dashboard',
      branch: 'main',
      origin: 'https://agency-dashboard-6cm.pages.dev'
    },
    worker: { name: 'agency-crm-search-consumer' },
    vectorize: { crmSearch: 'agency-crm-search' },
    queues: {
      primary: {
        name: CRM_SEARCH_PRIMARY_QUEUE_NAME,
        retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
      },
      deadLetter: {
        name: CRM_SEARCH_DEAD_LETTER_QUEUE_NAME,
        retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
      }
    },
    ...overrides
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`
}

function signedResourceManifest(payload = resourceManifest()): string {
  const bytes = Buffer.from(canonical(payload), 'utf8')
  return JSON.stringify({
    version: 'crm-search-environment-resource-envelope-v1',
    keyVersion: 'release-resource-2026-08',
    payload,
    payloadSha256: createHash('sha256').update(bytes).digest('hex'),
    signature: sign(null, bytes, RESOURCE_KEYS.privateKey).toString('base64url')
  })
}

function resourceVerificationKeyring(): string {
  return JSON.stringify({
    version: 'crm-search-resource-verification-keyring-v1',
    activeKeyVersion: 'release-resource-2026-08',
    keys: {
      'release-resource-2026-08': {
        algorithm: 'Ed25519',
        publicKeySpki: RESOURCE_KEYS.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
        notBefore: '2026-08-09T00:00:00.000Z',
        notAfter: '2026-08-12T00:00:00.000Z'
      }
    }
  })
}

function bindings(overrides: Partial<CrmSearchConsumerBindings> = {}): CrmSearchConsumerBindings {
  return {
    CRM_SEARCH_ENVIRONMENT: 'production',
    CRM_SEARCH_SERVICE_KEYRING: JSON.stringify(serviceKeyring()),
    CRM_SEARCH_IMPLEMENTATION_SHA: IMPLEMENTATION_SHA,
    CRM_SEARCH_WORKER_ARTIFACT_DIGEST: WORKER_ARTIFACT_DIGEST,
    CRM_SEARCH_BINDING_MANIFEST_DIGEST: BINDING_MANIFEST_DIGEST,
    CRM_SEARCH_EXPECTED_PAGES_SHA: IMPLEMENTATION_SHA,
    CRM_SEARCH_EXPECTED_PAGES_ARTIFACT_DIGEST: PAGES_ARTIFACT_DIGEST,
    CRM_SEARCH_EXPECTED_PAGES_BINDING_MANIFEST_DIGEST: BINDING_MANIFEST_DIGEST,
    CRM_SEARCH_RESOURCE_MANIFEST: signedResourceManifest(),
    CRM_SEARCH_RESOURCE_MANIFEST_VERIFICATION_KEYRING: resourceVerificationKeyring(),
    ...overrides
  }
}

function pagesHealth(overrides: Partial<CrmSearchPagesProtocolHealth> = {}): CrmSearchPagesProtocolHealth {
  return {
    status: 'ready',
    component: 'crm_search_pages',
    protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
    acceptedProtocolVersions: [CRM_SEARCH_INDEX_PROTOCOL_VERSION],
    deployedSha: IMPLEMENTATION_SHA,
    artifactDigest: PAGES_ARTIFACT_DIGEST,
    bindingManifestDigest: BINDING_MANIFEST_DIGEST,
    expectedWorker: {
      deployedSha: IMPLEMENTATION_SHA,
      artifactDigest: WORKER_ARTIFACT_DIGEST,
      bindingManifestDigest: BINDING_MANIFEST_DIGEST,
      emittedProtocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION
    },
    ...overrides
  }
}

function queueMessage(body: unknown = validMessage): CrmSearchQueueMessage {
  return {
    id: '01J4CRMSEARCH00000000000001',
    body,
    attempts: 1,
    timestamp: new Date(NOW_MS),
    ack: vi.fn(),
    retry: vi.fn()
  }
}

function batch(
  queue: string,
  messages: readonly CrmSearchQueueMessage[]
): CrmSearchQueueBatch {
  return { queue, messages }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function dependencies(
  fetch: CrmSearchConsumerDependencies['fetch']
): CrmSearchConsumerDependencies & { logs: unknown[] } {
  const logs: unknown[] = []
  return {
    fetch,
    now: () => NOW_MS,
    log: record => logs.push(record),
    logs
  }
}

describe('dedicated CRM search Queue Worker', () => {
  it('rejects unsigned or wrong-environment resource identities before Pages/provider work', async () => {
    await expect(verifyCrmSearchEnvironmentResourceManifest({
      environment: 'preview',
      envelope: JSON.stringify(resourceManifest()),
      verificationKeyring: '{}',
      nowMs: NOW_MS
    })).rejects.toThrow('crm_search_consumer_unready')

    const message = queueMessage()
    const fetch = vi.fn(async () => response(pagesHealth()))
    await consumeCrmSearchQueueBatch(
      batch('agency-crm-search-index-preview', [message]),
      bindings({
        CRM_SEARCH_ENVIRONMENT: 'preview',
        CRM_SEARCH_RESOURCE_MANIFEST: JSON.stringify(resourceManifest())
      } as never),
      dependencies(fetch)
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledOnce()
  })
  it.each(['complete', 'accepted_provider_pending', 'superseded'] as const)(
    'acknowledges a signed primary outcome of %s',
    async (status) => {
      const message = queueMessage()
      const requests: Request[] = []
      const deps = dependencies(vi.fn(async (request: Request) => {
        requests.push(request)
        return request.method === 'GET'
          ? response(pagesHealth())
          : response({ status })
      }))

      await consumeCrmSearchQueueBatch(
        batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
        bindings(),
        deps
      )

      expect(message.ack).toHaveBeenCalledOnce()
      expect(message.retry).not.toHaveBeenCalled()
      expect(requests.map(request => new URL(request.url).pathname)).toEqual([
        CRM_SEARCH_HEALTH_PATH,
        CRM_SEARCH_PROCESS_PATH
      ])

      const processRequest = requests[1]!
      const body = await processRequest.text()
      expect(body).toBe(canonicalCrmSearchIndexQueueMessage(validMessage, { nowMs: NOW_MS }))
      expect(body).not.toContain('sourceText')
      expect(processRequest.headers.get(CRM_SEARCH_SERVICE_HEADERS.keyVersion))
        .toBe('2026-08-active')

      const signed = extractCrmSearchServiceRequest(
        Object.fromEntries(processRequest.headers.entries()),
        body,
        processRequest.method,
        new URL(processRequest.url).pathname
      )
      const keyring = parseCrmSearchServiceKeyring(serviceKeyring())
      expect(signed).not.toBeNull()
      expect(keyring).not.toBeNull()
      await expect(verifyCrmSearchServiceRequest(signed, keyring!, {
        nowMs: NOW_MS,
        acceptedProtocolVersions: [CRM_SEARCH_INDEX_PROTOCOL_VERSION]
      })).resolves.toBe(true)
    }
  )

  it.each(['recorded', 'duplicate'] as const)(
    'uses the equivalent signed dead-letter path and acknowledges %s',
    async (status) => {
      const message = queueMessage()
      const requests: Request[] = []
      const deps = dependencies(vi.fn(async (request: Request) => {
        requests.push(request)
        return request.method === 'GET'
          ? response(pagesHealth())
          : response({ status })
      }))

      await consumeCrmSearchQueueBatch(
        batch(CRM_SEARCH_DEAD_LETTER_QUEUE_NAME, [message]),
        bindings(),
        deps
      )

      expect(message.ack).toHaveBeenCalledOnce()
      expect(message.retry).not.toHaveBeenCalled()
      expect(requests.map(request => new URL(request.url).pathname)).toEqual([
        CRM_SEARCH_HEALTH_PATH,
        CRM_SEARCH_DEAD_LETTER_PATH
      ])
      expect(requests[1]!.headers.get(CRM_SEARCH_SERVICE_HEADERS.keyVersion))
        .toBe('2026-08-active')
    }
  )

  it.each([
    ['transport rejection', () => Promise.reject(new Error('provider-secret-error'))],
    ['HTTP rejection', () => Promise.resolve(response({ status: 'not_ready' }, 503))],
    ['unrecognized primary outcome', () => Promise.resolve(response({ status: 'recorded' }))],
    ['non-JSON primary outcome', () => Promise.resolve(new Response('<sourceText>private</sourceText>', {
      status: 200,
      headers: { 'content-type': 'text/html' }
    }))]
  ])('retries a primary message after %s without logging raw responses', async (_name, processFetch) => {
    const message = queueMessage()
    const deps = dependencies(vi.fn(async (request: Request) => {
      return request.method === 'GET' ? response(pagesHealth()) : await processFetch()
    }))

    await consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
      bindings(),
      deps
    )

    expect(message.ack).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledOnce()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
    const logText = JSON.stringify(deps.logs)
    expect(logText).not.toContain('provider-secret-error')
    expect(logText).not.toContain('sourceText')
    expect(logText).not.toContain('private')
  })

  it('routes a malformed identifier-only envelope toward the DLQ without exposing it', async () => {
    const malformed = {
      ...validMessage,
      sourceText: 'raw CRM record that must never leave the producer boundary'
    }
    const message = queueMessage(malformed)
    const fetch = vi.fn(async () => response(pagesHealth()))
    const deps = dependencies(fetch)

    await consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
      bindings(),
      deps
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(message.ack).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
    const logText = JSON.stringify(deps.logs)
    expect(logText).not.toContain('raw CRM record')
    expect(logText).not.toContain('sourceText')
  })

  it('fails closed before forwarding when Pages release compatibility does not match', async () => {
    const first = queueMessage()
    const second = queueMessage({
      ...validMessage,
      operationId: '323e4567-e89b-42d3-a456-426614174000'
    })
    const fetch = vi.fn(async () => response(pagesHealth({
      expectedWorker: {
        ...pagesHealth().expectedWorker,
        artifactDigest: `sha256:${'e'.repeat(64)}`
      }
    })))
    const deps = dependencies(fetch)

    await consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [first, second]),
      bindings(),
      deps
    )

    expect(fetch).toHaveBeenCalledOnce()
    for (const message of [first, second]) {
      expect(message.ack).not.toHaveBeenCalled()
      expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
    }
  })

  it('rejects a noncanonical current/N-1 Pages protocol set before forwarding', async () => {
    const message = queueMessage()
    const fetch = vi.fn(async () => response(pagesHealth({
      acceptedProtocolVersions: [CRM_SEARCH_INDEX_PROTOCOL_VERSION, 65_535]
    })))

    await consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
      bindings(),
      dependencies(fetch)
    )

    expect(fetch).toHaveBeenCalledOnce()
    expect(message.ack).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
  })

  it('does not let logging failure retry an already acknowledged outcome', async () => {
    const message = queueMessage()
    const deps: CrmSearchConsumerDependencies = {
      fetch: vi.fn(async (request: Request) => request.method === 'GET'
        ? response(pagesHealth())
        : response({ status: 'complete' })),
      now: () => NOW_MS,
      log: () => { throw new Error('logging-backend-private-error') }
    }

    await expect(consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
      bindings(),
      deps
    )).resolves.toBeUndefined()

    expect(message.ack).toHaveBeenCalledOnce()
    expect(message.retry).not.toHaveBeenCalled()
  })

  it('does not let logging failure prevent a health-gated retry', async () => {
    const message = queueMessage()
    const deps: CrmSearchConsumerDependencies = {
      fetch: vi.fn(async () => response({ status: 'unready' }, 503)),
      now: () => NOW_MS,
      log: () => { throw new Error('logging-backend-private-error') }
    }

    await expect(consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
      bindings(),
      deps
    )).resolves.toBeUndefined()

    expect(message.ack).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
  })

  it('retries the DLQ message unless durable signed recording succeeds', async () => {
    const message = queueMessage()
    const deps = dependencies(vi.fn(async (request: Request) => request.method === 'GET'
      ? response(pagesHealth())
      : response({ status: 'unavailable' }, 503)))

    await consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_DEAD_LETTER_QUEUE_NAME, [message]),
      bindings(),
      deps
    )

    expect(message.ack).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
  })

  it.each([
    ['unknown retention', resourceManifest({
      queues: {
        ...resourceManifest().queues,
        primary: { name: CRM_SEARCH_PRIMARY_QUEUE_NAME, retentionSeconds: null }
      }
    })],
    ['short DLQ retention', resourceManifest({
      queues: {
        ...resourceManifest().queues,
        deadLetter: {
          name: CRM_SEARCH_DEAD_LETTER_QUEUE_NAME,
          retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS - 1
        }
      }
    })],
    ['unsupported plan', resourceManifest({ plan: 'workers_free' })]
  ])('fails readiness on %s before any Pages request', async (_name, manifest) => {
    const message = queueMessage()
    const fetch = vi.fn(async () => response(pagesHealth()))
    const deps = dependencies(fetch)

    await consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
      bindings({ CRM_SEARCH_RESOURCE_MANIFEST: signedResourceManifest(manifest) }),
      deps
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
  })

  it('rejects an expired signing key before any Pages request', async () => {
    const expired = serviceKeyring()
    expired.keys['2026-08-active'].notAfter = Math.floor(NOW_MS / 1000)
    const message = queueMessage()
    const fetch = vi.fn(async () => response(pagesHealth()))
    const deps = dependencies(fetch)

    await consumeCrmSearchQueueBatch(
      batch(CRM_SEARCH_PRIMARY_QUEUE_NAME, [message]),
      bindings({ CRM_SEARCH_SERVICE_KEYRING: JSON.stringify(expired) }),
      deps
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(message.ack).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
  })

  it('retries unknown queue bindings without contacting Pages', async () => {
    const message = queueMessage()
    const fetch = vi.fn(async () => response(pagesHealth()))

    await consumeCrmSearchQueueBatch(
      batch('agency-jobs', [message]),
      bindings(),
      dependencies(fetch)
    )

    expect(fetch).not.toHaveBeenCalled()
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: CRM_SEARCH_RETRY_DELAY_SECONDS })
  })

  it('returns ready only with exact Pages, artifact, binding, protocol, and resource evidence', async () => {
    const fetch = vi.fn(async (request: Request) => {
      expect(request.method).toBe('GET')
      expect(request.redirect).toBe('error')
      expect(new URL(request.url).pathname).toBe(CRM_SEARCH_HEALTH_PATH)
      return response(pagesHealth())
    })

    const health = await evaluateCrmSearchConsumerHealth(
      bindings(),
      { fetch, now: () => NOW_MS }
    )

    expect(health).toEqual(expect.objectContaining({
      status: 'ready',
      component: 'crm_search_consumer',
      protocolVersion: CRM_SEARCH_INDEX_PROTOCOL_VERSION,
      deployedSha: IMPLEMENTATION_SHA,
      artifactDigest: WORKER_ARTIFACT_DIGEST,
      bindingManifestDigest: BINDING_MANIFEST_DIGEST
    }))
    expect(health.resources).toEqual({
      revision: 'crm-search-resource-readback-v1',
      environment: 'production',
      plan: 'workers_paid',
      workerName: 'agency-crm-search-consumer',
      vectorizeIndex: 'agency-crm-search',
      primaryQueue: CRM_SEARCH_PRIMARY_QUEUE_NAME,
      primaryRetentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS,
      deadLetterQueue: CRM_SEARCH_DEAD_LETTER_QUEUE_NAME,
      deadLetterRetentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    })
  })
})
