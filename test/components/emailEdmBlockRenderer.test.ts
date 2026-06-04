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

  it('renders feature-grid preview items', async () => {
    const html = await renderBlock('feature-grid', {
      features: [
        { icon: '•', heading: 'Plan', description: 'Map the launch.' },
        { icon: '•', heading: 'Build', description: 'Create assets.' }
      ]
    })
    expect(html).toContain('Plan')
    expect(html).toContain('Map the launch.')
    expect(html).toContain('Build')
    expect(html).not.toContain('Unknown block')
  })

  it('renders header, menu, cta-banner, and footer previews', async () => {
    expect(await renderBlock('header', { tagline: 'Your brand' })).toContain('Your brand')
    expect(await renderBlock('menu', { items: [{ label: 'Work', url: '#' }] })).toContain('Work')
    expect(await renderBlock('cta-banner', { heading: 'Ready?', ctaText: 'Start now' })).toContain('Ready?')
    expect(await renderBlock('footer', { additionalText: 'You subscribed to updates.' })).toContain('You subscribed to updates.')
  })
})
