import { describe, it, expect } from 'vitest'
import { renderSavedReplyTemplate, extractVariables } from '~~/server/utils/socialInbox/savedReplies'

describe('renderSavedReplyTemplate', () => {
  it('substitutes {{variables}} from the map', () => {
    expect(renderSavedReplyTemplate('Hi {{name}}, thanks!', { name: 'Sam' })).toBe('Hi Sam, thanks!')
  })
  it('trims variable whitespace and supports repeats', () => {
    expect(renderSavedReplyTemplate('{{ a }} {{a}}', { a: 'x' })).toBe('x x')
  })
  it('leaves unknown variables as empty string', () => {
    expect(renderSavedReplyTemplate('Hi {{name}}{{missing}}', { name: 'Sam' })).toBe('Hi Sam')
  })
  it('returns the content unchanged when there are no variables', () => {
    expect(renderSavedReplyTemplate('plain text', {})).toBe('plain text')
  })
})

describe('extractVariables', () => {
  it('lists unique variable names', () => {
    expect(extractVariables('{{a}} {{ b }} {{a}}')).toEqual(['a', 'b'])
  })
  it('returns [] when none', () => {
    expect(extractVariables('no vars')).toEqual([])
  })
})
