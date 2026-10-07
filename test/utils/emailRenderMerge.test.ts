// test/utils/emailRenderMerge.test.ts
import { describe, it, expect } from 'vitest'
import { renderTemplateDocumentLocally as renderTemplateDocument } from '~~/workers/email-rendering/src/render/document'

describe('renderTemplateDocument — merge fields', () => {
  it('substitutes {{tokens}} from variables', () => {
    const doc = {
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h'] } },
      h: { type: 'Heading', data: { props: { level: 'h1', text: 'Hi {{first_name}}' }, style: {} } }
    }
    const html = renderTemplateDocument(doc, { variables: { first_name: 'Paul' } })
    expect(html).toContain('Hi Paul')
    expect(html).not.toContain('{{first_name}}')
  })

  it('leaves unknown tokens untouched', () => {
    const doc = {
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h'] } },
      h: { type: 'Heading', data: { props: { level: 'h1', text: '{{unknown}}' }, style: {} } }
    }
    const html = renderTemplateDocument(doc, { variables: { first_name: 'Paul' } })
    expect(html).toContain('{{unknown}}')
  })
})
