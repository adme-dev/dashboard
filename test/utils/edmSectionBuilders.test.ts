// test/utils/edmSectionBuilders.test.ts
import { describe, it, expect } from 'vitest'
import {
  picsum,
  heroImage,
  ctaBanner,
  featureRow,
  brandHeader,
  navMenu,
  richFooter,
  blogCardRow,
  clientLogoStrip,
  storyGrid,
  productCard,
  productRow,
  imageTextRow
} from '~~/app/utils/edmSectionBuilders'
import { createEmptyDocument, generateBlockId } from '~~/app/types/edm'
import type { EdmFlyhubBlock, EdmFlyhubDocument } from '~~/app/types/edm'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'

describe('picsum', () => {
  it('builds a seeded Lorem Picsum URL', () => {
    expect(picsum('hero', 600, 400)).toBe('https://picsum.photos/seed/hero/600/400')
  })

  it('encodes seeds with unsafe characters', () => {
    expect(picsum('a b/c', 100, 50)).toBe('https://picsum.photos/seed/a%20b%2Fc/100/50')
  })
})

describe('native-block builders emit intersection types', () => {
  it('heroImage → hero-section with a picsum image', () => {
    const blk = heroImage({ heading: 'Launch day' })
    expect(blk.type).toBe('hero-section')
    expect(blk.data.props?.imageUrl as string).toContain('picsum.photos')
    expect(blk.data.props?.heading).toBe('Launch day')
  })

  it('ctaBanner → cta-banner', () => {
    const blk = ctaBanner({ heading: 'Ready?' })
    expect(blk.type).toBe('cta-banner')
    expect(blk.data.props?.heading).toBe('Ready?')
  })

  it('featureRow → feature-grid', () => {
    const blk = featureRow({})
    expect(blk.type).toBe('feature-grid')
    expect(Array.isArray(blk.data.props?.features)).toBe(true)
  })

  it('brandHeader → header', () => {
    expect(brandHeader({ tagline: 'Brand' }).type).toBe('header')
  })

  it('navMenu → menu', () => {
    const blk = navMenu({})
    expect(blk.type).toBe('menu')
    expect(Array.isArray(blk.data.props?.items)).toBe(true)
  })

  it('richFooter → footer', () => {
    expect(richFooter({}).type).toBe('footer')
  })
})

describe('Html rich-layout builders', () => {
  const htmlBuilders = [
    { name: 'blogCardRow', build: () => blogCardRow({ cards: [{ date: 'Jun 4', title: 'My Blog Post' }, { date: 'Jun 5', title: 'Second Story' }] }), copy: 'My Blog Post' },
    { name: 'clientLogoStrip', build: () => clientLogoStrip({ brands: [{ name: 'Acme Co' }, { name: 'Globex' }] }), copy: 'Acme Co' },
    { name: 'storyGrid', build: () => storyGrid({ stories: [{ heading: 'Story One', blurb: 'Short blurb.' }] }), copy: 'Story One' },
    { name: 'productCard', build: () => productCard({ name: 'Campaign Kit', price: '$249' }), copy: 'Campaign Kit' },
    { name: 'productRow', build: () => productRow({ products: [{ name: 'Kit A', price: '$99' }, { name: 'Kit B', price: '$199' }] }), copy: 'Kit A' },
    { name: 'imageTextRow', build: () => imageTextRow({ heading: 'Behind the build', text: 'How we did it.' }), copy: 'Behind the build' }
  ]

  for (const { name, build, copy } of htmlBuilders) {
    it(`${name} → Html with email-safe table, picsum image, and caller copy`, () => {
      const blk = build()
      expect(blk.type).toBe('Html')
      const contents = blk.data.props?.contents as string
      expect(typeof contents).toBe('string')
      expect(contents).toContain('<table')
      expect(contents).toContain('picsum.photos')
      expect(contents).toContain(copy)
      // email-safe: no flexbox/grid layout
      expect(contents).not.toContain('display:flex')
      expect(contents).not.toContain('display: flex')
    })
  }

  it('escapes caller-supplied text to avoid breaking markup', () => {
    const blk = productCard({ name: '<script>x</script>', price: '$1' })
    const contents = blk.data.props?.contents as string
    expect(contents).not.toContain('<script>x</script>')
    expect(contents).toContain('&lt;script&gt;')
  })
})

function assembleDocument(blocks: { type: string, data: EdmFlyhubBlock['data'] }[]): EdmFlyhubDocument {
  const doc = createEmptyDocument()
  doc.root.data.childrenIds = []
  for (const tmpl of blocks) {
    const id = generateBlockId()
    doc[id] = { type: tmpl.type, data: structuredClone(tmpl.data) }
    doc.root.data.childrenIds!.push(id)
  }
  return doc
}

describe('rendered document', () => {
  it('renders builders to real email HTML with picsum + copy and no placeholder', () => {
    const doc = assembleDocument([
      brandHeader({ tagline: 'The Agency' }),
      heroImage({ heading: 'Spring campaign', subheading: 'Fresh creative is live.' }),
      blogCardRow({ cards: [{ date: 'Jun 4', title: 'Unique Blog Headline' }, { date: 'Jun 5', title: 'Another Headline' }] }),
      ctaBanner({ heading: 'Book a call' }),
      richFooter({})
    ])

    const html = renderTemplateDocument(doc, { subjectLine: 'Subj', previewText: 'Preview' })

    expect(html).toContain('picsum.photos')
    expect(html).toContain('Unique Blog Headline')
    expect(html).toContain('Spring campaign')
    expect(html).not.toContain('available in upcoming update')
  })
})
