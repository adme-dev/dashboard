import { createHash } from 'node:crypto'
import {
  canonicalBannerAssetIdentity,
  serializeBannerAssetIdentity,
  type BannerAssetIdentity,
  type SupportedBannerAssetMime
} from '~~/shared/utils/bannerAssetIdentity'

export const MAX_BANNER_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_BANNER_VIDEO_BYTES = 100 * 1024 * 1024

export interface ValidatedBannerAssetUpload {
  buffer: Buffer
  fileName: string
  mimeType: SupportedBannerAssetMime
  size: number
  requestDigest: string
}

export interface BannerAssetUploadFile {
  filename?: string
  type?: string
  data: Uint8Array | Buffer
}

export function digestBannerAssetUpload(input: BannerAssetIdentity): string {
  return createHash('sha256').update(serializeBannerAssetIdentity(input)).digest('hex')
}

export function validateBannerAssetUpload(file: BannerAssetUploadFile): ValidatedBannerAssetUpload {
  if (file.data.byteLength > MAX_BANNER_VIDEO_BYTES) {
    throw new Error('Banner asset upload exceeds the 100 MiB limit')
  }

  const buffer = Buffer.from(file.data)
  if (buffer.length === 0) throw new Error('Banner asset upload is empty')

  const contentSha256 = createHash('sha256').update(buffer).digest('hex')
  const identity = canonicalBannerAssetIdentity({
    bytes: buffer,
    filename: file.filename,
    claimedMimeType: file.type,
    contentSha256
  })

  const maximumSize = identity.mimeType.startsWith('image/') ? MAX_BANNER_IMAGE_BYTES : MAX_BANNER_VIDEO_BYTES
  if (buffer.length > maximumSize) {
    throw new Error(`Banner ${identity.mimeType.startsWith('image/') ? 'image' : 'video'} exceeds the ${maximumSize / 1024 / 1024} MiB limit`)
  }

  return {
    buffer,
    fileName: identity.fileName,
    mimeType: identity.mimeType,
    size: identity.size,
    requestDigest: digestBannerAssetUpload(identity)
  }
}
