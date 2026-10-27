import { describe, expect, it } from 'vitest'
import { parseDissectionUploadParts } from '../../../server/utils/banner/dissectionUpload'
const file = { name: 'file', filename: 'source.png', type: 'image/png', data: Buffer.from('synthetic parser fixture') }
const field = (name: string, value: string) => ({ name, data: Buffer.from(value) })
const project = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
describe('Dissector multipart ownership contract', () => {
  it('retains the same original Buffer and defaults unknown physical size', () => {
    const value = parseDissectionUploadParts([file])
    expect(value.file.data).toBe(file.data)
    expect(value.physical).toBeNull()
    expect(value.projectId).toBeUndefined()
  })
  it('normalizes project/client assertions and explicit A4 orientation', () => {
    expect(parseDissectionUploadParts([file, field('projectId', project.toUpperCase()), field('clientId', project), field('physical', '{"preset":"A4","orientation":"landscape"}')])).toMatchObject({ projectId: project, clientId: project, physical: { preset: 'A4', orientation: 'landscape', widthMm: 297, heightMm: 210, unit: 'mm' } })
  })
  it.each(['file', 'brand', 'projectId', 'clientId', 'physical'])('rejects duplicated %s before choosing an authority value', (name) => {
    const part = name === 'file' ? file : field(name, project)
    expect(() => parseDissectionUploadParts(name === 'file' ? [file, file] : [file, part, part])).toThrow()
  })
  it.each([
    [field('userId', project)], [field('unknown', 'value')], [field('projectId', '')],
    [field('clientId', 'not-an-id')], [field('physical', '{')],
    [field('physical', '{"preset":"A4","orientation":"portrait","widthMm":210}')],
    [field('brand', 'x'.repeat(201))], [field('brand', 'x'.repeat(16 * 1024 + 1))],
    [{ name: 'brand', filename: 'authority.json', data: Buffer.from('brand') }]
  ])('rejects malformed or unsupported metadata %#', (parts) => {
    expect(() => parseDissectionUploadParts([file, ...parts])).toThrow()
  })
  it('does not infer A4 from filename, brand or image dimensions', () => {
    expect(parseDissectionUploadParts([{ ...file, filename: 'A4-300dpi.png' }, field('brand', 'A4')]).physical).toBeNull()
  })
})
