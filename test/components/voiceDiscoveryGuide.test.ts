import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VoiceDiscoveryGuide from '~~/app/components/ai/VoiceDiscoveryGuide.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: { name: 'UButton', props: ['ariaLabel'], template: '<button :aria-label="ariaLabel"><slot /></button>' }
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VoiceDiscoveryGuide, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
  return renderToString(app)
}

describe('VoiceDiscoveryGuide', () => {
  it('explains one-shot and hands-free Voice AI before first use', async () => {
    const html = await render({ permission: 'prompt', handsFreeAvailable: true })

    expect(html).toContain('Voice AI is ready')
    expect(html).toContain('Voice message')
    expect(html).toContain('Start Voice')
    expect(html).toContain('ask for microphone access')
  })

  it('shows when microphone access is already enabled', async () => {
    const html = await render({ permission: 'granted', handsFreeAvailable: true })

    expect(html).toContain('Microphone access is on')
  })

  it('warns when microphone access is blocked', async () => {
    const html = await render({ permission: 'denied', handsFreeAvailable: false })

    expect(html).toContain('Microphone access is blocked')
  })
})
