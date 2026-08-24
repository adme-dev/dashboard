import { describe, it, expect } from 'vitest'
import { svgPlaceholder } from '../../app/utils/adPreviewPlaceholder'

describe('svgPlaceholder', () => {
  it('encodes hex colours exactly once so they decode back to valid CSS', () => {
    const uri = svgPlaceholder({ width: 600, height: 600, bg: '#333333', fg: '#666666', label: 'Ad Creative' })
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true)
    const decoded = decodeURIComponent(uri.slice('data:image/svg+xml,'.length))
    expect(decoded).toContain('fill="#333333"')
    expect(decoded).toContain('fill="#666666"')
    expect(decoded).not.toContain('%23') // the old double-encoding bug
    expect(decoded).toContain('>Ad Creative</text>')
  })

  it('reproduces the legacy double-encoding bug it replaces (regression documentation)', () => {
    const legacy = 'data:image/svg+xml,' + encodeURIComponent('<svg fill="%23333"></svg>')
    expect(decodeURIComponent(legacy.slice('data:image/svg+xml,'.length))).toContain('fill="%23333"') // invalid colour → rendered black
  })
})
