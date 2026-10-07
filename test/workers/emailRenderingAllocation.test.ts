import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleEmailRender } from '../../workers/email-rendering/src/handleRender'
import { customerFixture } from '../fixtures/emailRendering'
import { MAX_RENDER_OUTPUT_BYTES, snapshotRenderInput } from '../../shared/emailRendering/bounds'

const agencyRequest = (type: string, props: Record<string, unknown>) => ({ version: 1, expectedEnvironment: 'staging', operation: 'document', options: {}, document: { root: { type: 'EmailLayout', data: { childrenIds: ['block'] } }, block: { type, data: { props } } } })
afterEach(() => vi.restoreAllMocks())

describe('allocation checks precede repeated output construction', () => {
  it('rejects repeated menu separators before an oversized join', () => {
    const input = agencyRequest('menu', { items: Array.from({ length: 150 }, () => ({ label: 'Link', url: '#' })), separator: 'x'.repeat(1024 * 1024) })
    expect(() => snapshotRenderInput(input)).not.toThrow()
    const original = Array.prototype.join
    let oversizedJoin = false
    vi.spyOn(Array.prototype, 'join').mockImplementation(function (separator = ',') {
      const bytes = this.reduce((total: number, item: unknown) => total + String(item ?? '').length, 0) + Math.max(0, this.length - 1) * separator.length
      if (bytes > MAX_RENDER_OUTPUT_BYTES) {
        oversizedJoin = true
        throw new Error('intercepted oversized join')
      }
      return original.call(this, separator)
    })
    expect(handleEmailRender(input, 'staging')).toMatchObject({ ok: false, error: { code: 'LIMIT_EXCEEDED' } })
    expect(oversizedJoin).toBe(false)
  })

  it('stops repeated shared feature properties before constructing all cells', () => {
    const input = agencyRequest('feature-grid', { features: Array.from({ length: 150 }, () => ({ icon: '', heading: 'Feature', description: '' })), iconColor: 'x'.repeat(1024 * 1024) })
    expect(() => snapshotRenderInput(input)).not.toThrow()
    const original = String.prototype.replace
    let headingsEscaped = 0
    vi.spyOn(String.prototype, 'replace').mockImplementation(function (...args: Parameters<typeof original>) {
      if (String(this) === 'Feature' && ++headingsEscaped > 100) throw new Error('intercepted unchecked repeated cells')
      return Reflect.apply(original, this, args)
    })
    expect(handleEmailRender(input, 'staging')).toMatchObject({ ok: false, error: { code: 'LIMIT_EXCEEDED' } })
    expect(headingsEscaped).toBeLessThan(100)
  })

  it('rejects cumulative customer variable expansion before oversized intermediary documents', () => {
    const text = '{{site.name}}'.repeat(615)
    const input = { version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', template: { ...customerFixture.template, identity: undefined, blocks: Array.from({ length: 30 }, (_, i) => ({ id: `text-${i}`, type: 'text', text })) }, context: { siteName: 'x'.repeat(8000), formName: 'Form', fields: [] } }
    delete input.template.identity
    expect(() => snapshotRenderInput(input)).not.toThrow()
    const original = String.prototype.replace
    let expanded = 0
    vi.spyOn(String.prototype, 'replace').mockImplementation(function (...args: Parameters<typeof original>) {
      if (String(this) === text && String(args[0]).includes('site.name|form.name')) {
        expanded += 615 * 8000
        if (expanded > MAX_RENDER_OUTPUT_BYTES) throw new Error('intercepted unchecked expansion')
      }
      return Reflect.apply(original, this, args)
    })
    expect(handleEmailRender(input, 'staging')).toMatchObject({ ok: false, error: { code: 'LIMIT_EXCEEDED' } })
    expect(expanded).toBeLessThanOrEqual(MAX_RENDER_OUTPUT_BYTES)
  })
})

describe('bounded string operations', () => {
  it('preflights escaped UTF-8 and repeated joins before allocation', async () => {
    const { boundedJoin, boundedReplace, boundedText } = await import('../../workers/email-rendering/src/render/boundedText')
    const { createRenderBudget } = await import('../../shared/emailRendering/bounds')
    expect(boundedJoin(['é', 'é'], '|', createRenderBudget(5))).toBe('é|é')
    expect(() => boundedJoin(['é', 'é'], '|', createRenderBudget(4))).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(boundedText(createRenderBudget(4))`[${'é'}]`).toBe('[é]')
    expect(() => boundedText(createRenderBudget(3))`[${'é'}]`).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(boundedReplace('é&', /&/g, () => '&amp;', createRenderBudget(7))).toBe('é&amp;')
    const replace = vi.spyOn(String.prototype, 'replace')
    expect(() => boundedReplace('é&', /&/g, () => '&amp;', createRenderBudget(6))).toThrowError(expect.objectContaining({ code: 'LIMIT_EXCEEDED' }))
    expect(replace).not.toHaveBeenCalled()
  })

  it('bounds repeated answers markup during customer document construction', () => {
    const input = { version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', template: { ...customerFixture.template, blocks: Array.from({ length: 30 }, (_, i) => ({ id: `answers-${i}`, type: 'answers' })) }, context: { siteName: 'Site', formName: 'Form', fields: Array.from({ length: 500 }, (_, i) => ({ id: `field-${i}`, type: 'text', name: 'x'.repeat(8000) })) } }
    expect(() => snapshotRenderInput(input)).not.toThrow()
    const original = String.prototype.replace
    let fieldExpansions = 0
    vi.spyOn(String.prototype, 'replace').mockImplementation(function (...args: Parameters<typeof original>) {
      if (String(this).length === 8000 && ++fieldExpansions > 2500) throw new Error('intercepted unchecked answers assembly')
      return Reflect.apply(original, this, args)
    })
    expect(handleEmailRender(input, 'staging')).toMatchObject({ ok: false, error: { code: 'LIMIT_EXCEEDED' } })
    expect(fieldExpansions).toBeLessThan(2500)
  })
})

describe('customer image allowance compatibility', () => {
  it.each([false, true])('preserves four 512 KiB images at the 2 MiB allowance (distinct: %s)', (distinct) => {
    const source = `data:image/png;base64,${Buffer.alloc(512 * 1024).toString('base64')}`
    const ids = Array.from({ length: 4 }, (_, index) => `00000000-0000-4000-8000-${String(distinct ? index : 0).padStart(12, '0')}`)
    const { identity: _identity, ...template } = customerFixture.template
    const input = { version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', template: { ...template, blocks: ids.map((assetId, index) => ({ id: `image-${index}`, type: 'image', assetId, alt: 'Synthetic image', width: 320, alignment: 'center' })) }, context: { siteName: 'Site', formName: 'Form', fields: [], images: Object.fromEntries(ids.map(id => [id, source])) } }
    expect(() => snapshotRenderInput(input)).not.toThrow()
    const result = handleEmailRender(input, 'staging')
    expect(result).toMatchObject({ ok: true, value: { sample: true } })
    if (result.ok && result.operation === 'customer-preview') expect(result.value.html.split(source)).toHaveLength(5)
  })
})
