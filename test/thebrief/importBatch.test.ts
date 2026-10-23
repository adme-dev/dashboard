import { describe, expect, it } from 'vitest'
import { readImportBatch } from '../../app/utils/thebrief-import-batch'

function file(name: string, hash: string) {
  return new File([JSON.stringify({
    kind: 'xeroflow-thebrief-import', version: 1, name,
    source: { designHash: name, sha256: hash.repeat(64), folder: 'Updates', duration: 4, loopCount: 0 },
    canvasData: { custom_300x250: { layers: [{ id: 1, type: 'text', name: 'Title', text: 'Hello', x: 0, y: 0, w: 300, h: 50, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4 }] } },
    assets: [], fonts: [], warnings: []
  })], `${name}.json`, { type: 'application/json' })
}

describe('TheBrief batch selection', () => {
  it('retains saved results and manual client choices when more files are added', async () => {
    const first = file('First', 'a')
    const second = file('Second', 'b')
    const rows = await readImportBatch([first], [], [])
    Object.assign(rows[0], { clientId: 'manual-client', projectId: 'saved-project', status: 'Saved as draft' })
    const next = await readImportBatch([first, second], rows, [])
    expect(next[0]).toBe(rows[0])
    expect(next[0]).toMatchObject({ clientId: 'manual-client', projectId: 'saved-project', status: 'Saved as draft' })
    expect(next[1]).toMatchObject({ clientId: '__unassigned__', status: 'Ready for draft import' })
  })

  it('does not retain saved state for a replaced file with the same name', async () => {
    const rows = await readImportBatch([file('First', 'a')], [], [])
    rows[0].projectId = 'old-project'
    const next = await readImportBatch([file('First', 'b')], rows, [])
    expect(next[0].projectId).toBeUndefined()
    expect(next[0].pkg.source.sha256).toBe('b'.repeat(64))
  })

  it('preserves the previous batch if an added file is invalid', async () => {
    const first = file('First', 'a')
    const rows = await readImportBatch([first], [], [])
    rows[0].clientId = 'manual-client'
    await expect(readImportBatch([first, new File(['broken'], 'broken.json')], rows, [])).rejects.toThrow()
    expect(rows).toHaveLength(1)
    expect(rows[0].clientId).toBe('manual-client')
  })

  it('removes deselected files and enforces the batch limit', async () => {
    const rows = await readImportBatch([file('First', 'a')], [], [])
    expect(await readImportBatch([], rows, [])).toEqual([])
    await expect(readImportBatch(Array.from({ length: 11 }, () => file('First', 'a')), rows, [])).rejects.toThrow('up to 10')
  })
})
