import { describe, it, expect } from 'vitest'
import { renderTemplate, extractVariables } from '~~/server/utils/socialInbox/savedReplies'

describe('renderTemplate', () => {
  it('substitutes {{variables}} from the map', () => {
    expect(renderTemplate('Hi {{name}}, thanks!', { name: 'Sam' })).toBe('Hi Sam, thanks!')
  })
  it('trims variable whitespace and supports repeats', () => {
    expect(renderTemplate('{{ a }} {{a}}', { a: 'x' })).toBe('x x')
  })
  it('leaves unknown variables as empty string', () => {
    expect(renderTemplate('Hi {{name}}{{missing}}', { name: 'Sam' })).toBe('Hi Sam')
  })
  it('returns the content unchanged when there are no variables', () => {
    expect(renderTemplate('plain text', {})).toBe('plain text')
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
