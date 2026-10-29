import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exportExistingDesign } from '../../scripts/thebrief/api-export.mjs'

const id = 'b46adaed-39df-41a2-89e5-beb870282414'
const zipUrl = 'https://creatopy-api-0d4e56b.s3.eu-central-1.amazonaws.com/creatives/a.zip?X-Amz-Signature=example'
const reply = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

describe('TheBrief existing-design export adapter', () => {
  it('authenticates, exports the existing design, polls and stores a bounded ZIP', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'thebrief-api-'))
    const calls = []
    const fetcher = async (url, options) => {
      calls.push({ url: String(url), options })
      if (calls.length === 1) return reply({ token: 'test-bearer' })
      if (calls.length === 2) return reply({ response: { export: { id, status: 'pending' } } })
      if (calls.length === 3) return reply({ response: { status: 'complete', creatives: [{ zipUrl }] } })
      return new Response(Buffer.from('PK\x03\x04sample', 'binary'))
    }
    try {
      const output = join(dir, 'jac.zip')
      const result = await exportExistingDesign({ designHash: '1nz5y6q', clientId: 'client', clientSecret: 'private', output, fetcher, pollMs: 0 })
      expect(result.bytes).toBe(10)
      expect(readFileSync(output).subarray(0, 4).toString('binary')).toBe('PK\x03\x04')
      expect(calls.map(call => call.url)).toEqual([
        'https://api.thebrief.ai/v1/auth/token',
        'https://api.thebrief.ai/v1/export',
        `https://api.thebrief.ai/v1/export/${id}`,
        zipUrl,
      ])
      expect(JSON.parse(calls[1].options.body)).toMatchObject({ creativeHash: '1nz5y6q', type: 'html' })
      expect(calls[2].options.headers.authorization).toBe('Bearer test-bearer')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('refuses untrusted download hosts before fetching their content', async () => {
    const fetcher = async (url) => {
      if (String(url).endsWith('/auth/token')) return reply({ token: 'test-bearer' })
      if (String(url).endsWith('/v1/export')) return reply({ response: { export: { id } } })
      if (String(url).endsWith(id)) return reply({ response: { status: 'complete', creatives: [{ zipUrl: 'http://127.0.0.1/creatives/export.zip' }] } })
      throw new Error('Untrusted fetch reached')
    }
    await expect(exportExistingDesign({ designHash: '1nz5y6q', clientId: 'client', clientSecret: 'private', output: '/private/tmp/never-write.zip', fetcher, pollMs: 0 })).rejects.toThrow(/Unexpected TheBrief export host/)
  })
})
