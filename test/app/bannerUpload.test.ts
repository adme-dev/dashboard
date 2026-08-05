// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  createBannerUploadSession,
  nextBannerUploadKey,
  prepareBannerUploadRequest
} from '~~/app/utils/bannerUpload'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00])

function jpegFile(name = 'Leap Motor.jpg', bytes = JPEG, type = 'image/jpeg') {
  return new File([bytes], name, { type })
}

function keyFactory(...keys: string[]) {
  const nextKey = vi.fn()
  keys.forEach(key => nextKey.mockReturnValueOnce(key))
  return nextKey
}

describe('banner upload browser identity', () => {
  it('hashes the canonical validated upload identity and sends stable headers', async () => {
    const file = jpegFile()

    const request = await prepareBannerUploadRequest(file, 'banner-upload:fixed-key')

    expect(request.headers['Idempotency-Key']).toBe('banner-upload:fixed-key')
    expect(request.headers['X-Banner-Upload-Digest']).toBe('1307bf4656c0f9129952749e619ce5f7640ec31b324f38ecb94a1ec63197d7e1')
    expect(request.body.get('file')).toBe(file)
  })

  it('detects supported bytes when the browser omits the claimed MIME type', async () => {
    const request = await prepareBannerUploadRequest(jpegFile('Leap Motor.JPG', JPEG, ''), 'banner-upload:empty-mime')

    expect(request.headers['X-Banner-Upload-Digest']).toBe('1307bf4656c0f9129952749e619ce5f7640ec31b324f38ecb94a1ec63197d7e1')
  })

  it('rejects a nonempty browser MIME claim that differs from the detected bytes', async () => {
    const gifBytes = new TextEncoder().encode('GIF89a')

    await expect(prepareBannerUploadRequest(
      new File([gifBytes], 'Leap Motor.jpg', { type: 'image/jpeg' }),
      'banner-upload:mismatch'
    )).rejects.toThrow(/does not match/i)
  })

  it('generates a fresh namespaced key for each selected upload', () => {
    const first = nextBannerUploadKey()
    const second = nextBannerUploadKey()

    expect(first).toMatch(/^banner-upload:[0-9a-f-]{36}$/)
    expect(second).toMatch(/^banner-upload:[0-9a-f-]{36}$/)
    expect(second).not.toBe(first)
  })
})

describe('banner upload session lifecycle', () => {
  it('retains an ambiguous key and reuses it for a new File with the same canonical digest', async () => {
    const nextKey = keyFactory('banner-upload:key-1', 'banner-upload:key-2')
    const session = createBannerUploadSession({ nextKey })
    const sentKeys: string[] = []

    const first = await session.attempt(jpegFile(), async (request) => {
      sentKeys.push(request.headers['Idempotency-Key'])
      throw new TypeError('Failed to fetch')
    })
    const retry = await session.attempt(jpegFile(), async (request) => {
      sentKeys.push(request.headers['Idempotency-Key'])
      return { id: 'asset-1' }
    })

    expect(first).toMatchObject({ ok: false, ambiguous: true })
    expect(retry).toMatchObject({ ok: true, value: { id: 'asset-1' } })
    expect(sentKeys).toEqual(['banner-upload:key-1', 'banner-upload:key-1'])
  })

  it.each([
    ['success', async () => ({ id: 'asset-1' })],
    ['authoritative HTTP failure', async () => { throw { statusCode: 409 } }]
  ])('rotates after %s', async (_case, firstSend) => {
    const session = createBannerUploadSession({
      nextKey: keyFactory('banner-upload:key-1', 'banner-upload:key-2', 'banner-upload:key-3')
    })
    const sentKeys: string[] = []

    await session.attempt(jpegFile(), async (request) => {
      sentKeys.push(request.headers['Idempotency-Key'])
      return await firstSend()
    })
    await session.attempt(jpegFile(), async (request) => {
      sentKeys.push(request.headers['Idempotency-Key'])
      return { id: 'asset-2' }
    })

    expect(sentKeys).toEqual(['banner-upload:key-1', 'banner-upload:key-2'])
  })

  it('rotates after local request preparation fails', async () => {
    const session = createBannerUploadSession({
      nextKey: keyFactory('banner-upload:key-1', 'banner-upload:key-2', 'banner-upload:key-3')
    })
    const send = vi.fn(async request => request.headers['Idempotency-Key'])

    const invalid = await session.attempt(
      new File(['not an image'], 'Leap Motor.jpg', { type: 'image/jpeg' }),
      send
    )
    const valid = await session.attempt(jpegFile(), send)

    expect(invalid).toMatchObject({ ok: false, ambiguous: false })
    expect(valid).toMatchObject({ ok: true, value: 'banner-upload:key-2' })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('rotates before sending different content after an ambiguous failure', async () => {
    const session = createBannerUploadSession({
      nextKey: keyFactory('banner-upload:key-1', 'banner-upload:key-2', 'banner-upload:key-3')
    })
    const sentKeys: string[] = []

    await session.attempt(jpegFile(), async (request) => {
      sentKeys.push(request.headers['Idempotency-Key'])
      throw new TypeError('connection lost')
    })
    await session.attempt(
      jpegFile('Different Car.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0x01])),
      async (request) => {
        sentKeys.push(request.headers['Idempotency-Key'])
        return { id: 'asset-2' }
      }
    )

    expect(sentKeys).toEqual(['banner-upload:key-1', 'banner-upload:key-2'])
  })

  it('serializes overlapping hashing and network attempts', async () => {
    const session = createBannerUploadSession({
      nextKey: keyFactory('banner-upload:key-1', 'banner-upload:key-2', 'banner-upload:key-3')
    })
    const order: string[] = []
    let releaseFirst!: () => void
    let markFirstStarted!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = session.attempt(jpegFile(), async () => {
      order.push('first:start')
      markFirstStarted()
      await firstGate
      order.push('first:end')
      return 'first'
    })
    await firstStarted
    const second = session.attempt(
      jpegFile('Second Car.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0x02])),
      async () => {
        order.push('second:start')
        return 'second'
      }
    )

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second:start'])
  })

  it('stops a multi-file selection on ambiguity and retains that exact digest for retry', async () => {
    const session = createBannerUploadSession({
      nextKey: keyFactory('banner-upload:key-1', 'banner-upload:key-2', 'banner-upload:key-3')
    })
    const files = [
      jpegFile('First Car.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0x01])),
      jpegFile('Second Car.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0x02])),
      jpegFile('Third Car.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0x03]))
    ]
    const sent: Array<{ name: string, key: string }> = []

    const outcomes = await session.attemptFiles(files, async (request, file) => {
      sent.push({ name: file.name, key: request.headers['Idempotency-Key'] })
      if (file.name === 'Second Car.jpg') throw new TypeError('connection lost')
      return { id: file.name }
    })
    await session.attempt(jpegFile('Second Car.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0x02])), async (request, file) => {
      sent.push({ name: file.name, key: request.headers['Idempotency-Key'] })
      return { id: file.name }
    })

    expect(outcomes).toHaveLength(2)
    expect(outcomes[1]).toMatchObject({ ok: false, ambiguous: true })
    expect(sent).toEqual([
      { name: 'First Car.jpg', key: 'banner-upload:key-1' },
      { name: 'Second Car.jpg', key: 'banner-upload:key-2' },
      { name: 'Second Car.jpg', key: 'banner-upload:key-2' }
    ])
  })
})
