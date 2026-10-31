import { describe, expect, it } from 'vitest'
import { importRowStates, readImportBatch, reconcileImportRows, summariseImport } from '../../app/utils/thebrief-import-batch'
import type { BannerFolder } from '../../app/types/banner-studio'

function file(name: string, hash: string, createdDate?: string, clientName?: string) {
  return new File([JSON.stringify({
    kind: 'xeroflow-thebrief-import', version: 1, name,
    source: { designHash: name, sha256: hash.repeat(64), folder: 'Updates', duration: 4, loopCount: 0, ...(createdDate ? { createdDate } : {}), ...(clientName ? { clientName } : {}) },
    canvasData: { custom_300x250: { layers: [{ id: 1, type: 'text', name: 'Title', text: 'Hello', x: 0, y: 0, w: 300, h: 50, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4 }] } },
    assets: [], fonts: [], warnings: []
  })], `${name}.json`, { type: 'application/json' })
}

describe('TheBrief batch selection', () => {
  it('retains saved results and manual client choices when more files are added', async () => {
    const first = file('First', 'a')
    const second = file('Second', 'b')
    const rows = await readImportBatch([first], [], [])
    Object.assign(rows[0], { clientId: 'manual-client', projectId: 'saved-project', result: { state: 'saved', message: 'Saved as draft' } })
    const next = await readImportBatch([first, second], rows, [])
    expect(next[0]).toBe(rows[0])
    expect(next[0]).toMatchObject({ clientId: 'manual-client', projectId: 'saved-project', result: { state: 'saved' } })
    expect(next[1]).toMatchObject({ clientId: '__unassigned__' })
    expect(next[1]?.result).toBeUndefined()
  })

  it('prefills a verified source date without replacing a manual correction', async () => {
    const source = file('First', 'a', '2020-06-12')
    const rows = await readImportBatch([source], [], [])
    expect(rows[0]?.sourceCreatedDate).toBe('2020-06-12')
    rows[0]!.sourceCreatedDate = '2020-06-11'
    expect((await readImportBatch([source], rows, []))[0]?.sourceCreatedDate).toBe('2020-06-11')
    expect((await readImportBatch([file('Second', 'b')], [], []))[0]?.sourceCreatedDate).toBe('')
  })

  it('preselects the ledger client hint only when exactly one client has that name', async () => {
    const clients = [{ id: 'bag', name: 'Brighton Auto Group' }, { id: 'gwm', name: 'Brighton GWM' }]
    expect((await readImportBatch([file('ForthingUpdate', 'a', undefined, 'Brighton Auto Group')], [], clients))[0]?.clientId).toBe('bag')
    expect((await readImportBatch([file('ForthingUpdate', 'b', undefined, 'Brighton')], [], clients))[0]?.clientId).toBe('__unassigned__')
  })

  it('does not retain saved state for a replaced file with the same name', async () => {
    const rows = await readImportBatch([file('First', 'a')], [], [])
    rows[0].projectId = 'old-project'
    const next = await readImportBatch([file('First', 'b')], rows, [])
    expect(next[0].projectId).toBeUndefined()
    expect(next[0].pkg.source.sha256).toBe('b'.repeat(64))
  })

  it('marks an invalid added file without discarding the rest of the batch', async () => {
    const first = file('First', 'a')
    const rows = await readImportBatch([first], [], [])
    rows[0].clientId = 'manual-client'
    const next = await readImportBatch([first, new File(['broken'], 'broken.json')], rows, [])
    expect(next[0]).toBe(rows[0])
    expect(next[0]?.clientId).toBe('manual-client')
    expect(next[1]).toMatchObject({ invalidReason: 'Not a readable JSON package' })
    expect(next[1]?.pkg).toBeUndefined()
  })

  it('removes deselected files and enforces the batch limit', async () => {
    const rows = await readImportBatch([file('First', 'a')], [], [])
    expect(await readImportBatch([], rows, [])).toEqual([])
    const fifty = Array.from({ length: 50 }, (_, index) => file(`Design-${index}`, 'a'))
    expect(await readImportBatch(fifty, [], [])).toHaveLength(50)
    await expect(readImportBatch([...fifty, file('Overflow', 'b')], rows, [])).rejects.toThrow('up to 50')
  })

  it('suggests only a unique exact source folder and keeps manual moves', async () => {
    const source = file('First', 'a')
    const folders = [{ id: 'exact', name: 'Updates', parentId: null, position: 0, sourcePath: ['Updates'] }] as BannerFolder[]
    const rows = await readImportBatch([source], [], [], folders)
    expect(rows[0]?.folderId).toBe('exact')
    rows[0]!.folderId = '__unfiled__'
    expect((await readImportBatch([source], rows, [], folders))[0]?.folderId).toBe('__unfiled__')
    expect((await readImportBatch([file('Second', 'b')], [], [], [...folders, { ...folders[0]!, id: 'duplicate' }]))[0]?.folderId).toBe('__unfiled__')
  })

  it('classifies a mixed selection independently as ready, needs attention or invalid', async () => {
    const clients = [{ id: 'blood', name: 'Blood' }]
    const rows = await readImportBatch([
      file('Ready', 'a', '2021-01-02', 'Blood'),
      new File(['{"kind":"other"}'], 'wrong-kind.json'),
      file('NoClient', 'b', '2021-01-02'),
      file('Undated', 'c', undefined, 'Blood'),
      file('Ready', 'd', '2021-01-02', 'Blood')
    ], [], clients)
    expect(rows).toHaveLength(5)
    expect(rows[1]?.invalidReason).toMatch(/^Package format: kind /)
    const states = importRowStates(rows)
    expect(states.map(state => state.state)).toEqual(['ready', 'invalid', 'attention', 'attention', 'attention'])
    expect(states[2]?.message).toContain('Choose the client')
    expect(states[3]?.message).toContain('creation date')
    expect(states[4]?.message).toContain('same TheBrief design')
    expect(importRowStates(rows, { importUndated: true })[3]?.state).toBe('ready')
    expect(summariseImport(states)).toMatchObject({ ready: 1, attention: 3, invalid: 1 })
  })

  it('restores saved progress from the library by checksum, or by design when its sizes are present', async () => {
    const clients = [{ id: 'blood', name: 'Blood' }]
    const rows = await readImportBatch([file('Same', 'a', '2021-01-02', 'Blood'), file('Fresh', 'b', '2021-01-02', 'Blood'), file('Grown', 'c', '2021-01-02', 'Blood'), file('New', 'e', '2021-01-02', 'Blood')], [], clients)
    reconcileImportRows(rows, [
      { id: 'p1', clientId: 'blood', tags: ['source:thebrief', `source-sha256:${'a'.repeat(64)}`], canvasData: {} },
      { id: 'p2', clientId: 'blood', tags: ['source:thebrief', `source-sha256:${'f'.repeat(64)}`, 'source-design:fresh'], canvasData: { custom_300x250: {}, custom_1200x1200: {} } },
      { id: 'p3', clientId: 'blood', tags: ['source:thebrief', `source-sha256:${'9'.repeat(64)}`, 'source-design:grown'], canvasData: { custom_1200x1200: {} } },
      { id: 'p4', clientId: 'other', tags: ['source:thebrief', `source-sha256:${'e'.repeat(64)}`], canvasData: {} }
    ])
    expect(rows.map(row => [row.projectId, row.result?.state])).toEqual([['p1', 'saved'], ['p2', 'saved'], ['p3', 'attention'], [undefined, undefined]])
    expect(rows[2]?.result?.message).toContain('without 300x250')
  })
})
