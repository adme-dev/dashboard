import { describe, expect, it } from 'vitest'
import worker from '../../workers/board-knowledge-extractor/src/index'

function request(body: Uint8Array, headers: Record<string, string> = {}) {
  return new Request('https://extractor.test/extract', {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-document-file-name': 'policy.txt',
      'x-document-mime-type': 'text/plain',
      ...headers
    },
    body
  })
}

describe('Board Knowledge native extractor Worker', () => {
  it('returns bounded native blocks without caching document payloads', async () => {
    const response = await worker.fetch(request(new TextEncoder().encode('Supplier bills are reviewed every Friday.')))
    const result = await response.json() as {
      outcome: string
      blocks: Array<{ content: string }>
    }

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(result.outcome).toBe('usable')
    expect(result.blocks[0]?.content).toContain('Supplier bills')
  })

  it('rejects public shapes and malformed metadata before parsing', async () => {
    const wrongPath = await worker.fetch(new Request('https://extractor.test/health'))
    const badMetadata = await worker.fetch(request(new Uint8Array([1]), {
      'x-document-file-name': '%E0%A4%A'
    }))

    expect(wrongPath.status).toBe(404)
    expect(badMetadata.status).toBe(400)
  })
})
