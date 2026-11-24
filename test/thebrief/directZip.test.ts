import { createHash } from 'node:crypto'
import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { prepareTheBriefGroup } from '../../scripts/thebrief/prepare-group.mjs'
import { readImportBatch } from '../../app/utils/thebrief-import-batch'
import { findTheBriefDuplicate } from '../../app/utils/thebrief-import-duplicates'
import { source } from './fixture'

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
function creative(identity: string, width = 300, invalid = false) {
  const html = source.replace('designData:{', `designData:{designHash:"${identity}",`).replaceAll('width:300', `width:${width}`)
  return zipSync({ 'index.html': strToU8(invalid ? html.replace('type:"slide"', 'type:"unknown"') : html) })
}
const packageFixture = (name: string) => ({
  kind: 'xeroflow-thebrief-import', version: 1, name,
  source: { designHash: name, sha256: hash(name), folder: '', duration: 4, loopCount: 0 },
  canvasData: { custom_300x250: { layers: [{ id: 1, type: 'text', name: 'Title', text: name, x: 0, y: 0, w: 300, h: 50, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4 }] } },
  assets: [], fonts: [], warnings: []
})

describe('direct TheBrief ZIP preparation', () => {
  it('imports three designs and two sizes each without executing exported scripts', async () => {
    const entries = Object.fromEntries(['Sale', 'Traffic', 'Tonale'].flatMap(name => [300, 600].map(width => [`General usage/${name}-${width}x250-px.zip`, creative(`${name}${width}`, width)])))
    const bytes = zipSync(entries)
    const result = await prepareTheBriefGroup(bytes, 'Designs-HTML.zip')
    expect(result.sourceSha256).toBe(hash(bytes))
    expect(result.issues).toEqual([])
    expect(result.packages.map(pkg => pkg.name)).toEqual(['Sale', 'Traffic', 'Tonale'])
    for (const pkg of result.packages) {
      expect(Object.keys(pkg.canvasData)).toEqual(['custom_300x250', 'custom_600x250'])
      expect(pkg.source.sizeSources).toHaveLength(2)
      expect(pkg.source.createdDate).toBeUndefined()
      expect(pkg.source.folder).toBe('')
    }
  }, 30000)

  it('holds every size of an incompatible design while keeping the rest of the group available', async () => {
    const result = await prepareTheBriefGroup(zipSync({
      'Sale-300x250-px.zip': creative('sale300'), 'Sale-600x250-px.zip': creative('sale600', 600, true),
      'Traffic-300x250-px.zip': creative('traffic300')
    }))
    expect(result.packages.map(pkg => pkg.name)).toEqual(['Traffic'])
    expect(result.issues).toEqual([{ name: 'Sale', sizes: 2, message: 'Invalid slide metadata' }])
  }, 20000)

  it('rejects traversal, mixed containers, excessive nesting and mismatched size labels', async () => {
    await expect(prepareTheBriefGroup(zipSync({ '../outside.zip': creative('bad') }))).rejects.toThrow('Unsafe ZIP path')
    await expect(prepareTheBriefGroup(zipSync({ 'good.zip': creative('good'), 'index.html': strToU8('wrong') }))).rejects.toThrow('only the individual')
    await expect(prepareTheBriefGroup(zipSync({ 'outer.zip': zipSync({ 'inner.zip': creative('bad') }) }))).rejects.toThrow('nesting')
    const result = await prepareTheBriefGroup(zipSync({ 'Wrong-600x250-px.zip': creative('wrong300') }))
    expect(result.packages).toEqual([])
    expect(result.issues[0].message).toMatch(/filename differs/)
  }, 20000)
})

describe('ZIP selection and safe retries', () => {
  it('retains all rows, assignments and saved results when a cached ZIP is selected again', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4])
    const file = new File([bytes], 'Designs-HTML.zip')
    const prepareZip = vi.fn(async () => ({ sourceSha256: hash(bytes), packages: [packageFixture('Sale'), packageFixture('Traffic')], issues: [] }))
    const cache = new WeakMap()
    const rows = await readImportBatch([file], [], [], [], { prepareZip, cache })
    Object.assign(rows[0]!, { clientId: 'manual-client', projectId: 'saved-project' })
    rows[1]!.folderId = 'manual-folder'
    const next = await readImportBatch([file], rows, [], [], { prepareZip, cache })
    expect(prepareZip).toHaveBeenCalledTimes(1)
    expect(next).toHaveLength(2)
    expect(next[0]).toBe(rows[0])
    expect(next[1]).toBe(rows[1])
    expect(next[1]!.folderId).toBe('manual-folder')
    expect(await readImportBatch([], next, [])).toEqual([])
  })

  it('rejects mismatched source receipts and oversize ZIPs before conversion', async () => {
    const file = new File(['PKtest'], 'group.zip')
    const prepareZip = vi.fn(async () => ({ sourceSha256: 'a'.repeat(64), packages: [], issues: [] }))
    await expect(readImportBatch([file], [], [], [], { prepareZip })).rejects.toThrow('do not match')
    prepareZip.mockClear()
    const huge = { name: 'big.zip', size: 65 * 1024 * 1024, slice: () => new Blob(['PK']) } as File
    await expect(readImportBatch([huge], [], [], [], { prepareZip })).rejects.toThrow('64 MB')
    expect(prepareZip).not.toHaveBeenCalled()
  })

  it('recognizes a previously merged parent by exact child receipts without matching names or clients', async () => {
    const pkg = packageFixture('Traffic')
    const sizeSources = [{ designHash: 'square', sha256: 'a'.repeat(64) }, { designHash: 'portrait', sha256: 'b'.repeat(64) }]
    Object.assign(pkg.source, { sizeSources })
    const mergedHash = hash(`legacy-parent\n${sizeSources.map(size => size.sha256).sort().join('\n')}\n`)
    const saved = { id: 'existing-traffic', clientId: 'client-a', tags: ['source:thebrief', 'source-design:legacy-parent', `source-sha256:${mergedHash}`] }
    expect(await findTheBriefDuplicate([saved], 'client-a', pkg as never)).toBe(saved)
    expect(await findTheBriefDuplicate([saved], 'client-b', pkg as never)).toBeUndefined()
    sizeSources[0]!.sha256 = 'c'.repeat(64)
    expect(await findTheBriefDuplicate([saved], 'client-a', pkg as never)).toBeUndefined()
  })

  it('does not skip a whole design when an existing draft has only one of its sizes', async () => {
    const pkg = packageFixture('Traffic')
    Object.assign(pkg.source, { sizeSources: [{ designHash: 'square', sha256: 'a'.repeat(64) }, { designHash: 'portrait', sha256: 'b'.repeat(64) }] })
    const saved = { id: 'one-size', clientId: 'client-a', tags: ['source:thebrief', 'source-size:square'] }
    expect(await findTheBriefDuplicate([saved], 'client-a', pkg as never)).toBeUndefined()
    saved.tags.push('source-size:portrait')
    expect(await findTheBriefDuplicate([saved], 'client-a', pkg as never)).toBe(saved)
  })
})
