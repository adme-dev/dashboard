import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmBlockRenderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'

async function renderBlock(type: string, blockProps: Record<string, unknown>, style: Record<string, unknown> = {}) {
  const app = createSSRApp({
    render: () => h(EdmBlockRenderer, { type, props: blockProps, style })
  })
  return renderToString(app)
}

describe('EmailBuilderEdmBlockRenderer custom sections', () => {
  it('renders hero-section preview content', async () => {
    const html = await renderBlock('hero-section', {
      heading: 'Simple post for Smart blog',
      subheading: 'Coordinate campaigns and launches.',
      ctaText: 'Download manual'
    })
    expect(html).toContain('Simple post for Smart blog')
    expect(html).toContain('Coordinate campaigns and launches.')
    expect(html).toContain('Download manual')
    expect(html).not.toContain('Unknown block')
  })

  it('renders hero-section cover imagery and hides CTA when omitted', async () => {
    const html = await renderBlock('hero-section', {
      imageUrl: 'https://example.com/hero.jpg',
      heading: 'Launch week',
      textColor: '#ffeeaa'
    })
    expect(html).toContain('https://example.com/hero.jpg')
    expect(html).toContain('background-size:cover')
    expect(html).toContain('background-position:center')
    expect(html).toContain('background-image:linear-gradient')
    expect(html).toContain('color:#ffeeaa')
    expect(html).not.toContain('Call to action')
    expect(html).not.toContain('Unknown block')
  })

  it('renders feature-grid preview items', async () => {
    const html = await renderBlock('feature-grid', {
      columns: 3,
      iconColor: '#0ea5e9',
      features: [
        { icon: '•', heading: 'Plan', description: 'Map the launch.' },
        { icon: '•', heading: 'Build', description: 'Create assets.' }
      ]
    })
    expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))')
    expect(html).toContain('color:#0ea5e9')
    expect(html).toContain('Plan')
    expect(html).toContain('Map the launch.')
    expect(html).toContain('Build')
    expect(html).toContain('Create assets.')
    expect(html).not.toContain('Unknown block')
  })

  it('renders header, menu, cta-banner, and footer previews', async () => {
    expect(await renderBlock('header', {})).toContain('Your brand')
    const menuHtml = await renderBlock('menu', { items: [{ label: 'Work', url: '/work' }] })
    expect(menuHtml).toContain('href="/work"')
    expect(menuHtml).toContain('Work')
    const ctaHtml = await renderBlock('cta-banner', {
      heading: 'Ready?',
      ctaText: 'Start now',
      backgroundColor: '#123456',
      textColor: '#abcdef'
    })
    expect(ctaHtml).toContain('Ready?')
    expect(ctaHtml).toContain('Start now')
    expect(ctaHtml).toContain('background-color:#123456')
    expect(ctaHtml).toContain('background-color:#abcdef')
    expect(ctaHtml).toContain('color:#abcdef')
    expect(ctaHtml).toContain('color:#123456')
    expect(await renderBlock('footer', {})).toContain('You are receiving this email because you subscribed to updates.')
  })
})
