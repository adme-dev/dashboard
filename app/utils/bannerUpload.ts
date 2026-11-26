import { isAmbiguousApiFailure } from '~/utils/apiError'
import {
  canonicalBannerAssetIdentity,
  serializeBannerAssetIdentity
} from '~~/shared/utils/bannerAssetIdentity'

export interface PreparedBannerUploadRequest {
  body: FormData
  headers: Record<string, string>
}

export type BannerUploadOutcome<T>
  = | { ok: true, ambiguous: false, file: File, value: T }
    | { ok: false, ambiguous: boolean, file: File, error: unknown }

export type BannerUploadSender<T> = (
  request: PreparedBannerUploadRequest,
  file: File
) => Promise<T>

interface BannerUploadSessionOptions {
  nextKey?: () => string
}

async function sha256Hex(value: BufferSource): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function nextBannerUploadKey(): string {
  return `banner-upload:${globalThis.crypto.randomUUID()}`
}

// Some manufacturer sites deliver a still AVIF under a PNG or JPEG filename.
async function avifToPng(file: File): Promise<File> {
  if (file.size > 20 * 1024 * 1024) throw new Error('This image exceeds the 20 MiB upload limit.')
  const bitmap = await createImageBitmap(file.slice(0, file.size, 'image/avif'))
  try {
    if (bitmap.width * bitmap.height > 32_000_000) throw new Error('Please resize this AVIF image before uploading.')
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare this image. Export it as PNG and try again.')
    context.drawImage(bitmap, 0, 0)
    const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!png || png.size > 20 * 1024 * 1024) throw new Error('Please export a smaller PNG and try again.')
    return new File([png], file.name.replace(/\.[^.]+$/, '') + '.png', { type: 'image/png', lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

export async function prepareBannerUploadRequest(file: File, key: string, clientId?: string | null): Promise<PreparedBannerUploadRequest> {
  let bytes = new Uint8Array(await file.arrayBuffer())
  if (String.fromCharCode(...bytes.subarray(4, 12)) === 'ftypavif') {
    file = await avifToPng(file)
    bytes = new Uint8Array(await file.arrayBuffer())
  }
  const contentSha256 = await sha256Hex(bytes)
  const identity = canonicalBannerAssetIdentity({
    bytes,
    filename: file.name,
    claimedMimeType: file.type,
    contentSha256
  })
  const requestDigest = await sha256Hex(new TextEncoder().encode(serializeBannerAssetIdentity(identity, clientId)))
  const body = new FormData()
  body.append('file', file)
  if (clientId) body.append('clientId', clientId.toLowerCase())

  return {
    body,
    headers: {
      'Idempotency-Key': key,
      'X-Banner-Upload-Digest': requestDigest
    }
  }
}

export function createBannerUploadSession(options: BannerUploadSessionOptions = {}) {
  const keyFactory = options.nextKey ?? nextBannerUploadKey
  let currentKey = keyFactory()
  let retainedDigest: string | null = null
  let tail = Promise.resolve()

  function rotate() {
    retainedDigest = null
    currentKey = keyFactory()
  }

  async function execute<T>(file: File, send: BannerUploadSender<T>): Promise<BannerUploadOutcome<T>> {
    let request: PreparedBannerUploadRequest
    try {
      request = await prepareBannerUploadRequest(file, currentKey)
    } catch (error: unknown) {
      rotate()
      return { ok: false, ambiguous: false, file, error }
    }

    const digest = request.headers['X-Banner-Upload-Digest']
    if (retainedDigest && retainedDigest !== digest) rotate()
    request.headers['Idempotency-Key'] = currentKey

    try {
      const value = await send(request, file)
      rotate()
      return { ok: true, ambiguous: false, file, value }
    } catch (error: unknown) {
      const ambiguous = isAmbiguousApiFailure(error)
      if (ambiguous) retainedDigest = digest
      else rotate()
      return { ok: false, ambiguous, file, error }
    }
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation)
    tail = result.then(() => undefined, () => undefined)
    return result
  }

  return {
    attempt<T>(file: File, send: BannerUploadSender<T>): Promise<BannerUploadOutcome<T>> {
      return enqueue(async () => await execute(file, send))
    },
    attemptFiles<T>(files: FileList | File[], send: BannerUploadSender<T>): Promise<Array<BannerUploadOutcome<T>>> {
      return enqueue(async () => {
        const outcomes: Array<BannerUploadOutcome<T>> = []
        for (const file of files) {
          const outcome = await execute(file, send)
          outcomes.push(outcome)
          if (!outcome.ok && outcome.ambiguous) break
        }
        return outcomes
      })
    }
  }
}
