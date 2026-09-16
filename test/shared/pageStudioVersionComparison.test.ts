import { describe, expect, it } from 'vitest'
import { comparePageStudioContent } from '~~/shared/pageStudio/versionComparison'

describe('immutable website comparison', () => {
  const page = (id: string, title = id) => ({ id, title, route: `/${id}`, components: [], forms: [] })
  it('matches stable IDs and reports reorder without inventing changed content', () => {
    const a = page('a'), b = page('b')
    const result = comparePageStudioContent({ pages: [a, b] }, { pages: [b, a] })
    expect(result.complete).toBe(true)
    expect(result.changes).toHaveLength(2)
    expect(result.changes.every(x => x.path.endsWith('Position'))).toBe(true)
  })
  it('shows removed, added, changed forms and global settings with exact values', () => {
    const before = { pages: [page('a'), page('removed')], theme: { color: 'blue' } }
    const after = { pages: [{ ...page('a', 'Updated'), forms: [{ id: 'form', fields: [{ id: 'email', required: true }] }] }, page('added')], theme: { color: 'red' } }
    const result = comparePageStudioContent(before, after)
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'pages › a › title', before: 'a', after: 'Updated' }),
      expect.objectContaining({ path: 'theme › color', before: 'blue', after: 'red' }),
      expect.objectContaining({ path: 'pages › removed', kind: 'removed' }),
      expect.objectContaining({ path: 'pages › added', kind: 'added' }),
      expect.objectContaining({ path: 'pages › a › forms › form', kind: 'added' })
    ]))
  })
  it('does not lose duplicate IDs, null values or primitive array changes', () => {
    const result = comparePageStudioContent({ list: [{ id: 'x' }, { id: 'x' }], values: [1], nil: null }, { list: [{ id: 'x' }], values: [2], nil: 'now' })
    expect(result.changes.map(x => x.path)).toEqual(['list', 'nil', 'values'])
  })
  it('groups a first release by individual page', () => {
    const result = comparePageStudioContent(null, { pages: [page('a'), page('b')] })
    expect(result.changes.map(change => change.path)).toEqual(['pages › a', 'pages › b'])
    expect(result.changes.every(change => change.kind === 'added')).toBe(true)
  })
  it('preserves absent versus empty and primitive arrays', () => {
    const result = comparePageStudioContent({}, { empty: [], values: [1] })
    expect(result.changes).toEqual([
      { path: 'empty', kind: 'added', before: undefined, after: '[]' },
      { path: 'values', kind: 'added', before: undefined, after: '[\n  1\n]' }
    ])
  })
  it('bounds large comparisons and marks incomplete results', () => {
    const result = comparePageStudioContent({}, { a: 1, b: 2, c: 3 }, 2)
    expect(result.changes).toHaveLength(2)
    expect(result.complete).toBe(false)
    expect(comparePageStudioContent({}, { a: 1, b: 2 }, 2).complete).toBe(true)
  })
  it('retains untrusted strings as text and distinguishes absent from empty', () => {
    expect(comparePageStudioContent({ x: '' }, { x: '<script>alert(1)</script>', y: null }).changes).toEqual([
      { path: 'x', kind: 'changed', before: '', after: '<script>alert(1)</script>' },
      { path: 'y', kind: 'added', before: undefined, after: 'null' }
    ])
  })
})
