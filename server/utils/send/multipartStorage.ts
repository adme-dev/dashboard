import { AwsV4Signer } from 'aws4fetch'
import { getR2StorageConfig } from '~~/server/utils/storage'

export interface MultipartStoragePart {
  partNumber: number
  sizeBytes: number
  etag: string
}

export interface R2MultipartStorageConfig {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

interface PresignPartInput {
  key: string
  uploadId: string
  partNumber: number
  expiresIn: number
  datetime?: string
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const MAX_R2_XML_BYTES = 2 * 1024 * 1024

function requireConfig(config: R2MultipartStorageConfig): void {
  if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucket) {
    throw new Error('R2 storage credentials are incomplete')
  }
}

function encodeObjectKey(key: string): string {
  const segments = key.split('/')
  if (!key || key.startsWith('/')
    || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('R2 object key is invalid')
  }
  return segments.map(encodeURIComponent).join('/')
}

function objectUrl(config: R2MultipartStorageConfig, key: string): URL {
  return new URL(
    `https://${config.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(config.bucket)}/${encodeObjectKey(key)}`
  )
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function encodeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xmlValue(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)
  return match ? decodeXml(match[1]!.trim()) : undefined
}

async function boundedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_R2_XML_BYTES) {
    throw new Error('R2 multipart response exceeded the allowed size')
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_R2_XML_BYTES) {
      await reader.cancel()
      throw new Error('R2 multipart response exceeded the allowed size')
    }
    result += decoder.decode(value, { stream: true })
  }
  return result + decoder.decode()
}

function r2Error(status: number, xml: string): Error & { code?: string } {
  const code = xmlValue(xml, 'Code') || 'R2MultipartError'
  return Object.assign(new Error(`R2 multipart request failed (${status}, ${code})`), {
    name: code,
    code
  })
}

async function requireOk(response: Response): Promise<string> {
  const xml = await boundedResponseText(response)
  if (!response.ok || xmlValue(xml, 'Code')) throw r2Error(response.status, xml)
  return xml
}

async function signedRequest(config: R2MultipartStorageConfig, input: {
  method: string
  url: URL
  headers?: HeadersInit
  body?: string
  datetime?: string
}): Promise<Request> {
  const signer = new AwsV4Signer({
    method: input.method,
    url: input.url.toString(),
    headers: input.headers,
    body: input.body,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
    datetime: input.datetime
  })
  const signed = await signer.sign()
  return new Request(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: signed.body
  })
}

export function createR2MultipartStorage(
  config: R2MultipartStorageConfig,
  fetchImpl: FetchLike = globalThis.fetch
) {
  requireConfig(config)

  return {
    async create(key: string, contentType: string): Promise<string> {
      const url = objectUrl(config, key)
      url.searchParams.set('uploads', '')
      const request = await signedRequest(config, {
        method: 'POST',
        url,
        headers: { 'Content-Type': contentType }
      })
      const xml = await requireOk(await fetchImpl(request))
      const uploadId = xmlValue(xml, 'UploadId')
      if (!uploadId) throw new Error('R2 did not return a multipart upload identifier')
      return uploadId
    },

    async presignPart(input: PresignPartInput): Promise<string> {
      const url = objectUrl(config, input.key)
      url.searchParams.set('partNumber', String(input.partNumber))
      url.searchParams.set('uploadId', input.uploadId)
      url.searchParams.set('X-Amz-Expires', String(Math.max(1, Math.min(input.expiresIn, 604800))))
      const signer = new AwsV4Signer({
        method: 'PUT',
        url: url.toString(),
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        service: 's3',
        region: 'auto',
        signQuery: true,
        datetime: input.datetime
      })
      return (await signer.sign()).url.toString()
    },

    async list(input: { key: string, uploadId: string }): Promise<MultipartStoragePart[]> {
      const parts: MultipartStoragePart[] = []
      let marker: string | undefined
      let pageCount = 0

      do {
        pageCount += 1
        if (pageCount > 10) throw new Error('R2 multipart part list exceeded 10,000 parts')
        const requestedMarker = marker
        const url = objectUrl(config, input.key)
        url.searchParams.set('uploadId', input.uploadId)
        url.searchParams.set('max-parts', '1000')
        if (marker) url.searchParams.set('part-number-marker', marker)
        const request = await signedRequest(config, { method: 'GET', url })
        const xml = await requireOk(await fetchImpl(request))

        for (const match of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
          const partNumber = Number(xmlValue(match[1]!, 'PartNumber'))
          const sizeBytes = Number(xmlValue(match[1]!, 'Size'))
          const etag = xmlValue(match[1]!, 'ETag')
          if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10000
            || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !etag) {
            throw new Error('R2 returned incomplete multipart part metadata')
          }
          parts.push({ partNumber, sizeBytes, etag })
        }

        const truncated = xmlValue(xml, 'IsTruncated') === 'true'
        marker = truncated ? xmlValue(xml, 'NextPartNumberMarker') : undefined
        if (truncated && (!marker || marker === requestedMarker)) {
          throw new Error('R2 returned a truncated multipart list without a continuation marker')
        }
      } while (marker)

      return parts.sort((left, right) => left.partNumber - right.partNumber)
    },

    async complete(input: {
      key: string
      uploadId: string
      parts: MultipartStoragePart[]
    }): Promise<void> {
      const url = objectUrl(config, input.key)
      url.searchParams.set('uploadId', input.uploadId)
      const partXml = [...input.parts]
        .sort((left, right) => left.partNumber - right.partNumber)
        .map(part => `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>${encodeXml(part.etag)}</ETag></Part>`)
        .join('')
      const body = `<CompleteMultipartUpload>${partXml}</CompleteMultipartUpload>`
      const request = await signedRequest(config, {
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/xml' },
        body
      })
      await requireOk(await fetchImpl(request))
    },

    async abort(input: { key: string, uploadId: string }): Promise<void> {
      const url = objectUrl(config, input.key)
      url.searchParams.set('uploadId', input.uploadId)
      const request = await signedRequest(config, { method: 'DELETE', url })
      await requireOk(await fetchImpl(request))
    }
  }
}

function defaultStorage() {
  return createR2MultipartStorage(getR2StorageConfig())
}

export async function createMultipartObject(key: string, contentType: string): Promise<string> {
  return defaultStorage().create(key, contentType)
}

export async function getPresignedMultipartPartUrl(input: {
  key: string
  uploadId: string
  partNumber: number
  expiresIn: number
}): Promise<string> {
  return defaultStorage().presignPart(input)
}

export async function listMultipartObjectParts(input: {
  key: string
  uploadId: string
}): Promise<MultipartStoragePart[]> {
  return defaultStorage().list(input)
}

export async function completeMultipartObject(input: {
  key: string
  uploadId: string
  parts: MultipartStoragePart[]
}): Promise<void> {
  await defaultStorage().complete(input)
}

export async function abortMultipartObject(input: {
  key: string
  uploadId: string
}): Promise<void> {
  await defaultStorage().abort(input)
}

export function isMultipartUploadMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: string, Code?: string, code?: string }
  return candidate.name === 'NoSuchUpload'
    || candidate.Code === 'NoSuchUpload'
    || candidate.code === 'NoSuchUpload'
}
