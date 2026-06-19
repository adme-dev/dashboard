// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, createSSRApp, h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioInspector from '~~/app/components/media/VideoStudioInspector.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
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
}

async function render(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  const app = createSSRApp({ render: () => h(VideoStudioInspector, props, slots) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

async function mount(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(VideoStudioInspector, props, slots) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host }
}

describe('VideoStudioInspector', () => {
  it('renders details, produce, and review tabs with operational counts', async () => {
    const html = await render({
      assetCount: 12,
      voiceAssetCount: 2,
      overlayAssetCount: 4,
      renderJobCount: 3,
      modelReady: true,
    }, {
      details: () => h('p', 'Selected asset details'),
      produce: () => h('p', 'Producer controls'),
      review: () => h('p', 'Render review'),
    })

    expect(html).toContain('Inspector')
    expect(html).toContain('Details')
    expect(html).toContain('Produce')
    expect(html).toContain('Review 3')
    expect(html).toContain('Assets')
    expect(html).toContain('12')
    expect(html).toContain('Voice')
    expect(html).toContain('2')
    expect(html).toContain('Overlays')
    expect(html).toContain('4')
    expect(html).toContain('AI ready')
    expect(html).toContain('Selected asset details')
    expect(html).not.toContain('Producer controls')
    expect(html).not.toContain('Render review')
  })

  it('switches between produce and review panels', async () => {
    const { app, host } = await mount({
      renderJobCount: 2,
      modelReady: false,
    }, {
      details: () => h('p', 'Details panel'),
      produce: () => h('p', 'Produce panel'),
      review: () => h('p', 'Review panel'),
    })

    try {
      expect(host.textContent).toContain('Details panel')
      expect(host.textContent).not.toContain('Produce panel')

      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Produce')) as HTMLButtonElement).click()
      await nextTick()

      expect(host.textContent).toContain('Produce panel')
      expect(host.textContent).toContain('AI unavailable')

      ;([...host.querySelectorAll('button')].find(button => button.textContent?.includes('Review 2')) as HTMLButtonElement).click()
      await nextTick()

      expect(host.textContent).toContain('Review panel')
      expect(host.textContent).not.toContain('Produce panel')
    } finally {
      app.unmount()
    }
  })
})
