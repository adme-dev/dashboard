import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GENERATION_OUTPUT_TIMEOUT_MS,
  MAX_GENERATION_OUTPUT_BYTES,
  readGenerationOutputDownload
} from '~~/shared/video/generationOutputDownload'

const VALID_FTYP = new Uint8Array([
  0, 0, 0, 16,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0, 0, 0, 0
])

function chunkedStream(chunks: Uint8Array[], onCancel?: () => void) {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(chunks[index++])
    },
    cancel() {
      onCancel?.()
    }
  })
}

function outputResponse(body: BodyInit | null, headers: Record<string, string> = {}, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'video/mp4', ...headers }
  })
}

describe('generation output download validation', () => {
  it('exports a fixed 32 MiB ceiling and a 30 second default deadline', () => {
    expect(MAX_GENERATION_OUTPUT_BYTES).toBe(32 * 1024 * 1024)
    expect(DEFAULT_GENERATION_OUTPUT_TIMEOUT_MS).toBe(30_000)
  })

  it('returns a minimally valid small MP4 ftyp prefix assembled from chunks', async () => {
    const response = outputResponse(chunkedStream([
      VALID_FTYP.slice(0, 5),
      VALID_FTYP.slice(5, 12),
      VALID_FTYP.slice(12)
    ]), {
      'content-type': 'video/mp4; charset=binary',
      'content-length': String(VALID_FTYP.byteLength)
    })

    const bytes = await readGenerationOutputDownload(response)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes).toEqual(VALID_FTYP)
  })

  it('rejects an empty stream', async () => {
    await expect(readGenerationOutputDownload(
      outputResponse(chunkedStream([]))
    )).rejects.toThrow('empty')
  })

  it('rejects a missing or incorrect MIME type and cancels the reader', async () => {
    const cancel = vi.fn()
    const response = outputResponse(chunkedStream([VALID_FTYP], cancel), {
      'content-type': 'application/octet-stream'
    })

    await expect(readGenerationOutputDownload(response)).rejects.toThrow('video/mp4')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each([
    VALID_FTYP.slice(0, 12),
    new Uint8Array(VALID_FTYP).fill(0, 4, 8),
    new Uint8Array([0, 0, 0, 20, ...VALID_FTYP.slice(4)])
  ])('rejects a missing or invalid ISO-BMFF ftyp header', async (bytes) => {
    await expect(readGenerationOutputDownload(
      outputResponse(chunkedStream([bytes]))
    )).rejects.toThrow('ftyp')
  })

  it('rejects a declared length above the fixed ceiling before reading the body', async () => {
    const cancel = vi.fn()
    const response = outputResponse(chunkedStream([VALID_FTYP], cancel), {
      'content-length': String(MAX_GENERATION_OUTPUT_BYTES + 1)
    })

    await expect(readGenerationOutputDownload(response)).rejects.toThrow('byte limit')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each(['-1', '1.5', 'not-a-number', '16, 16'])('rejects invalid Content-Length %s', async (value) => {
    await expect(readGenerationOutputDownload(
      outputResponse(chunkedStream([VALID_FTYP]), { 'content-length': value })
    )).rejects.toThrow('Content-Length is invalid')
  })

  it('rejects a truncated body whose declared length is longer', async () => {
    await expect(readGenerationOutputDownload(
      outputResponse(chunkedStream([VALID_FTYP]), {
        'content-length': String(VALID_FTYP.byteLength + 1)
      })
    )).rejects.toThrow('does not match Content-Length')
  })

  it('rejects a body that exceeds its declared length', async () => {
    await expect(readGenerationOutputDownload(
      outputResponse(chunkedStream([VALID_FTYP]), {
        'content-length': String(VALID_FTYP.byteLength - 1)
      })
    )).rejects.toThrow('does not match Content-Length')
  })

  it('enforces the accumulated caller-lowered limit across chunks and cancels', async () => {
    const cancel = vi.fn()
    const response = outputResponse(chunkedStream([
      VALID_FTYP,
      new Uint8Array([1]),
      new Uint8Array([2])
    ], cancel))

    await expect(readGenerationOutputDownload(response, {
      maxBytes: VALID_FTYP.byteLength
    })).rejects.toThrow('byte limit')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('does not allow the caller to raise the fixed ceiling', async () => {
    await expect(readGenerationOutputDownload(
      outputResponse(chunkedStream([VALID_FTYP])),
      { maxBytes: MAX_GENERATION_OUTPUT_BYTES + 1 }
    )).rejects.toThrow('byte limit is invalid')
  })

  it('rejects redirects and non-successful responses without exposing the URL', async () => {
    const secretUrl = 'https://private.example/output.mp4?token=secret'
    const redirectError = await readGenerationOutputDownload(Response.redirect(secretUrl, 302)).catch(error => error)
    expect(redirectError).toBeInstanceOf(Error)
    expect(redirectError.message).not.toContain(secretUrl)

    await expect(readGenerationOutputDownload(
      outputResponse(chunkedStream([VALID_FTYP]), {}, 503)
    )).rejects.toThrow('not successful')
  })

  it('times out a stalled stream and cancels it', async () => {
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel
    })
    const started = Date.now()

    await expect(readGenerationOutputDownload(outputResponse(stream), {
      timeoutMs: 20
    })).rejects.toThrow('timed out')
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('honors caller aborts while the stream is stalled', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      pull: () => new Promise<void>(() => {}),
      cancel
    })
    const pending = readGenerationOutputDownload(outputResponse(stream), { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toThrow('aborted')
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('normalizes stream failures without exposing their content', async () => {
    const secret = 'https://private.example/output.mp4?token=secret private payload'
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error(secret))
      }
    })

    const error = await readGenerationOutputDownload(outputResponse(stream)).catch(error => error)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('Generation output body could not be read')
    expect(error.message).not.toContain(secret)
  })
})
