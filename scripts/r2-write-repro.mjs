// Reproduce the uploadFile() R2 PutObject path with the local .env creds, then read it back.
import { readFileSync } from 'node:fs'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { FetchHttpHandler } from '@smithy/fetch-http-handler'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)

const ACCOUNT = env.R2_ACCOUNT_ID, AK = env.R2_ACCESS_KEY_ID, SK = env.R2_SECRET_ACCESS_KEY
const BUCKET = env.R2_BUCKET_NAME || 'agency-files'
console.log('creds present:', { account: !!ACCOUNT, ak: !!AK, sk: !!SK, bucket: BUCKET, accountId: ACCOUNT })

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: AK, secretAccessKey: SK },
  requestHandler: new FetchHttpHandler(),
})

const key = `video-gen-sources/agency/_repro-${Date.now()}.txt`
const body = Buffer.from('hello-r2-repro')

try {
  const put = await client.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'text/plain' }))
  console.log('PutObject OK; httpStatus =', put.$metadata?.httpStatusCode)
} catch (e) {
  console.error('PutObject THREW:', e?.name, e?.message)
  process.exit(2)
}

try {
  const head = await client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
  console.log('HeadObject OK; size =', head.ContentLength, '→ object PERSISTED at', key)
} catch (e) {
  console.error('HeadObject FAILED (object did NOT persist):', e?.name, e?.message)
  process.exit(3)
}
