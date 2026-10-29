import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmBlockRenderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'
import { renderBlock } from '~~/workers/email-rendering/src/render/block-registry'
import { BLOCKS_LOADED } from '~~/workers/email-rendering/src/render/blocks'
import type { BlockRenderContext, FlyhubBlock } from '~~/workers/email-rendering/src/render/blocks/types'

void BLOCKS_LOADED
const context: BlockRenderContext = {
  primaryColor: '#2f4574', fontFamily: 'Arial, sans-serif', _document: {},
  dealerContext: { name: 'Studio', address: '100 George Street', website: 'https://example.com' },
  mergeFields: { unsubscribe_url: 'https://example.com/unsubscribe', current_year: '2026' }
}

async function outputs(props: Record<string, unknown>, style: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(EdmBlockRenderer, { type: 'footer', props, style }) })
  app.component('UIcon', { render: () => h('span') })
  const preview = await renderToString(app)
  const block = { type: 'footer', data: { props, style, childrenIds: [] } } as FlyhubBlock
  return [preview, renderBlock(block, 'html', context), renderBlock(block, 'mjml', context)]
}

describe('native modern footer preview and delivery color parity', () => {
  it('uses the explicit light text color for dark footer copy and unsubscribe links in every renderer', async () => {
    const [preview, html, mjml] = await outputs({ additionalText: 'Stay connected.' }, { backgroundColor: '#111827', color: '#e2e8f0' })
    for (const output of [preview, html, mjml]) {
      expect(output).toContain('#e2e8f0')
      expect(output).not.toContain('#6b7280')
      expect(output).not.toContain('#9ca3af')
      expect(output).toContain('Stay connected.')
      expect(output).toContain('Unsubscribe')
    }
    expect(html).toContain('color:#e2e8f0;text-decoration:underline;')
    expect(mjml).toContain('color="#e2e8f0"')
  })

  it('honors a safe explicit textColor before the block style color', async () => {
    for (const output of await outputs({ additionalText: 'Welcome', textColor: '#FAF5EC' }, { color: '#111827' })) {
      expect(output).toContain('#FAF5EC')
      expect(output).not.toContain('color:#111827')
      expect(output).not.toContain('color="#111827"')
    }
  })

  it('uses the same legible default when no explicit color is provided', async () => {
    for (const output of await outputs({ additionalText: 'Company information' }, {})) {
      expect(output).toContain('#6b7280')
      expect(output).not.toContain('#9ca3af')
    }
  })

  it('rejects attribute or CSS declaration injection in explicit text colors', async () => {
    const bad = '#fff;position:fixed;" onmouseover="alert(1)'
    for (const output of await outputs({ additionalText: 'Company information', textColor: bad }, { color: bad })) {
      expect(output).toContain('#6b7280')
      expect(output).not.toContain('onmouseover')
      expect(output).not.toContain('position:fixed')
    }
  })
})
