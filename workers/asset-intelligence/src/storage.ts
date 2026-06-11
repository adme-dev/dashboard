interface R2ReadableWritable {
  get(key: string): Promise<(R2ObjectBody & { size?: number }) | null>
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
