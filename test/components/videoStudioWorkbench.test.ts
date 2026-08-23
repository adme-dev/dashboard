// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioWorkbench from '~~/app/components/media/VideoStudioWorkbench.vue'
import type { VideoRenderFormatId } from '~~/app/utils/video/renderFormats'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: {
    name: 'UButton',
    props: ['icon', 'label', 'disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
  UTabs: {
    name: 'UTabs',
    props: ['modelValue', 'items', 'content'],
    emits: ['update:modelValue'],
    template: `
      <nav>
        <button
          v-for="item in items"
          :key="item.value"
          type="button"
          :aria-pressed="modelValue === item.value"
          @click="$emit('update:modelValue', item.value)"
        >
          {{ item.label }}{{ item.badge ? ' ' + item.badge : '' }}
        </button>
      </nav>
    `
  },
  UPopover: { name: 'UPopover', template: '<div><slot /><slot name="content" /></div>' },
  UCheckbox: {
    name: 'UCheckbox',
    props: ['modelValue', 'ariaLabel'],
    emits: ['update:modelValue'],
    template: '<input type="checkbox" :checked="modelValue" :aria-label="ariaLabel" @change="$emit(\'update:modelValue\', $event.target.checked)" />'
  }
}

async function render(props: Record<string, unknown>, slots: Record<string, () => unknown> = {}) {
  const app = createSSRApp({ render: () => h(VideoStudioWorkbench, props, slots) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown>, slots: Record<string, () => unknown> = {}) {
  const events: Array<{ name: string, payload: unknown }> = []
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(VideoStudioWorkbench, {
      ...props,
      onOpenLibrary: () => events.push({ name: 'open-library', payload: null }),
      onAddFootage: () => events.push({ name: 'add-footage', payload: null }),
      onAddOverlay: () => events.push({ name: 'add-overlay', payload: null }),
      onGenerate: () => events.push({ name: 'generate', payload: null }),
      onRender: (formats: VideoRenderFormatId[]) => events.push({ name: 'render', payload: formats }),
      'onUpdate:mode': (value: string) => events.push({ name: 'update:mode', payload: value }),
      'onUpdate:producerCollapsed': (value: boolean) => events.push({ name: 'update:producer-collapsed', payload: value }),
    }, slots)
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
}

function buttonByText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(el => el.textContent?.includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button as HTMLButtonElement
}

describe('VideoStudioWorkbench', () => {
  it('renders the three studio columns, each scrolling on its own', async () => {
    const html = await render({
      assetCount: 5,
      generationJobCount: 2,
      renderJobCount: 1,
      generationEnabled: true,
      rendering: false
    }, {
      library: () => h('p', 'Library filters'),
      preview: () => h('p', 'Preview canvas'),
      producer: () => h('p', 'Producer rail')
    })

    expect(html).toContain('Library filters')
    expect(html).toContain('Preview canvas')
    expect(html).toContain('Producer rail')
    expect(html).toContain('2 AI jobs running')
    expect(html).toContain('AI ready')
    // Three column scroll regions + the outer section never scrolls the page.
    expect(html.match(/overflow-y-auto/g)?.length).toBe(3)
    expect(html).toContain('overflow-hidden')
  })

  it('can collapse the inspector while keeping library and preview visible', async () => {
    const html = await render({ producerCollapsed: true }, {
      library: () => h('p', 'Library rail'),
      preview: () => h('p', 'Preview panel'),
      producer: () => h('p', 'Producer content')
    })

    expect(html).toContain('Library rail')
    expect(html).toContain('Preview panel')
    expect(html).toContain('Show inspector')
    expect(html).not.toContain('Producer content')
    expect(html.match(/overflow-y-auto/g)?.length).toBe(2)
  })

  it('emits toolbar actions and the selected render formats', async () => {
    const { app, host, events } = await mount({
      generationEnabled: true,
      rendering: false,
      producerCollapsed: true,
    }, {
      library: () => h('p', 'Library rail'),
      preview: () => h('p', 'Preview panel'),
      producer: () => h('p', 'Producer content'),
    })

    try {
      buttonByText(host, 'Footage').click()
      buttonByText(host, 'Overlay').click()
      buttonByText(host, 'Generate').click()
      buttonByText(host, 'Library').click()
      buttonByText(host, 'Render 3 formats').click()
      buttonByText(host, 'Show inspector').click()
      await nextTick()

      expect(events.map(event => event.name)).toEqual([
        'add-footage',
        'add-overlay',
        'generate',
        'open-library',
        'render',
        'update:producer-collapsed',
      ])
      expect(events.find(event => event.name === 'render')?.payload).toEqual(['reels_9x16', 'square_1x1', 'youtube_16x9'])
      expect(events.find(event => event.name === 'update:producer-collapsed')?.payload).toBe(false)
    } finally {
      app.unmount()
    }
  })

  it('switches panels below lg and expands the inspector for produce/review modes', async () => {
    const { app, host, events } = await mount({
      assetCount: 12,
      renderJobCount: 2,
      generationEnabled: true,
      producerCollapsed: true,
    }, {
      library: () => h('p', 'Library rail'),
      preview: () => h('p', 'Preview panel'),
      producer: () => h('p', 'Producer content'),
    })

    try {
      expect(host.textContent).toContain('Assets 12')
      expect(host.textContent).toContain('Inspector 2')
      expect(host.textContent).toContain('3 formats')

      buttonByText(host, 'Inspector').click()
      await nextTick()

      expect(events).toContainEqual({ name: 'update:mode', payload: 'produce' })
      expect(events.find(event => event.name === 'update:producer-collapsed')?.payload).toBe(false)
    } finally {
      app.unmount()
    }
  })

  it('maps review mode onto the inspector panel', async () => {
    const html = await render({
      mode: 'review',
      renderJobCount: 3,
      generationEnabled: false,
      generationStatusLabel: 'AI disabled by policy',
    }, {
      library: () => h('p', 'Library rail'),
      preview: () => h('p', 'Preview panel'),
      producer: () => h('p', 'Producer content'),
    })

    expect(html).toContain('Inspector 3')
    expect(html).toContain('Producer content')
    expect(html).toContain('AI disabled by policy')
  })
})
