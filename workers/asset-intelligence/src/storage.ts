interface R2ReadableWritable {
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<(R2ObjectBody & { size?: number }) | null>
  put(key: string, value: ArrayBuffer | Uint8Array, options?: R2PutOptions): Promise<unknown>
}

function contentTypeOf(object: R2ObjectBody): string {
  return object.httpMetadata?.contentType || 'application/octet-stream'
}

function byteLength(bytes: ArrayBuffer | Uint8Array): number {
  return bytes instanceof Uint8Array ? bytes.byteLength : bytes.byteLength
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export async function copyR2Object(
  bucket: R2ReadableWritable,
  sourceKey: string,
  destinationKey: string
): Promise<{ r2Key: string; contentType: string; size: number }> {
  const object = await bucket.get(sourceKey)
  if (!object) throw new Error(`R2 object ${sourceKey} not found`)
  const contentType = contentTypeOf(object)
  const bytes = await object.arrayBuffer()
  await bucket.put(destinationKey, bytes, { httpMetadata: { contentType } })
  return { r2Key: destinationKey, contentType, size: object.size ?? bytes.byteLength }
}

export async function uploadJson(
  bucket: R2ReadableWritable,
  key: string,
  value: unknown
): Promise<{ r2Key: string; contentType: string; size: number }> {
  const bytes = new TextEncoder().encode(JSON.stringify(value, null, 2))
  const contentType = 'application/json'
  await bucket.put(key, bytes, { httpMetadata: { contentType } })
  return { r2Key: key, contentType, size: bytes.byteLength }
}

export async function uploadBinary(
  bucket: R2ReadableWritable,
  key: string,
  bytes: ArrayBuffer | Uint8Array,
  contentType: string
): Promise<{ r2Key: string; contentType: string; size: number }> {
  await bucket.put(key, bytes, { httpMetadata: { contentType } })
  return { r2Key: key, contentType, size: byteLength(bytes) }
}

export async function fetchAssetBytes(
  bucket: R2ReadableWritable,
  sourceAssetId: string,
  getAssetR2Key: (sourceAssetId: string) => Promise<string>
): Promise<{ dataUri: string; contentType: string }> {
  const r2Key = await getAssetR2Key(sourceAssetId)
  const object = await bucket.get(r2Key)
  if (!object) throw new Error(`R2 object ${r2Key} not found for asset ${sourceAssetId}`)
  const contentType = contentTypeOf(object)
  const bytes = new Uint8Array(await object.arrayBuffer())
  return { dataUri: `data:${contentType};base64,${base64FromBytes(bytes)}`, contentType }
}

export async function fetchObjectBytes(bucket: R2ReadableWritable, key: string): Promise<Uint8Array> {
  const object = await bucket.get(key)
  if (!object) throw new Error(`R2 object ${key} not found`)
  return new Uint8Array(await object.arrayBuffer())
}

function looksLikePicture(head: Uint8Array): boolean {
  const png = head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
  const jpeg = head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
  return png || jpeg
}

/**
 * The still an image tool can work on. Picture assets are used as they are. A video
 * is far too large to load and cannot be edited as a picture, so a still frame is
 * used instead and the caller is told: the frame the editor painted on when one was
 * saved with the mask (`paintedFrameKey`), otherwise the asset's preview frame.
 */
export async function fetchAssetPicture(
  bucket: R2ReadableWritable,
  sourceAssetId: string,
  getAssetKeys: (sourceAssetId: string) => Promise<{ r2Key: string; thumbnailKey: string | null }>,
  paintedFrameKey?: string | null
): Promise<{ bytes: Uint8Array; source: 'picture' | 'video-frame' }> {
  const keys = await getAssetKeys(sourceAssetId)
  // Read only the first bytes to tell a picture from a video before loading anything large.
  const head = await bucket.get(keys.r2Key, { range: { offset: 0, length: 16 } })
  if (!head) throw new Error(`R2 object ${keys.r2Key} not found for asset ${sourceAssetId}`)
  if (looksLikePicture(new Uint8Array(await head.arrayBuffer()))) {
    return { bytes: await fetchObjectBytes(bucket, keys.r2Key), source: 'picture' }
  }
  if (paintedFrameKey) {
    const painted = await bucket.get(paintedFrameKey)
    if (painted) {
      const frame = new Uint8Array(await painted.arrayBuffer())
      if (looksLikePicture(frame)) return { bytes: frame, source: 'video-frame' }
    }
  }
  if (!keys.thumbnailKey) {
    throw new Error('No still frame of this video was saved, so there is no picture to edit. Open it in Prepare, paint over what to erase and run it again: the frame you paint on is used.')
  }
  const frame = await fetchObjectBytes(bucket, keys.thumbnailKey)
  if (!looksLikePicture(frame)) throw new Error('The preview frame of this video is not a PNG or JPEG picture, so it cannot be edited.')
  return { bytes: frame, source: 'video-frame' }
}
