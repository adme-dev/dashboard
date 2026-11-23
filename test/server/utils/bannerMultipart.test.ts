import { expect, it } from 'vitest'
import { parseBannerMultipart } from '~~/server/utils/banner/multipart'

const boundary = '----BannerBoundary123'
const contentType = `multipart/form-data; boundary=${boundary}`
function body(data: Buffer) {
  return Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="original-video.mp4"\r\nContent-Type: video/mp4\r\n\r\n`), data,
    Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="clientId"\r\n\r\nclient-uuid\r\n--${boundary}--\r\n`)])
}
it('retains a 22 MiB video as a byte view with exact bytes and client scope', () => {
  const data = Buffer.alloc(22 * 1024 * 1024, 0x79)
  const raw = body(data)
  const parts = parseBannerMultipart(raw, contentType)
  expect(parts[0]).toMatchObject({ name: 'file', filename: 'original-video.mp4', type: 'video/mp4' })
  expect(parts[0].data.equals(data)).toBe(true)
  expect(parts[0].data.buffer).toBe(raw.buffer)
  expect(parts[1].data.toString()).toBe('client-uuid')
})
it('keeps near-boundary binary sequences and accepts quoted boundary parameters', () => {
  const data = Buffer.from(`\u0000\r\n--${boundary}-not-a-delimiter\r\n--${boundary}--not-a-close\u00ff`, 'latin1')
  expect(parseBannerMultipart(body(data), `multipart/form-data; boundary="${boundary}"`)[0].data.equals(data)).toBe(true)
})
it.each([
  ['unknown', contentType],
  [`--${boundary}\r\nContent-Disposition: form-data; name="file"\r\nContent-Disposition: duplicate\r\n\r\nx\r\n--${boundary}--`, contentType],
  [`--${boundary}\r\n${'x'.repeat(9000)}\r\n\r\nx`, contentType],
  [body(Buffer.from('x')).subarray(0, 100), contentType],
  [body(Buffer.from('x')), 'application/json']
])('rejects malformed or ambiguous forms without interpreting payload bytes', (raw, type) => {
  expect(() => parseBannerMultipart(Buffer.isBuffer(raw) ? raw : Buffer.from(raw), type)).toThrow()
})

it('accepts a real browser-style FormData body with intact binary bytes', async () => {
  const signature = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])
  const form = new FormData()
  form.append('file', new File([signature], 'vehicle-banner-été.mp4', { type: 'video/mp4' }))
  form.append('clientId', '11111111-1111-4111-8111-111111111111')
  const request = new Request('https://app.xeroflow.io/upload', { method: 'POST', body: form })
  const raw = Buffer.from(await request.arrayBuffer())
  const parts = parseBannerMultipart(raw, request.headers.get('content-type')!)
  expect(parts[0].filename).toBe('vehicle-banner-été.mp4')
  expect(parts[0].data.equals(signature)).toBe(true)
  expect(parts[1].data.toString()).toBe('11111111-1111-4111-8111-111111111111')
})
it('rejects duplicate disposition names instead of accepting an ambiguous part', () => {
  const raw = body(Buffer.from('x')).toString().replace('name="file";', 'name="file"; name="clientId";')
  expect(() => parseBannerMultipart(Buffer.from(raw), contentType)).toThrow()
})
