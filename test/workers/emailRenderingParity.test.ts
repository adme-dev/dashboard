import { describe, expect, it } from 'vitest'
import { handleEmailRender } from '../../workers/email-rendering/src/handleRender'
import { documentFixtures, customerFixture } from '../fixtures/emailRendering'
import golden from '../fixtures/emailRenderingGolden.json'

describe('private renderer output parity with the captured pre-extraction artifact', () => {
  it.each(documentFixtures)('preserves $name HTML exactly across independent requests', (fixture) => {
    const request = { version: 1, expectedEnvironment: 'staging', operation: 'document', document: fixture.document, options: fixture.options }
    for (let i = 0; i < 2; i++) {
      expect(handleEmailRender(request, 'staging')).toMatchObject({ ok: true, value: { html: golden.documents[fixture.name as keyof typeof golden.documents] } })
    }
  })
  it('preserves the restricted customer preview including inline media and CSP', () => {
    expect(handleEmailRender({ version: 1, expectedEnvironment: 'staging', operation: 'customer-preview', ...customerFixture }, 'staging'))
      .toMatchObject({ ok: true, value: golden.customer })
  })
  it('stops repeated large blocks before constructing an oversized joined document', () => {
    const document = { root: { type: 'EmailLayout', data: { childrenIds: Array(20).fill('text') } }, text: { type: 'Text', data: { props: { text: 'x'.repeat(1024 * 1024) } } } }
    expect(handleEmailRender({ version: 1, expectedEnvironment: 'staging', operation: 'document', document, options: {} }, 'staging'))
      .toMatchObject({ ok: false, error: { code: 'LIMIT_EXCEEDED' } })
  })
  it('does not resolve inherited object keys as missing child blocks', () => {
    const document = { root: { type: 'EmailLayout', data: { childrenIds: ['toString', 'constructor'] } } }
    const result = handleEmailRender({ version: 1, expectedEnvironment: 'staging', operation: 'document', document, options: {} }, 'staging')
    expect(result).toMatchObject({ ok: true, value: { html: expect.stringContaining('<!DOCTYPE html>') } })
    expect(JSON.stringify(result)).not.toContain('[undefined]')
  })
})
