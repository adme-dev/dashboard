import { describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import {
  assertDesignMutationRequest,
  readBoundedJson
} from '../../server/utils/email-marketing/designRequest'

const defaultOrigin = 'https://app.xeroflow.io'
const jsonHeaders = { 'content-type': 'application/json', 'origin': defaultOrigin }

function request(
  headers: Record<string, string> = jsonHeaders,
  body?: ReadableStream<Uint8Array>
): H3Event {
  return {
    method: 'POST',
    _requestBody: body,
    node: { req: { headers } }
  } as unknown as H3Event
}

function body(
  chunks: Uint8Array[],
  close = true
): { stream: ReadableStream<Uint8Array>, cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      if (close) controller.close()
    },
    cancel
  })
  return { stream, cancel }
}

describe('assertDesignMutationRequest', () => {
  it('accepts case-insensitive JSON with an optional UTF-8 charset', () => {
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'Application/JSON ; charset=UTF-8',
      'origin': defaultOrigin
    }))).not.toThrow()
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json'
    }))).not.toThrow()
  })

  it.each([
    undefined,
    'text/plain',
    'application/ld+json',
    'application/json; charset=utf-16',
    'application/json; boundary=unexpected'
  ])('rejects unsupported content type %s with 415', (contentType) => {
    const headers: Record<string, string> = { origin: defaultOrigin }
    if (contentType !== undefined) headers['content-type'] = contentType
    expect(() => assertDesignMutationRequest(request(headers))).toThrowError(
      expect.objectContaining({ statusCode: 415, statusMessage: 'json_required' })
    )
  })

  it('allows server callers without Origin but rejects cross-site fetch metadata', () => {
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json'
    }))).not.toThrow()
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json',
      'sec-fetch-site': 'Cross-Site'
    }))).toThrowError(expect.objectContaining({
      statusCode: 403,
      statusMessage: 'design_origin_denied'
    }))
  })

  it.each([
    'https://attacker.example',
    'null',
    'not-an-origin',
    'https://app.xeroflow.io/',
    'https://app.xeroflow.io/path'
  ])('rejects null, malformed, non-exact, or cross-origin Origin %s', (origin) => {
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json',
      origin
    }))).toThrowError(expect.objectContaining({
      statusCode: 403,
      statusMessage: 'design_origin_denied'
    }))
  })

  it('honors only the exact explicitly configured HTTPS origin', () => {
    const configured = 'https://staging.xeroflow.io'
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json',
      'origin': configured
    }), configured)).not.toThrow()
    expect(() => assertDesignMutationRequest(request(), configured)).toThrowError(
      expect.objectContaining({ statusCode: 403, statusMessage: 'design_origin_denied' })
    )
  })

  it('permits HTTP localhost only through explicit configuration', () => {
    const configured = 'http://localhost:3000'
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json',
      'origin': configured
    }), configured)).not.toThrow()
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json',
      'origin': defaultOrigin
    }), configured)).toThrowError(expect.objectContaining({ statusCode: 403 }))
  })

  it.each([
    '',
    null,
    42,
    'not-a-url',
    'http://app.xeroflow.io',
    'https://user:pass@app.xeroflow.io',
    'https://@app.xeroflow.io',
    'https://app.xeroflow.io/path',
    'https://app.xeroflow.io/path/..',
    'https://app.xeroflow.io/./',
    'https://app.xeroflow.io?target=other',
    'https://app.xeroflow.io?',
    'https://app.xeroflow.io#fragment',
    'https://app.xeroflow.io#'
  ])('fails closed for invalid configured origin %s', (configured) => {
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json'
    }), configured)).toThrowError(expect.objectContaining({
      statusCode: 503,
      statusMessage: 'design_origin_unavailable'
    }))
  })

  it('never derives trust from Host or forwarded headers', () => {
    expect(() => assertDesignMutationRequest(request({
      'content-type': 'application/json',
      'origin': defaultOrigin,
      'host': 'attacker.example',
      'x-forwarded-host': 'attacker.example',
      'forwarded': 'host=attacker.example;proto=https'
    }))).not.toThrow()
  })
})

describe('readBoundedJson streaming compatibility', () => {
  it('decodes UTF-8 across one-byte chunks at the exact byte limit', async () => {
    const value = { message: 'Hello 😀 世界', ok: true }
    const bytes = new TextEncoder().encode(JSON.stringify(value))
    const chunks = Array.from(bytes, byte => Uint8Array.of(byte))
    const fixture = body(chunks)
    await expect(readBoundedJson(request(jsonHeaders, fixture.stream), bytes.byteLength))
      .resolves.toEqual(value)
    expect(fixture.stream.locked).toBe(false)
  })

  it('counts UTF-8 bytes rather than JavaScript string length', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify('😀'))
    const fixture = body([bytes], false)
    await expect(readBoundedJson(request(jsonHeaders, fixture.stream), bytes.byteLength - 1))
      .rejects.toMatchObject({ statusCode: 413, statusMessage: 'design_request_too_large' })
    expect(fixture.cancel).toHaveBeenCalledOnce()
    expect(fixture.stream.locked).toBe(false)
  })

  it('cancels a chunked stream immediately when accumulated bytes exceed the limit', async () => {
    const fixture = body([
      Uint8Array.of(0x7b, 0x7d),
      Uint8Array.of(0x20, 0x20, 0x20),
      Uint8Array.of(0x20)
    ], false)
    await expect(readBoundedJson(request(jsonHeaders, fixture.stream), 3))
      .rejects.toMatchObject({ statusCode: 413 })
    expect(fixture.cancel).toHaveBeenCalledOnce()
    expect(fixture.stream.locked).toBe(false)
  })

  it('rejects malformed UTF-8 and JSON while releasing the reader', async () => {
    const malformedUtf8 = body([Uint8Array.of(0x22, 0xff, 0x22)])
    await expect(readBoundedJson(request(jsonHeaders, malformedUtf8.stream), 20))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_body' })
    expect(malformedUtf8.stream.locked).toBe(false)

    const malformedJson = body([new TextEncoder().encode('{')])
    await expect(readBoundedJson(request(jsonHeaders, malformedJson.stream), 20))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_body' })
    expect(malformedJson.stream.locked).toBe(false)
  })

  it('retains the absent-body error contract', async () => {
    const event = Object.assign(request(jsonHeaders), { method: 'GET' })
    await expect(readBoundedJson(event, 20))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_body' })
  })
})
