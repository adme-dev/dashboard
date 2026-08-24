import { describe, it, expect } from 'vitest'
import { CreateQrSchema, UpdateQrSchema, FolderSchema } from '../../server/utils/qr/schemas'

describe('qr api schemas', () => {
  it('create requires name, clientId (uuid), destinationUrl', () => {
    expect(() => CreateQrSchema.parse({ name: 'x', clientId: 'nope', destinationUrl: 'https://a.com' })).toThrow()
    const ok = CreateQrSchema.parse({ name: ' Card ', clientId: '11111111-1111-4111-8111-111111111111', destinationUrl: 'https://a.com' })
    expect(ok.name).toBe('Card')
    expect(ok.style.pattern).toBe('classic')
  })
  it('update accepts partial and rejects unknown keys', () => {
    expect(UpdateQrSchema.parse({ isActive: false })).toEqual({ isActive: false })
    expect(() => UpdateQrSchema.parse({ code: 'hack123' })).toThrow()
  })
  it('folder needs a 1-80 char name', () => {
    expect(() => FolderSchema.parse({ clientId: '11111111-1111-4111-8111-111111111111', name: '' })).toThrow()
  })
})
