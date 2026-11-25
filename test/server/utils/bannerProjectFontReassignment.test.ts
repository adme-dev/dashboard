import { describe, expect, it, vi } from 'vitest'
import { reassignProjectFonts } from '../../../server/utils/banner/reassignProjectFonts'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const TARGET = '22222222-2222-4222-8222-222222222222'
const FONT = '33333333-3333-4333-8333-333333333333'
const canvas = () => ({ mrec: { layers: [{ id: 1, type: 'text', text: 'Original offer', x: 20, fontAssetId: FONT, fontFamily: 'Brand', fontWeight: 700,
  textRuns: [{ text: 'Original offer', fontAssetId: FONT, fontFamily: 'Brand', fontWeight: 700 }] }] } })

function database(clientId: string | null = SOURCE) {
  const fonts = new Map([[FONT, { id: FONT, name: 'Brand', clientId, tags: ['font', 'weight:700', 'sha256:checksum'], r2Key: 'immutable-font', uploadedBy: 'original-uploader', url: '/original', mimeType: 'font/woff', fileSize: 123 }]])
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('id = ANY')) return { rows: (params[0] as string[]).map((id: string) => fonts.get(id)).filter(Boolean) }
    if (sql.includes('ORDER BY id LIMIT 1')) return { rows: [...fonts.values()].filter(f => f.clientId === params[0] && f.r2Key === params[1] && f.name === params[2] && f.tags.includes(params[3])).slice(0, 1) }
    if (sql.startsWith('INSERT')) {
      const [id, name, mimeType, fileSize, r2Key, url, tags, uploadedBy, target] = params as [string, string, string, number, string, string, string[], string, string | null]
      fonts.set(id, { id, name, mimeType, fileSize, r2Key, url, tags, uploadedBy, clientId: target })
    }
    return { rows: [] }
  })
  return { query, fonts }
}

describe('client correction preserves managed project fonts', () => {
  it('remaps layers and inline runs to a separate client record while retaining exact artwork and immutable bytes', async () => {
    const db = database(), original = canvas()
    const result = await reassignProjectFonts(original, SOURCE, TARGET, db)
    const id = result.mrec.layers[0].fontAssetId
    expect(id).not.toBe(FONT)
    expect(result.mrec.layers[0].textRuns[0].fontAssetId).toBe(id)
    expect(db.fonts.get(id)).toMatchObject({ clientId: TARGET, r2Key: 'immutable-font', name: 'Brand', uploadedBy: 'original-uploader', tags: expect.arrayContaining(['weight:700', 'sha256:checksum']) })
    expect(db.fonts.get(FONT)?.clientId).toBe(SOURCE)
    expect(original).toEqual(canvas())
    expect({ ...result.mrec.layers[0], fontAssetId: FONT, textRuns: original.mrec.layers[0].textRuns }).toEqual(original.mrec.layers[0])
    expect((await reassignProjectFonts(original, SOURCE, TARGET, db)).mrec.layers[0].fontAssetId).toBe(id)
    expect(db.fonts.size).toBe(2)
  })
  it('rejects a foreign source reference before inserting any target face', async () => {
    const db = database(TARGET)
    await expect(reassignProjectFonts(canvas(), SOURCE, TARGET, db)).rejects.toMatchObject({ statusCode: 400 })
    expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false)
  })
  it('retains shared faces and never converts a client face into an agency-wide face', async () => {
    const shared = database(null)
    expect(await reassignProjectFonts(canvas(), SOURCE, TARGET, shared)).toEqual(canvas())
    expect(shared.fonts.size).toBe(1)
    await expect(reassignProjectFonts(canvas(), SOURCE, null, database())).rejects.toMatchObject({ statusCode: 400 })
  })
})
