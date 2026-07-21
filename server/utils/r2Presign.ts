import { AwsV4Signer } from 'aws4fetch'

export interface R2PresignInput {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  key: string
  method: 'GET' | 'PUT'
  expiresIn: number
  responseContentDisposition?: string
  datetime?: string
}

function encodeObjectKey(key: string): string {
  const segments = key.split('/')
  if (!key || key.startsWith('/')
    || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('R2 object key is invalid')
  }
  return segments.map(encodeURIComponent).join('/')
}

/** Generate a workerd-native R2 SigV4 query URL without constructing Node's S3 client. */
export async function createR2PresignedObjectUrl(input: R2PresignInput): Promise<string> {
  if (!input.accountId || !input.accessKeyId || !input.secretAccessKey || !input.bucket) {
    throw new Error('R2 storage credentials are incomplete')
  }
  const url = new URL(
    `https://${input.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(input.bucket)}/${encodeObjectKey(input.key)}`
  )
  url.searchParams.set('X-Amz-Expires', String(Math.max(1, Math.min(input.expiresIn, 604800))))
  if (input.responseContentDisposition) {
    url.searchParams.set('response-content-disposition', input.responseContentDisposition)
  }

  const signer = new AwsV4Signer({
    method: input.method,
    url: url.toString(),
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    service: 's3',
    region: 'auto',
    signQuery: true,
    datetime: input.datetime
  })
  return (await signer.sign()).url.toString()
}
