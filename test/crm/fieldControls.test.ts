import { describe, it, expect } from 'vitest'
// Pure UI util — vitest `~` maps to repo root, not app/, so import relatively.
import { controlForFieldType, formatCell } from '../../app/utils/crmFieldControls'

describe('controlForFieldType', () => {
  it('maps each field_type to its control', () => {
    expect(controlForFieldType('long_text')).toBe('textarea')
    expect(controlForFieldType('number')).toBe('number')
    expect(controlForFieldType('currency')).toBe('number')
    expect(controlForFieldType('rating')).toBe('rating')
    expect(controlForFieldType('dropdown')).toBe('select')
    expect(controlForFieldType('status')).toBe('select')
    expect(controlForFieldType('checkbox')).toBe('checkbox')
    expect(controlForFieldType('date')).toBe('date')
    expect(controlForFieldType('tags')).toBe('tags')
    expect(controlForFieldType('relation')).toBe('relation')
  })

  it('falls back to a plain input for text-like types', () => {
    for (const t of ['text', 'email', 'phone', 'link', 'location', 'unknown']) {
      expect(controlForFieldType(t)).toBe('input')
    }
  })
})

describe('formatCell', () => {
  it('renders an em dash for empty values', () => {
    expect(formatCell('text', null)).toBe('—')
    expect(formatCell('text', undefined)).toBe('—')
    expect(formatCell('text', '')).toBe('—')
  })

  it('formats currency in AUD', () => {
    expect(formatCell('currency', 1500)).toBe('$1,500.00')
  })

  it('formats checkbox as Yes/No (false is not treated as empty)', () => {
    expect(formatCell('checkbox', true)).toBe('Yes')
    expect(formatCell('checkbox', false)).toBe('No')
  })

  it('joins tags arrays and tolerates a stray scalar', () => {
    expect(formatCell('tags', ['a', 'b'])).toBe('a, b')
    expect(formatCell('tags', 'solo')).toBe('solo')
  })

  it('renders rating as filled/empty stars, clamped to 0..5', () => {
    expect(formatCell('rating', 3)).toBe('★★★☆☆')
    expect(formatCell('rating', 0)).toBe('☆☆☆☆☆') // 0 is not '' → renders empty stars
    expect(formatCell('rating', 9)).toBe('★★★★★')
    expect(formatCell('rating', 2.6)).toBe('★★★☆☆') // rounds to 3
  })
})
