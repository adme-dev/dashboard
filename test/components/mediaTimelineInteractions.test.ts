// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

// wavesurfer needs real audio/canvas APIs; the interaction layer doesn't.
vi.mock('wavesurfer.js', () => ({ default: { create: () => ({ load: vi.fn(), destroy: vi.fn(), on: vi.fn() }) } }))

import MediaTimeline from '~~/app/components/media/MediaTimeline.client.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: { name: 'UButton', props: ['label', 'icon', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\', $event)">{{ label }}</button>' },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], template: '<select />' },
  UPopover: { name: 'UPopover', template: '<div><slot /><slot name="content" /></div>' },
}

const timeline = {
  schema_version: 2,
  media_type: 'av',
  sample_rate: 48000,
  duration_sec: 10,
  tracks: [
    { id: 'video', name: 'Video', kind: 'video', gain_db: 0, muted: false, locked: false, hidden: false,
      clips: [{ id: 'v1', type: 'video', base_source: 'uploaded_footage', r2_key: 'media/p/footage/1700000000000-hero-shot-1234abcd.mp4', timeline_start_sec: 0, duration_sec: 5 }] },
    { id: 'music', name: 'Music', kind: 'music', gain_db: 0, muted: false, locked: false, hidden: false, clips: [] },
  ],
  ducking: [],
} as any

async function mount(props: Record<string, unknown> = {}) {
  const events: Array<{ name: string; payload: unknown }> = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(MediaTimeline, {
      timeline,
      clips: [],
      tracks: [],
      currentTime: 0,
      duration: 10,
      pxPerSec: 60,
      ...props,
      onSelect: (p: unknown) => events.push({ name: 'select', payload: p }),
      onMoveClip: (p: unknown) => events.push({ name: 'move-clip', payload: p }),
      onTrimClip: (p: unknown) => events.push({ name: 'trim-clip', payload: p }),
      onAddToTrack: (p: unknown) => events.push({ name: 'add-to-track', payload: p }),
    }),
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  app.mount(host)
  await nextTick()
  return { app, host, events }
}

function pointer(type: string, target: Element, init: Record<string, number> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init }) as MouseEvent & { pointerId: number }
  Object.defineProperty(event, 'pointerId', { value: 1 })
  target.dispatchEvent(event)
}

beforeAll(() => {
  // happy-dom has no pointer capture; the component calls it on pointerdown.
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
})

describe('MediaTimeline interactions', () => {
  it('treats a plain click as selection only — no move-clip, so no edit or autosave', async () => {
    const { app, host, events } = await mount()
    try {
      const clip = host.querySelector('[title^="hero shot"]') as HTMLElement
      expect(clip).toBeTruthy()
      pointer('pointerdown', clip, { screenX: 100, clientY: 40 })
      pointer('pointerup', host.querySelector('.select-none')!, { screenX: 101, clientY: 40 })
      await nextTick()
      expect(events.map(e => e.name)).toEqual(['select'])
      expect(events[0]!.payload).toEqual({ clipId: 'v1' })
    } finally {
      app.unmount()
    }
  })

  it('emits move-clip once pointer travel passes the drag threshold', async () => {
    const { app, host, events } = await mount()
    try {
      const clip = host.querySelector('[title^="hero shot"]') as HTMLElement
      pointer('pointerdown', clip, { screenX: 100, clientY: 40 })
      pointer('pointermove', host.querySelector('.select-none')!, { screenX: 160, clientY: 40 })
      pointer('pointerup', host.querySelector('.select-none')!, { screenX: 160, clientY: 40 })
      await nextTick()
      const move = events.find(e => e.name === 'move-clip')?.payload as { clipId: string; newStartSec: number }
      expect(move.clipId).toBe('v1')
      // 60px at 60px/s = 1s, from a 0s start.
      expect(move.newStartSec).toBeCloseTo(1, 1)
    } finally {
      app.unmount()
    }
  })

  it('labels clips from the file name and offers an add affordance on empty lanes', async () => {
    const { app, host, events } = await mount({ titles: {} })
    try {
      expect(host.textContent).toContain('hero shot')
      const add = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Add music')) as HTMLButtonElement
      expect(add).toBeTruthy()
      add.click()
      await nextTick()
      expect(events).toContainEqual({ name: 'add-to-track', payload: { trackId: 'music', kind: 'music' } })
    } finally {
      app.unmount()
    }
  })

  it('uses the library title for a clip when one is known', async () => {
    const { app, host } = await mount({ titles: { 'media/p/footage/1700000000000-hero-shot-1234abcd.mp4': 'Dealer hero v3' } })
    try {
      expect(host.textContent).toContain('Dealer hero v3')
    } finally {
      app.unmount()
    }
  })
})
