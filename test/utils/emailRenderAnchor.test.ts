import { describe, expect, it } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

describe('renderTemplateDocument — block anchor IDs', () => {
  it('renders a safe anchor ID on the block wrapper row', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['h'] } },
      h: {
        type: 'Heading',
        data: {
          props: { level: 'h2', text: 'Intro', anchorId: 'intro-section' },
          style: {}
        }
      }
    })

    expect(html).toContain('<tr id="intro-section">')
  })

  it('omits unsafe anchor IDs instead of escaping them into markup', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['t'] } },
      t: {
        type: 'Text',
        data: {
          props: { text: 'Body', anchorId: 'bad" onclick="alert(1)' },
          style: {}
        }
      }
    })

    expect(html).not.toContain('onclick')
    expect(html).not.toContain('id="bad')
  })

  it('supports anchor IDs on nested container and child rows', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['c'] } },
      c: {
        type: 'Container',
        data: {
          props: { anchorId: 'offer-wrapper' },
          style: {},
          childrenIds: ['b']
        }
      },
      b: {
        type: 'Button',
        data: {
          props: { text: 'View offer', url: 'https://example.com', anchorId: 'offer-cta' },
          style: {}
        }
      }
    })

    expect(html).toContain('<tr id="offer-wrapper">')
    expect(html).toContain('<tr id="offer-cta">')
  })
})
