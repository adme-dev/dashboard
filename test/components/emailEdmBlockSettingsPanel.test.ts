import { describe, expect, it } from 'vitest'
import { computed, reactive, ref, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import BlockSettingsPanel from '~~/app/components/email/builder/BlockSettingsPanel.vue'

// Expose the Nuxt auto-imports the component relies on.

Object.assign(globalThis, { ref, computed, reactive })

// Generic passthrough stubs for the Nuxt UI components — group headers are
// native <button>/<span> so they render regardless; we only need the U-*
// components not to crash SSR.
const passthrough = (name: string) => ({ name, template: '<div><slot /></div>' })
const stubs: Record<string, unknown> = {
  UFormField: { name: 'UFormField', props: ['label', 'help'], template: '<div>{{ label }}<slot /></div>' },
  UInput: { name: 'UInput', props: ['modelValue', 'type', 'items'], template: '<input />' },
  UTextarea: { name: 'UTextarea', props: ['modelValue'], template: '<textarea />' },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], template: '<select />' },
  USlider: { name: 'USlider', props: ['modelValue'], template: '<div class="slider" />' },
  UCheckbox: { name: 'UCheckbox', props: ['modelValue', 'label'], template: '<label><input type="checkbox" />{{ label }}</label>' },
  UBadge: { name: 'UBadge', template: '<span><slot /></span>' },
  UButton: { name: 'UButton', props: ['label', 'icon'], template: '<button><slot />{{ label }}</button>' },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UTooltip: passthrough('UTooltip')
}

async function render(
  block: { id: string, type: string, data: Record<string, unknown> },
  extra: Record<string, unknown> = {}
) {
  const app = createSSRApp({ render: () => h(BlockSettingsPanel, { block, ...extra }) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp as never))
  return renderToString(app)
}

describe('BlockSettingsPanel — Phase 3a grouped style sections', () => {
  it('renders Spacing for every block type', async () => {
    const html = await render({ id: 'b', type: 'Spacer', data: { props: {}, style: {} } })
    expect(html).toContain('Spacing')
  })

  it('shows Typography + Border & effects + Background image for a Text block', async () => {
    const html = await render({ id: 'b', type: 'Text', data: { props: { text: 'Hi' }, style: {} } })
    expect(html).toContain('Spacing')
    expect(html).toContain('Typography')
    expect(html).toContain('Border')
    expect(html).toContain('Background image')
  })

  it('hides Typography for a non-textual block (Image)', async () => {
    const html = await render({ id: 'b', type: 'Image', data: { props: { url: 'https://x/y.png' }, style: {} } })
    expect(html).not.toContain('Typography')
    // Image is styleable → Border & effects still present
    expect(html).toContain('Border')
  })

  it('hides Background image for a Divider (not a bg-image block)', async () => {
    const html = await render({ id: 'b', type: 'Divider', data: { props: {}, style: {} } })
    expect(html).not.toContain('Background image')
  })

  it('labels Divider thickness separately from CSS line-height', async () => {
    const html = await render({ id: 'b', type: 'Divider', data: { props: { lineThickness: 2 }, style: {} } })
    expect(html).toContain('Line thickness')
    expect(html).not.toContain('Line height —')
  })

  it('labels the inspector as Mobile override when editing mobile styles', async () => {
    const html = await render({
      id: 'b',
      type: 'Text',
      data: {
        props: { text: 'Desktop' },
        style: { color: '#111111' },
        mobile: { props: { text: 'Mobile' }, style: { color: '#222222' } }
      }
    }, { device: 'mobile' })

    expect(html).toContain('Mobile override')
    expect(html).toContain('Hide on mobile')
    expect(html).toContain('Hide on desktop')
  })

  it('exposes an Advanced anchor ID control for link targets', async () => {
    const html = await render({ id: 'b', type: 'Text', data: { props: { text: 'Hi', anchorId: 'intro' }, style: {} } })
    expect(html).toContain('Advanced')
    expect(html).toContain('Anchor ID')
  })
})
