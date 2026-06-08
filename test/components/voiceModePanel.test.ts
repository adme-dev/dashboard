import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VoiceModePanel from '~~/app/components/ai/VoiceModePanel.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: { name: 'UButton', props: ['icon', 'label'], template: '<button><slot />{{ label }}</button>' }
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VoiceModePanel, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VoiceModePanel', () => {
  it('shows a Listening label while listening', async () => {
    const html = await render({ phase: 'listening', volumeLevel: 0.2, error: null })
    expect(html).toContain('Listening')
  })
  it('shows a confirm prompt while awaiting confirmation', async () => {
    const html = await render({ phase: 'awaitingConfirm', volumeLevel: 0, error: null })
    expect(html.toLowerCase()).toContain('confirm')
  })
  it('renders the error when present', async () => {
    const html = await render({ phase: 'listening', volumeLevel: 0, error: 'Mic blocked' })
    expect(html).toContain('Mic blocked')
  })
})
