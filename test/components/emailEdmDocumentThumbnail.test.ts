import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmDocumentThumbnail from '~~/app/components/email/builder/EdmDocumentThumbnail.vue'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

const document: EdmFlyhubDocument = {
  root: { type: 'EmailLayout', data: { childrenIds: ['h', 't'] } },
  h: { type: 'Heading', data: { props: { level: 'h2', text: 'Saved headline' }, style: {} } },
  t: { type: 'Text', data: { props: { text: 'Saved body copy' }, style: {} } }
}

async function renderThumbnail(width?: number) {
  const app = createSSRApp({
    render: () => h(EdmDocumentThumbnail, width ? { document, width } : { document })
  })
  return renderToString(app)
}

describe('EdmDocumentThumbnail', () => {
  it('renders a saved document through the real block renderer', async () => {
    const html = await renderThumbnail()
    expect(html).toContain('Saved headline')
    expect(html).toContain('Saved body copy')
    expect(html).not.toContain('Unknown block')
  })

  it('scales the inner canvas down to fit the target width', async () => {
    const html = await renderThumbnail(300)
    expect(html).toContain('width:600px')
    expect(html).toContain('scale(0.5)')
    expect(html).toContain('pointer-events:none')
  })
})
