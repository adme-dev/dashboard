import { describe, expect, it } from 'vitest'
import { getBlockDefinition, renderBlock } from '../../workers/email-rendering/src/render/block-registry'
import { BLOCKS_LOADED } from '../../workers/email-rendering/src/render/blocks'
import { renderFlyhubDocumentToHtml } from '../../workers/email-rendering/src/render/flyhub-html-renderer'
import type { BlockRenderContext, FlyhubBlock } from '../../workers/email-rendering/src/render/blocks/types'

void BLOCKS_LOADED

const quoted = 'https://dealer.example/offer?q="vip"&src=edm'
const escaped = 'https://dealer.example/offer?q=&quot;vip&quot;&amp;src=edm'
const context: BlockRenderContext = {
  primaryColor: '#2f4574',
  fontFamily: 'Arial, sans-serif',
  _document: {}
}

function block(type: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}): FlyhubBlock {
  return { type, data: { props, style: {}, childrenIds: [], ...extra } }
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/\shref="([^"]*)"/g)].map(match => match[1]!)
}

describe('button and image href escaping', () => {
  it('keeps a quoted button URL inside one href on HTML, MJML, inline MJML, and Outlook VML', () => {
    const button = block('Button', { text: 'Book', url: quoted })
    const rich = block('Button', { text: 'Book', url: quoted }, { style: { borderWidth: 2, borderStyle: 'solid', borderColor: '#112233' } })
    const outlook = block('Button', { text: 'Book', url: quoted, outlookVml: true })
    const inline = getBlockDefinition('Button')!.renderMjmlInline!(button, context)
    const richInline = getBlockDefinition('Button')!.renderMjmlInline!(rich, context)
    for (const html of [renderBlock(button, 'html', context), renderBlock(button, 'mjml', context), renderBlock(rich, 'mjml', context), inline, richInline, renderBlock(outlook, 'html', context)]) {
      expect(hrefs(html)).toContain(escaped)
      expect(html).not.toContain('href="https://dealer.example/offer?q="')
    }
    expect(renderBlock(outlook, 'html', context)).toContain(`v:roundrect`)
    expect(hrefs(renderBlock(outlook, 'html', context)).every(href => href === escaped)).toBe(true)
  })

  it('keeps a quoted image link inside desktop, mobile, dark, and MJML hrefs', () => {
    const image = block('Image', { url: 'https://cdn.example/car.png', alt: 'Car', linkHref: quoted }, {
      mobile: { props: { url: 'https://cdn.example/car-mobile.png', alt: 'Car' } }
    })
    const dark = block('Image', { url: 'https://cdn.example/light.png', alt: 'Logo', linkHref: quoted, darkSrc: 'https://cdn.example/dark.png' })
    const inline = getBlockDefinition('Image')!.renderMjmlInline!(image, context)
    for (const html of [
      renderBlock(image, 'html', context),
      renderBlock(image, 'mjml', context),
      inline,
      renderBlock(dark, 'html', { ...context, darkMode: true })
    ]) {
      expect(hrefs(html)).toEqual([escaped])
      expect(html).not.toContain('href="https://dealer.example/offer?q="')
    }
    const plain = renderBlock(block('Image', { url: 'https://cdn.example/car.png', alt: 'Car' }), 'html', context)
    expect(hrefs(plain)).toEqual([])
  })

  it('blocks a javascript button or image link and leaves a merge token for the existing resolver', () => {
    const script = renderBlock(block('Button', { text: 'Go', url: 'javascript:alert(1)' }), 'html', context)
    expect(hrefs(script)).toContain('#')
    expect(script).not.toContain('javascript:')
    const linked = renderBlock(block('Image', { url: 'https://cdn.example/car.png', alt: 'Car', linkHref: ' javascript:alert(1)' }), 'html', context)
    expect(hrefs(linked)).toEqual(['#'])

    const token = '{{ offer_url | https://dealer.example/offer?q="vip"&src=edm }}'
    const html = renderFlyhubDocumentToHtml({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['button', 'image'] } },
      button: { type: 'Button', data: { props: { text: 'Book', url: token } } },
      image: { type: 'Image', data: { props: { url: 'https://cdn.example/car.png', alt: 'Car', linkHref: '{{ offer_url }}' } } }
    })
    expect(hrefs(html)).toContain(`{{ offer_url | https://dealer.example/offer?q=&quot;vip&quot;&amp;src=edm }}`)
    expect(hrefs(html)).toContain('{{ offer_url }}')

    const resolved = renderFlyhubDocumentToHtml({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['button'] } },
      button: { type: 'Button', data: { props: { text: 'Book', url: '{{ offer_url }}' } } }
    }, { variables: { offer_url: quoted } })
    expect(hrefs(resolved)).toContain(escaped)
    expect(resolved).not.toContain('&amp;amp;')
    expect(resolved).not.toContain('&quot;quot;')

    const fallback = renderFlyhubDocumentToHtml({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['button'] } },
      button: { type: 'Button', data: { props: { text: 'Book', url: token } } }
    }, { variables: { other: 'unused' } })
    expect(hrefs(fallback)).toContain(escaped)
    expect(fallback).not.toContain('&amp;amp;')
  })

  it('blocks resolved script schemes after merge and keeps safe hrefs encoded once', () => {
    const document = (offerUrl: string) => renderFlyhubDocumentToHtml({
      root: { type: 'EmailLayout', data: { props: { darkMode: true }, childrenIds: ['button', 'image', 'dark', 'outlook'] } },
      button: { type: 'Button', data: { props: { text: 'Book', url: '{{ offer_url }}' } } },
      image: { type: 'Image', data: { props: { url: 'https://cdn.example/car.png', alt: 'Car', linkHref: '{{ offer_url }}' }, mobile: { props: { url: 'https://cdn.example/car-mobile.png', alt: 'Car' } } } },
      dark: { type: 'Image', data: { props: { url: 'https://cdn.example/light.png', alt: 'Logo', linkHref: '{{ offer_url }}', darkSrc: 'https://cdn.example/dark.png' } } },
      outlook: { type: 'Button', data: { props: { text: 'Book', url: '{{ offer_url }}', outlookVml: true } } }
    }, { variables: { offer_url: offerUrl } })
    for (const offerUrl of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      ' \n\tjavascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,hi',
      'vbscript:msgbox(1)'
    ]) {
      const html = document(offerUrl)
      const links = hrefs(html)
      expect(links).toHaveLength(5)
      expect(links.every(href => href === '#')).toBe(true)
    }
    const safe = document('mailto:sales@example.com')
    expect(hrefs(safe).every(href => href === 'mailto:sales@example.com')).toBe(true)
    const phone = document('tel:+61390000000')
    expect(hrefs(phone).every(href => href === 'tel:+61390000000')).toBe(true)
    const https = document(quoted)
    expect(hrefs(https).every(href => href === escaped)).toBe(true)
    expect(https).not.toContain('&amp;amp;')
    const preview = renderFlyhubDocumentToHtml({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['button'] } },
      button: { type: 'Button', data: { props: { text: 'Book', url: '{{ offer_url }}' } } }
    })
    expect(hrefs(preview)).toContain('{{ offer_url }}')
    const imported = renderFlyhubDocumentToHtml({
      root: { type: 'EmailLayout', data: { props: {}, childrenIds: ['raw'] } },
      raw: { type: 'Html', data: { props: { documentMode: 'email', contents: '<a href="&#106;avascript:alert(1)">Offer</a><a href=javascript:alert(1)>Go</a>' } } }
    })
    expect(imported).toBe('<a href="#">Offer</a><a href="#">Go</a>')
  })
})
