import { describe, expect, it } from 'vitest'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

const baseDoc = {
  root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a'] } },
  a: { type: 'Text', data: { props: { text: 'Body copy' }, style: { color: '#111111' } } }
}

describe('responsive server render', () => {
  it('keeps documents without responsive fields byte-identical', () => {
    const before = renderTemplateDocument(baseDoc)
    const after = renderTemplateDocument(JSON.parse(JSON.stringify(baseDoc)))

    expect(after).toBe(before)
    expect(after).not.toContain('edm-r-a')
    expect(after).not.toContain('edm-hide-mobile')
  })

  it('emits mobile media CSS only for blocks with mobile overrides', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a'] } },
      a: {
        type: 'Text',
        data: {
          props: { text: 'Body copy' },
          style: { color: '#111111' },
          mobile: { style: { color: '#222222', fontSize: 14 } }
        }
      }
    })

    expect(html).toContain('class="edm-r-a"')
    expect(html).toMatch(/<tr class="edm-r-a"/)
    expect(html).toContain('@media only screen and (max-width: 620px)')
    expect(html).toContain('.edm-r-a { color: #222222 !important; font-size: 14px !important; }')
  })

  it('emits hide-on-device classes', () => {
    const html = renderTemplateDocument({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['a', 'b'] } },
      a: { type: 'Text', data: { props: { text: 'Mobile hidden' }, hideOnMobile: true } },
      b: { type: 'Text', data: { props: { text: 'Desktop hidden' }, hideOnDesktop: true } }
    })

    expect(html).toContain('class="edm-hide-mobile"')
    expect(html).toContain('class="edm-hide-desktop"')
    expect(html).toContain('.edm-hide-mobile { display: none !important; max-height: 0 !important; overflow: hidden !important; }')
    expect(html).toContain('.edm-hide-desktop { display: none !important; max-height: 0 !important; overflow: hidden !important; }')
    expect(html).toContain('@media only screen and (max-width: 620px)')
  })
})
