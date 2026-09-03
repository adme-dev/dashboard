import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const canvas = readFileSync('app/components/page-studio/BuilderCanvas.vue', 'utf8')
const collection = readFileSync('app/components/page-studio/BuilderCollectionSection.vue', 'utf8')
const faq = readFileSync('app/components/page-studio/BuilderFaqSection.vue', 'utf8')
const contact = readFileSync('app/components/page-studio/BuilderContactSection.vue', 'utf8')
const header = readFileSync('app/components/page-studio/BuilderSiteHeader.vue', 'utf8')
const footer = readFileSync('app/components/page-studio/BuilderSiteFooter.vue', 'utf8')

describe('Page Studio canonical renderers', () => {
  it('dispatches expanded canonical sections explicitly', () => {
    expect(canvas).toContain('[\'features\', \'stats\', \'testimonials\', \'logo-cloud\', \'blog-grid\']')
    expect(canvas).toContain('block.type === \'faq\'')
    expect(canvas).toContain('block.type === \'contact\'')
    expect(canvas).toContain('<PageStudioBuilderCollectionSection')
    expect(faq).toContain('<UAccordion')
    expect(contact).toContain('<UButton')
  })

  it('renders inherited site shells around the editable page', () => {
    expect(canvas).toContain('<PageStudioBuilderSiteHeader')
    expect(canvas).toContain('page.headerMode !== \'hidden\'')
    expect(canvas).toContain('<PageStudioBuilderSiteFooter')
    expect(canvas).toContain('page.footerMode !== \'hidden\'')
    expect(header).toContain('shell.navigation')
    expect(footer).toContain('shell.footerGroups')
  })

  it('binds image alternatives and suppresses preview navigation', () => {
    expect(collection).toContain(':alt="item.imageAlt"')
    expect(collection).toContain('@click.prevent')
    expect(header).toContain('@click.prevent')
    expect(footer).toContain('@click.prevent')
  })
})
