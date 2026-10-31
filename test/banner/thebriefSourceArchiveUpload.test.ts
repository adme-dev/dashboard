import { createHash } from 'node:crypto'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildIndex, describeChild } from '../../scripts/thebrief/upload-source-archives.mjs'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const child = (html: string) => zipSync({ 'index.html': new TextEncoder().encode(html) })
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function index(clientStatus = 'exact') {
  return buildIndex({
    prepareLog: [
      { at: '2026-10-31T01:00:00Z', designHash: 'heldone', folderPath: 'KIA', status: 'held', archives: [{ sha256: 'a'.repeat(64), childHash: 'childaa' }], blockers: [{ archive: 'x-1200x1200-px.zip', error: 'Unsupported layer type: video' }] },
      { at: '2026-10-31T02:00:00Z', designHash: 'prepone', folderPath: 'KIA', status: 'prepared', archives: [{ sha256: 'b'.repeat(64), childHash: 'childbb' }], blockers: [] }
    ],
    importLog: [{ designHash: 'prepone', projectId: PROJECT_ID }],
    clientDecisions: {
      heldone: { client: 'Frankston Motor Group', status: clientStatus },
      prepone: { client: 'Frankston Motor Group', status: 'confirmed' },
      crawled: { client: 'Frankston Motor Group', status: 'proposed' }
    },
    clients: [{ id: CLIENT_ID, name: 'Frankston Motor Group' }],
    crawl: { done: { 1: { path: ['Archive', 'KIA'], designs: [{ hash: 'crawled', children: [{ hash: 'kid1234' }] }] } } }
  })
}

const input = (overrides: Record<string, unknown>) => ({
  bytes: 10,
  entryName: 'General usage/Design-1200x1200-px.zip',
  batchSha256: 'c'.repeat(64),
  folder: 'KIA',
  childBytes: new Uint8Array(),
  ...overrides
})

describe('TheBrief source archive uploader mapping', () => {
  it('keeps held designs with their blockers and only exact/confirmed clients', () => {
    const held = describeChild(input({ sha: 'a'.repeat(64) }), index())
    expect(held.metadata).toMatchObject({ designHash: 'heldone', childHash: 'childaa', status: 'held', clientId: CLIENT_ID, sizeLabel: '1200x1200' })
    expect(held.metadata.holdReason).toContain('Unsupported layer type: video')

    const proposed = describeChild(input({ sha: 'a'.repeat(64) }), index('proposed'))
    expect(proposed.metadata.clientId).toBeUndefined()
  })

  it('marks imported designs with their project', () => {
    const imported = describeChild(input({ sha: 'b'.repeat(64) }), index())
    expect(imported.metadata).toMatchObject({ status: 'imported', projectId: PROJECT_ID, clientId: CLIENT_ID })
  })

  it('resolves children missing from the prepare log by embedded hash, and leaves proposed clients unassigned', () => {
    const bytes = child('<script>var id="kid1234"</script>')
    const resolved = describeChild(input({ sha: sha(bytes), childBytes: bytes, entryName: 'General usage/Design-1080x1920-px-1.zip' }), index())
    expect(resolved.metadata).toMatchObject({ designHash: 'crawled', childHash: 'kid1234', status: 'held', folderPath: 'Archive/KIA', filename: 'Design-1080x1920-px-1.zip' })
    expect(resolved.metadata.clientId).toBeUndefined()

    const unknown = child('<p>nothing</p>')
    expect(describeChild(input({ sha: sha(unknown), childBytes: unknown }), index()).error).toMatch(/unresolved/)
  })

  it('refuses entries that are not General usage size ZIPs', () => {
    expect(describeChild(input({ sha: 'a'.repeat(64), entryName: '../evil.zip' }), index()).error).toBeTruthy()
  })
})
