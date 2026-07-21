import { afterEach, describe, expect, it, vi } from 'vitest'

const config = {
  accountId: 'account-id',
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  bucket: 'agency-files'
}

const key = 'send/44444444-4444-4444-8444-444444444444/file with spaces.mov'

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/xml' }
  })
}

describe('workerd-safe R2 multipart storage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates a multipart upload with a signed fetch request and decodes its identifier', async () => {
    const fetchImpl = vi.fn(async () => xmlResponse(`
      <InitiateMultipartUploadResult>
        <UploadId>upload&amp;id</UploadId>
      </InitiateMultipartUploadResult>
    `))
    const { createR2MultipartStorage } = await import('../../server/utils/send/multipartStorage')
    const storage = createR2MultipartStorage(config, fetchImpl)

    await expect(storage.create(key, 'video/quicktime')).resolves.toBe('upload&id')

    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(request.url).toContain('/agency-files/send/44444444-4444-4444-8444-444444444444/file%20with%20spaces.mov?')
    expect(new URL(request.url).searchParams.has('uploads')).toBe(true)
    expect(request.headers.get('Authorization')).toMatch(/^AWS4-HMAC-SHA256 /)
    expect(request.headers.get('Content-Type')).toBe('video/quicktime')
  })

  it('presigns only the requested upload part without making a network request', async () => {
    const fetchImpl = vi.fn()
    const { createR2MultipartStorage } = await import('../../server/utils/send/multipartStorage')
    const storage = createR2MultipartStorage(config, fetchImpl)

    const signed = new URL(await storage.presignPart({
      key,
      uploadId: 'upload/id',
      partNumber: 7,
      expiresIn: 300,
      datetime: '20260721T000000Z'
    }))

    expect(signed.searchParams.get('uploadId')).toBe('upload/id')
    expect(signed.searchParams.get('partNumber')).toBe('7')
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(signed.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects traversal-like object key segments before signing a control-plane request', async () => {
    const fetchImpl = vi.fn()
    const { createR2MultipartStorage } = await import('../../server/utils/send/multipartStorage')
    const storage = createR2MultipartStorage(config, fetchImpl)

    await expect(storage.create('send/transfer/../outside', 'application/octet-stream'))
      .rejects.toThrow('object key is invalid')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('lists every canonical part across bounded R2 pages', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(xmlResponse(`
        <ListPartsResult>
          <IsTruncated>true</IsTruncated>
          <NextPartNumberMarker>2</NextPartNumberMarker>
          <Part><PartNumber>1</PartNumber><ETag>&quot;etag-1&quot;</ETag><Size>16777216</Size></Part>
          <Part><PartNumber>2</PartNumber><ETag>&quot;etag-2&quot;</ETag><Size>16777216</Size></Part>
        </ListPartsResult>
      `))
      .mockResolvedValueOnce(xmlResponse(`
        <ListPartsResult>
          <IsTruncated>false</IsTruncated>
          <Part><PartNumber>3</PartNumber><ETag>&quot;etag-3&quot;</ETag><Size>9437184</Size></Part>
        </ListPartsResult>
      `))
    const { createR2MultipartStorage } = await import('../../server/utils/send/multipartStorage')
    const storage = createR2MultipartStorage(config, fetchImpl)

    await expect(storage.list({ key, uploadId: 'upload-id' })).resolves.toEqual([
      { partNumber: 1, sizeBytes: 16777216, etag: '"etag-1"' },
      { partNumber: 2, sizeBytes: 16777216, etag: '"etag-2"' },
      { partNumber: 3, sizeBytes: 9437184, etag: '"etag-3"' }
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const secondRequest = fetchImpl.mock.calls[1]![0] as Request
    expect(new URL(secondRequest.url).searchParams.get('part-number-marker')).toBe('2')
  })

  it('rejects a truncated response that repeats its continuation marker', async () => {
    const repeatedPage = xmlResponse(`
      <ListPartsResult>
        <IsTruncated>true</IsTruncated>
        <NextPartNumberMarker>1</NextPartNumberMarker>
        <Part><PartNumber>1</PartNumber><ETag>etag-1</ETag><Size>16777216</Size></Part>
      </ListPartsResult>
    `)
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(repeatedPage)
      .mockResolvedValueOnce(xmlResponse(await repeatedPage.clone().text()))
    const { createR2MultipartStorage } = await import('../../server/utils/send/multipartStorage')
    const storage = createR2MultipartStorage(config, fetchImpl)

    await expect(storage.list({ key, uploadId: 'upload-id' }))
      .rejects.toThrow('continuation marker')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('completes with sorted canonical parts and escapes R2 ETags', async () => {
    const fetchImpl = vi.fn(async () => xmlResponse('<CompleteMultipartUploadResult />'))
    const { createR2MultipartStorage } = await import('../../server/utils/send/multipartStorage')
    const storage = createR2MultipartStorage(config, fetchImpl)

    await storage.complete({
      key,
      uploadId: 'upload-id',
      parts: [
        { partNumber: 2, sizeBytes: 5, etag: '"etag&2"' },
        { partNumber: 1, sizeBytes: 5, etag: '"etag<1>"' }
      ]
    })

    const request = fetchImpl.mock.calls[0]![0] as Request
    expect(request.method).toBe('POST')
    await expect(request.clone().text()).resolves.toBe(
      '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>&quot;etag&lt;1&gt;&quot;</ETag></Part><Part><PartNumber>2</PartNumber><ETag>&quot;etag&amp;2&quot;</ETag></Part></CompleteMultipartUpload>'
    )
  })

  it('normalizes a missing upload response for idempotent recovery', async () => {
    const fetchImpl = vi.fn(async () => xmlResponse(
      '<Error><Code>NoSuchUpload</Code><Message>not found</Message></Error>',
      404
    ))
    const { createR2MultipartStorage, isMultipartUploadMissing } = await import('../../server/utils/send/multipartStorage')
    const storage = createR2MultipartStorage(config, fetchImpl)

    const error = await storage.abort({ key, uploadId: 'missing' }).catch(candidate => candidate)
    expect(isMultipartUploadMissing(error)).toBe(true)
    expect(error).toEqual(expect.objectContaining({ name: 'NoSuchUpload', code: 'NoSuchUpload' }))
    expect(String(error)).not.toContain('secret-key')
  })
})
