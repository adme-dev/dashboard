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
  it('renders the core studio regions and supplied slots', async () => {
    const html = await render({
      currentTimeSec: 7,
      durationSec: 32,
      assetCount: 5,
      generationJobCount: 2,
      renderJobCount: 1,
      generationEnabled: true,
      rendering: false
    }, {
      library: () => h('p', 'Library filters'),
      preview: () => h('p', 'Preview canvas'),
      producer: () => h('p', 'Producer rail'),
      details: () => h('p', 'AI Producer details')
    })

    expect(html).toContain('Video Studio')
    expect(html).toContain('lg:h-[min(48vh,540px)]')
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('Library filters')
    expect(html).toContain('Preview canvas')
    expect(html).toContain('Producer rail')
    expect(html).toContain('AI Producer details')
    expect(html).toContain('5 assets')
    expect(html).toContain('2 AI jobs')
    expect(html).toContain('1 render')
  })

  it('can collapse the producer rail while keeping library and preview visible', async () => {
    const html = await render({
      currentTimeSec: 0,
      durationSec: 12,
      producerCollapsed: true
    }, {
      library: () => h('p', 'Library rail'),
      preview: () => h('p', 'Preview panel'),
      producer: () => h('p', 'Producer content')
    })

    expect(html).toContain('Library rail')
    expect(html).toContain('Preview panel')
    expect(html).toContain('Producer rail collapsed')
    expect(html).not.toContain('Producer content')
  })

  it('emits toolbar actions, producer collapse, and selected render formats', async () => {
    const { app, host, events } = await mount({
      currentTimeSec: 4,
      durationSec: 16,
      generationEnabled: true,
      rendering: false,
      producerCollapsed: false,
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
      ;(host.querySelector('button[aria-label="Collapse producer rail"]') as HTMLButtonElement).click()
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
      expect(events.find(event => event.name === 'update:producer-collapsed')?.payload).toBe(true)
    } finally {
      app.unmount()
    }
  })

  it('exposes final mode navigation, compact status, and expands producer for produce mode', async () => {
    const { app, host, events } = await mount({
      currentTimeSec: 4,
      durationSec: 16,
      assetCount: 12,
      generationJobCount: 1,
      renderJobCount: 2,
      generationEnabled: true,
      rendering: false,
      producerCollapsed: true,
    }, {
      library: () => h('p', 'Library rail'),
      preview: () => h('p', 'Preview panel'),
      producer: () => h('p', 'Producer content'),
    })

    try {
      expect(host.textContent).toContain('Assets 12')
      expect(host.textContent).toContain('Edit 1')
      expect(host.textContent).toContain('Produce')
      expect(host.textContent).toContain('Review 2')
      expect(host.textContent).toContain('3 formats')
      expect(host.textContent).toContain('AI ready')
      expect(host.textContent).toContain('2 renders')

      buttonByText(host, 'Produce').click()
      await nextTick()

      expect(events).toContainEqual({ name: 'update:mode', payload: 'produce' })
      expect(events.find(event => event.name === 'update:producer-collapsed')?.payload).toBe(false)
    } finally {
      app.unmount()
    }
  })

  it('can render directly in review mode for the mobile review fallback', async () => {
    const html = await render({
      mode: 'review',
      currentTimeSec: 0,
      durationSec: 24,
      renderJobCount: 3,
      generationEnabled: false,
    }, {
      library: () => h('p', 'Library rail'),
      preview: () => h('p', 'Preview panel'),
      producer: () => h('p', 'Producer content'),
      review: () => h('p', 'Review fallback content'),
    })

    expect(html).toContain('Review 3')
    expect(html).toContain('Review fallback content')
    expect(html).toContain('AI unavailable')
  })
})
