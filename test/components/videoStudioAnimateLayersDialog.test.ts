// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import VideoStudioAnimateLayersDialog from '~~/app/components/media/VideoStudioAnimateLayersDialog.vue'
import type { LayerPackage } from '~~/app/utils/video/layerAnimation'

const stubs = {
  UModal: { name: 'UModal', props: ['open', 'title', 'description'], template: '<section v-if="open"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /></section>' },
  UFormField: { name: 'UFormField', props: ['label', 'help'], template: '<label><span>{{ label }}</span><slot /><small>{{ help }}</small></label>' },
  USelect: {
    name: 'USelect',
    props: ['modelValue', 'items', 'ariaLabel'],
    emits: ['update:modelValue'],
    template: '<select :aria-label="ariaLabel" :value="modelValue" @change="$emit(\'update:modelValue\', isNaN(Number($event.target.value)) ? $event.target.value : Number($event.target.value))"><option v-for="item in items || []" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  UButton: { name: 'UButton', props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\', $event)">{{ label }}</button>' }
}

const pkg: LayerPackage = {
  id: 'pkg-1',
  sourceAssetId: 'asset-1',
  title: '3 layers and a base',
  width: 1152,
  height: 2048,
  base: { derivativeId: 'base-1', r2Key: 'k/base.png' },
  layers: [
    { derivativeId: 'car', r2Key: 'k/layer-01.png', name: 'car', kind: 'product', z: 1, bbox: { x: 147, y: 952, width: 830, height: 430 } },
    { derivativeId: 'headline', r2Key: 'k/layer-02.png', name: 'headline', kind: 'text', z: 2, bbox: { x: 141, y: 186, width: 871, height: 383 } },
    { derivativeId: 'price', r2Key: 'k/layer-03.png', name: 'price badge', kind: 'badge', z: 3, bbox: { x: 784, y: 725, width: 301, height: 299 } }
  ],
  partial: false
}

async function mount(props: Record<string, unknown>) {
  const events: unknown[] = []
  const host = document.createElement('div')
  const app = createApp({ render: () => h(VideoStudioAnimateLayersDialog, { open: true, frame: { width: 1080, height: 1920 }, ...props, onAnimate: (payload: unknown) => events.push(payload) }) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
}

function select(host: HTMLElement, label: string) {
  const el = host.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement | null
  if (!el) throw new Error(`Select not found: ${label}`)
  return el
}

describe('VideoStudioAnimateLayersDialog', () => {
  it('lists the top layer first and the background last, each on auto with its move named', async () => {
    const { app, host } = await mount({ pkg })
    try {
      const rows = [...host.querySelectorAll('li')].map(row => row.querySelector('p')!.textContent!.trim())
      expect(rows).toEqual(['price badge', 'headline', 'car', 'Background'])
      expect(select(host, 'Motion for price badge').options[0]!.textContent).toBe('Auto (pop)')
      expect(select(host, 'Motion for headline').options[0]!.textContent).toBe('Auto (slide up)')
      expect(select(host, 'Motion for car').options[0]!.textContent).toBe('Auto (push in)')
      expect(select(host, 'Motion for Background').options[0]!.textContent).toBe('Auto (slow zoom)')
      expect(select(host, 'Motion for car').value).toBe('auto')
    } finally {
      app.unmount()
    }
  })

  it('animates with the chosen moves, length and fit', async () => {
    const { app, host, events } = await mount({ pkg })
    try {
      const car = select(host, 'Motion for car')
      car.value = 'hold'
      car.dispatchEvent(new Event('change'))
      await nextTick()
      ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Animate layers')!.click()
      expect(events).toEqual([{ fit: 'cover', durationSec: 6, presets: { price: 'auto', headline: 'auto', car: 'hold', base: 'auto' } }])
    } finally {
      app.unmount()
    }
  })

  it('keeps the whole picture by default when its shape differs from the video frame, and says what cover would cost', async () => {
    const { app, host } = await mount({ pkg: { ...pkg, width: 1600, height: 900 } })
    try {
      expect(host.textContent).toContain('The whole picture is kept, with empty bands where the shapes differ.')
    } finally {
      app.unmount()
    }
  })

  it('says when there is no background and will not submit twice while working', async () => {
    const { app, host, events } = await mount({ pkg: { ...pkg, base: null }, busy: true })
    try {
      expect(host.textContent).toContain('This result has no background')
      const submit = [...host.querySelectorAll('button')].find(button => button.textContent === 'Animate layers')!
      expect(submit.disabled).toBe(true)
      submit.click()
      expect(events).toEqual([])
    } finally {
      app.unmount()
    }
  })
})
