import { describe, expect, it } from 'vitest'
import { createR2PresignedObjectUrl } from '../../server/utils/r2Presign'

describe('R2 presigned object URLs', () => {
  it('creates a bounded SigV4 upload URL with encoded object paths', async () => {
    const signed = new URL(await createR2PresignedObjectUrl({
      accountId: 'account',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      bucket: 'agency-files',
      key: 'send/transfer/file name.txt',
      method: 'PUT',
      expiresIn: 999999,
      datetime: '20260721T050000Z'
    }))

    expect(signed.hostname).toBe('account.r2.cloudflarestorage.com')
    expect(signed.pathname).toBe('/agency-files/send/transfer/file%20name.txt')
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('604800')
    expect(signed.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(signed.searchParams.get('X-Amz-Credential')).toBe('access/20260721/auto/s3/aws4_request')
    expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
  })

  it('signs attachment response metadata for downloads', async () => {
    const signed = new URL(await createR2PresignedObjectUrl({
      accountId: 'account',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      bucket: 'agency-files',
      key: 'send/transfer/report.pdf',
      method: 'GET',
      expiresIn: 60,
      responseContentDisposition: 'attachment; filename="report.pdf"',
      datetime: '20260721T050000Z'
    }))

    expect(signed.searchParams.get('response-content-disposition'))
      .toBe('attachment; filename="report.pdf"')
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('60')
  })

  it('rejects traversal-like object key segments before URL normalization', async () => {
    await expect(createR2PresignedObjectUrl({
      accountId: 'account',
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      bucket: 'agency-files',
      key: 'send/transfer/../outside',
      method: 'GET',
      expiresIn: 60
    })).rejects.toThrow('object key is invalid')
  })
})
