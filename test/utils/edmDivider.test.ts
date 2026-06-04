import { describe, expect, it } from 'vitest'
import { dividerLineThickness } from '~~/app/utils/edmDivider'

describe('edm Divider helpers', () => {
  it('prefers lineThickness and keeps legacy lineHeight as a fallback', () => {
    expect(dividerLineThickness({ lineThickness: 4, lineHeight: 1 })).toBe(4)
    expect(dividerLineThickness({ lineHeight: 3 })).toBe(3)
    expect(dividerLineThickness({ lineThickness: 0 })).toBe(1)
    expect(dividerLineThickness({ lineThickness: 'big' })).toBe(1)
  })
})
