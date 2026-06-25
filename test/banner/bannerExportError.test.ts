import { describe, expect, it } from 'vitest'
import { describeBannerVideoExportError } from '~~/app/utils/bannerExportError'

describe('describeBannerVideoExportError', () => {
  it('prefers structured render lint findings', () => {
    expect(describeBannerVideoExportError({
      data: {
        statusMessage: 'Invalid banner render input',
        data: {
          findings: [
            { severity: 'warning', message: 'Legacy fallback' },
            { severity: 'error', message: 'Banner dimensions must be 2000px or smaller.' },
            { severity: 'error', code: 'missing_runtime_contract' }
          ]
        }
      }
    })).toBe('Banner dimensions must be 2000px or smaller. missing_runtime_contract')
  })

  it('falls back to status message, then message, then default text', () => {
    expect(describeBannerVideoExportError({ data: { statusMessage: 'Bad request' }, message: 'Ignored' })).toBe('Bad request')
    expect(describeBannerVideoExportError({ message: 'Network failed' })).toBe('Network failed')
    expect(describeBannerVideoExportError(null)).toBe('Video export failed')
  })
})
