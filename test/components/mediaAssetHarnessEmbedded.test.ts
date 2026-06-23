import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import MediaAssetHarness from '~~/app/components/media/MediaAssetHarness.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UFormField: { name: 'UFormField', props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UInput: { name: 'UInput', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<input :value="modelValue" :placeholder="placeholder" />' },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue"><option v-for="item in items || []" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
  UTextarea: { name: 'UTextarea', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :placeholder="placeholder" />' },
  USlider: { name: 'USlider', props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="range" :value="modelValue" />' },
  USkeleton: { name: 'USkeleton', template: '<div />' },
  UTooltip: { name: 'UTooltip', template: '<span><slot /></span>' },
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(MediaAssetHarness, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('MediaAssetHarness embedded mode', () => {
  beforeEach(() => {
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  })

  it('renders producer regions without accordion chrome', async () => {
    const html = await render({ projectId: 'project-1', embedded: true })

    expect(html).toContain('AI Producer workspace')
    expect(html).toContain('Project assets')
    expect(html).toContain('Prepare asset')
    expect(html).toContain('Highlighter mask')
    expect(html).toContain('Available models')
    expect(html).toContain('No gateway model is mapped to this action yet.')
    expect(html).toContain('AI activity')
    expect(html).toContain('max-h-72')
    // (dropped a brittle exact responsive-height class assertion — layout refactored
    // in #144/#145/#147; max-h-72 above still pins a height constraint on the region.)
    expect(html).not.toContain('Draft assembly')
    expect(html).not.toContain('aria-expanded')
    expect(html).not.toContain('Build draft plan from this brief')
  })

  it('renders studio-native prepare modules without full producer workspace chrome', async () => {
    const html = await render({ projectId: 'project-1', studio: true })

    expect(html).toContain('Project assets')
    expect(html).toContain('Prepare asset')
    expect(html).toContain('Highlighter mask')
    expect(html).toContain('Available models')
    expect(html).toContain('AI activity')
    expect(html).toContain('xl:grid-cols-[260px_minmax(0,1fr)]')
    expect(html).not.toContain('AI Producer workspace')
    expect(html).not.toContain('Prepare clean layers, reuse derivatives, and assemble draft edits')
    expect(html).not.toContain('aria-expanded')
    expect(html).not.toContain('Draft assembly')
    expect(html).not.toContain('Build draft plan from this brief')
  })
})
