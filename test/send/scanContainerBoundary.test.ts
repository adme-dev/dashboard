import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClamAvContainer } from '../../workers/send-scanner/src/container'

vi.mock('@cloudflare/containers', () => ({
  Container: class { ctx = undefined },
  ContainerProxy: class { ctx = undefined }
}))

const JOB_ID = '77777777-7777-4777-8777-777777777777'
const OBJECT_KEY = 'send/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555'

function source() {
  return {
    jobId: JOB_ID,
    objectKey: OBJECT_KEY,
    objectEtag: 'canonical-etag',
    expectedMimeType: 'application/pdf'
  }
}

function outboundEnvironment(overrides: Record<string, unknown> = {}) {
  const scanStub = { getScanSource: vi.fn(async () => source()) }
  const env = {
    SCAN_CONTAINER: {
      idFromString: vi.fn(() => 'container-id'),
      get: vi.fn(() => scanStub)
    },
    MEDIA_BUCKET: {
      get: vi.fn(async () => ({
        body: 'safe fixture',
        etag: 'canonical-etag',
        size: 12,
        httpMetadata: { contentType: 'application/pdf' }
      }))
    },
    ...overrides
  }
  return { env, scanStub }
}

describe('Send scanner Container boundary', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('keeps the object key out of the Container request and deletes transient state', async () => {
    const storage = {
      put: vi.fn(async () => undefined),
      delete: vi.fn(async () => true)
    }
    const containerFetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({
      schemaVersion: 1,
      jobId: JOB_ID,
      objectEtag: 'canonical-etag',
      provider: 'clamav',
      engineVersion: '1.5.3',
      signatureVersion: '27730',
      verdict: 'clean',
      reasonCode: 'NONE',
      detectedMimeType: 'application/pdf',
      activeContent: false,
      scannedAt: '2026-07-21T01:05:00.000Z'
    }), { status: 200 }))
    const scanner = Object.assign(Object.create(ClamAvContainer.prototype), {
      ctx: { storage },
      containerFetch
    }) as ClamAvContainer

    await expect(scanner.scan(source())).resolves.toMatchObject({ verdict: 'clean' })
    const requestBody = String(containerFetch.mock.calls[0]![1].body)
    expect(requestBody).not.toContain(OBJECT_KEY)
    expect(storage.put).toHaveBeenCalledWith('scanSource', source())
    expect(storage.delete).toHaveBeenCalledWith('scanSource')
  })

  it('reads only the current ETag for the source bound to that Container instance', async () => {
    const { env } = outboundEnvironment()
    const handler = ClamAvContainer.outboundByHost['send-scan.r2']!

    const response = await handler(
      new Request('http://send-scan.r2/object'),
      env as never,
      { containerId: 'durable-object-id' } as never
    )

    expect(response.status).toBe(200)
    expect(env.SCAN_CONTAINER.idFromString).toHaveBeenCalledWith('durable-object-id')
    expect(env.MEDIA_BUCKET.get).toHaveBeenCalledWith(OBJECT_KEY, {
      onlyIf: { etagMatches: 'canonical-etag' }
    })
    expect(response.headers.get('X-Object-ETag')).toBe('canonical-etag')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it.each([
    ['wrong method', new Request('http://send-scan.r2/object', { method: 'POST' })],
    ['wrong path', new Request('http://send-scan.r2/other')],
    ['query string', new Request('http://send-scan.r2/object?key=forged')]
  ])('denies R2 bridge input before reading state: %s', async (_label, request) => {
    const { env, scanStub } = outboundEnvironment()
    const handler = ClamAvContainer.outboundByHost['send-scan.r2']!

    const response = await handler(request, env as never, { containerId: 'durable-object-id' } as never)

    expect(response.status).toBe(403)
    expect(scanStub.getScanSource).not.toHaveBeenCalled()
    expect(env.MEDIA_BUCKET.get).not.toHaveBeenCalled()
  })

  it('fails closed when the canonical R2 object does not match', async () => {
    const { env } = outboundEnvironment({
      MEDIA_BUCKET: {
        get: vi.fn(async () => ({ body: 'changed', etag: 'changed-etag', size: 7 }))
      }
    })
    const handler = ClamAvContainer.outboundByHost['send-scan.r2']!

    const response = await handler(
      new Request('http://send-scan.r2/object'),
      env as never,
      { containerId: 'durable-object-id' } as never
    )

    expect(response.status).toBe(412)
  })

  it('allows only the known ClamAV signature database read paths', async () => {
    const fetchMock = vi.fn(async () => new Response('signature'))
    vi.stubGlobal('fetch', fetchMock)
    const handler = ClamAvContainer.outboundByHost['database.clamav.net']!

    expect((await handler(
      new Request('https://database.clamav.net/daily.cvd'),
      {} as never,
      {} as never
    )).status).toBe(200)
    expect((await handler(
      new Request('https://database.clamav.net/daily.cvd?redirect=evil'),
      {} as never,
      {} as never
    )).status).toBe(403)
    expect((await handler(
      new Request('https://database.clamav.net/other.cvd'),
      {} as never,
      {} as never
    )).status).toBe(403)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
