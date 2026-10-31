import { describe, expect, it, vi } from 'vitest'
import { motorStackImportRows, runMotorStackImport, motorStackImportErrorDescription } from '../../app/utils/banner-motorstack-import'
import type { MotorStackImportResult } from '../../app/utils/banner-motorstack-import'

const brands = [{ id: 'gwm', name: 'GWM', existingKitId: null }, { id: 'kia', name: 'Kia', existingKitId: 'kit-kia' }]
const result = (id: string, status: MotorStackImportResult['status'] = 'imported'): MotorStackImportResult => ({
  status, brandId: id, brandName: id, kitId: status === 'skipped' ? null : `kit-${id}`,
  warnings: ['No light logo supplied'], counts: { fonts: 2, logos: 1, colors: 3 }
})

describe('MotorStack brand import queue', () => {
  it('shows fixed public reasons even when ofetch only exposes a generic HTTP message', async () => {
    const rows = motorStackImportRows(brands.slice(0, 1))
    await runMotorStackImport(rows, async () => {
      throw { message: '[POST] /api/import: 502 Server Error', data: { data: { reasonCode: 'font_invalid' } } }
    })
    expect(rows[0]?.error).toContain('source font could not be validated')
    expect(rows[0]?.error).not.toContain('[POST]')
    expect(motorStackImportErrorDescription({ data: { reasonCode: 'logo_invalid' }, message: 'secret provider URL' })).toContain('source logo')
  })
  it('keeps saved-status guidance for uncertain outcomes and preserves the legacy fallback', () => {
    expect(motorStackImportErrorDescription({ data: { data: { reasonCode: 'import_failed' } }, message: 'secret' })).toBe('The import could not be confirmed. Retry this brand to check its saved status.')
    expect(motorStackImportErrorDescription({ data: { statusMessage: 'Legacy safe error', data: { reasonCode: 'constructor' } } })).toBe('Legacy safe error')
    expect(motorStackImportErrorDescription(null)).toContain('check its saved status')
  })
  it('awaits each brand, preserving source warnings and existing kit results', async () => {
    let finishFirst!: (value: MotorStackImportResult) => void
    const first = new Promise<MotorStackImportResult>((resolve) => {
      finishFirst = resolve
    })
    const write = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(result('kia', 'existing'))
    const rows = motorStackImportRows(brands)
    const running = runMotorStackImport(rows, write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(rows.map(row => row.status)).toEqual(['importing', 'pending'])
    finishFirst(result('gwm'))
    await running
    expect(write.mock.calls).toEqual([['gwm'], ['kia']])
    expect(rows.map(row => row.status)).toEqual(['imported', 'existing'])
    expect(rows[0].result?.warnings).toEqual(['No light logo supplied'])
    expect(rows[1].existingKitId).toBe('kit-kia')
  })

  it('continues after one failure and retries only unfinished rows', async () => {
    const rows = motorStackImportRows(brands)
    const write = vi.fn().mockRejectedValueOnce({ data: { statusMessage: 'Font source unavailable' } }).mockResolvedValueOnce(result('kia'))
    await runMotorStackImport(rows, write)
    expect(rows[0].error).toBe('Font source unavailable')
    expect(rows[1].status).toBe('imported')
    const retry = vi.fn().mockResolvedValue(result('gwm', 'existing'))
    await runMotorStackImport(rows, retry)
    expect(retry.mock.calls).toEqual([['gwm']])
    expect(rows[0].status).toBe('existing')
    expect(rows[0].error).toBeUndefined()
  })

  it('finishes an in-flight write before stopping and resumes pending rows', async () => {
    const rows = motorStackImportRows(brands)
    let stop = false
    const write = vi.fn(async (id: string) => {
      stop = true
      return result(id)
    })
    await runMotorStackImport(rows, write, () => stop)
    expect(rows.map(row => row.status)).toEqual(['imported', 'pending'])
    expect(write).toHaveBeenCalledTimes(1)
    stop = false
    await runMotorStackImport(rows, write, () => stop)
    expect(write.mock.calls).toEqual([['gwm'], ['kia']])
  })

  it('keeps skipped brands distinct from successful imports', async () => {
    const rows = motorStackImportRows(brands.slice(0, 1))
    await runMotorStackImport(rows, async id => result(id, 'skipped'))
    expect(rows[0].status).toBe('skipped')
    expect(rows[0].existingKitId).toBeNull()
    expect(rows[0].result?.warnings).toEqual(['No light logo supplied'])
  })

  it.each([
    { ...result('other') },
    { ...result('gwm'), kitId: null },
    { ...result('gwm'), status: 'unknown' }
  ])('does not report an inconsistent server result as success', async (response) => {
    const rows = motorStackImportRows(brands.slice(0, 1))
    await runMotorStackImport(rows, async () => response as MotorStackImportResult)
    expect(rows[0].status).toBe('failed')
    expect(rows[0].error).toContain('Could not verify')
    expect(rows[0].existingKitId).toBeNull()
  })
})
