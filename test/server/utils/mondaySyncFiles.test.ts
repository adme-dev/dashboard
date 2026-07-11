import { describe, expect, it } from 'vitest'
import { validateMondayAsset } from '../../../server/utils/mondaySync'

describe('validateMondayAsset', () => {
  it('accepts a bounded allowlisted task attachment', () => {
    expect(validateMondayAsset({ id: '1', name: 'brief.pdf', file_size: 1024 } as any, 'application/pdf'))
      .toEqual({ ok: true, filename: 'brief.pdf' })
  })

  it('rejects oversized, unsupported, or malformed assets', () => {
    expect(validateMondayAsset({ id: '1', name: 'large.pdf', file_size: 60 * 1024 * 1024 } as any, 'application/pdf').ok).toBe(false)
    expect(validateMondayAsset({ id: '2', name: 'run.exe', file_size: 10 } as any, 'application/octet-stream').ok).toBe(false)
    expect(validateMondayAsset({ id: '', name: '../bad.pdf', file_size: 10 } as any, 'application/pdf').ok).toBe(false)
  })

  it('sanitizes source filenames before persistence', () => {
    expect(validateMondayAsset({ id: '1', name: '../payroll?.pdf', file_size: 10 } as any, 'application/pdf'))
      .toEqual({ ok: true, filename: 'payroll-.pdf' })
  })
})
