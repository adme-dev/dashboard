import { describe, expect, it } from 'vitest'
import { replaceMergeFields } from '../../workers/email-rendering/src/render/mergeFields'
import { createRenderBudget } from '../../shared/emailRendering/bounds'

describe('bounded literal merge fields', () => {
  it('treats field names as literal tokens', () => {
    expect(replaceMergeFields('{{site.name}} {{siteXname}} {{a+}}', { 'site.name': 'Site', 'a+': 'plus' })).toBe('Site {{siteXname}} plus')
  })
  it.each(['plain', '$$', '$&', '$`', '$\'', '$1', '$$ $& $`'])('preserves native replacement-string semantics for %s', (value) => {
    const html = 'before {{name}} between {{name}} after'
    expect(replaceMergeFields(html, { name: value })).toBe(html.replace(/{{name}}/g, value))
  })
  it('charges replacement chunks before allocating the joined expansion', () => {
    const budget = createRenderBudget(20)
    expect(() => replaceMergeFields('{{a}}{{a}}{{a}}', { a: '1234567890' }, budget)).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
  })
})
