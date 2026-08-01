import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioVoiceComposer from '~~/app/components/media/VideoStudioVoiceComposer.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UFormField: { name: 'UFormField', props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UInput: { name: 'UInput', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<input :value="modelValue" :placeholder="placeholder" />' },
  UTextarea: { name: 'UTextarea', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :placeholder="placeholder" />' },
}

async function render(props: Record<string, unknown> = {}) {
  const app = createSSRApp({ render: () => h(VideoStudioVoiceComposer, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VideoStudioVoiceComposer', () => {
  beforeEach(() => {
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    vi.stubGlobal('$fetch', vi.fn())
  })

  it('renders script, title, and generation controls', async () => {
    const html = await render({
      producerBrief: 'Open with a confident hook, then mention the weekend offer.'
    })

    expect(html).toContain('Voiceover')
    expect(html).toContain('Script')
    expect(html).toContain('Title')
    expect(html).toContain('Generate')
    expect(html).toContain('Script duration appears after you write.')
    expect(html).toContain('Use producer brief')
  })

  it('renders a generated asset preview when provided', async () => {
    const html = await render({
      existingVoiceoverCount: 1,
      initialAsset: {
        id: 'voice-1',
        title: 'Opening voiceover',
        kind: 'voiceover',
        status: 'ready',
        r2KeyMaster: 'audio/voice.mp3',
        streamUrl: '/api/agency/audio/assets/voice-1/stream',
        durationSec: 8,
      }
    })

    expect(html).toContain('Opening voiceover')
    expect(html).toContain('8s')
    expect(html).toContain('Add to timeline')
    expect(html).toContain('Replace')
  })
})
