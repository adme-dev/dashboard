// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

// wavesurfer needs real audio/canvas APIs; the interaction layer doesn't.
vi.mock('wavesurfer.js', () => ({ default: { create: () => ({ load: vi.fn(), destroy: vi.fn(), on: vi.fn() }) } }))

import MediaTimeline from '~~/app/components/media/MediaTimeline.client.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: { name: 'UButton', props: ['label', 'icon', 'disabled', 'color'], emits: ['click'], template: '<button :disabled="disabled" :data-color="color" @click="$emit(\'click\', $event)">{{ label }}</button>' },
  USelect: { name: 'USelect', props: ['modelValue', 'items'], template: '<select :value="modelValue"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
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
      onNaturalHeight: (p: unknown) => events.push({ name: 'natural-height', payload: p }),
      onSeek: (p: unknown) => events.push({ name: 'seek', payload: p }),
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
  it('fits a loaded portrait edit to its pane and preserves a manual zoom', async () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(924)
    const { app, host } = await mount({ duration: 40.2, pxPerSec: undefined })
    try {
      expect(host.querySelector('select')?.value).toBe('20')
      host.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click()
      await nextTick()
      expect(host.querySelector('select')?.value).toBe('30')
      host.querySelector<HTMLButtonElement>('[title="Fit timeline (0)"]')!.click()
      await nextTick()
      expect(host.querySelector('select')?.value).toBe('20')
    } finally {
      app.unmount()
      width.mockRestore()
    }
  })

  it('treats a plain click as selection only — no move-clip, so no edit or autosave', async () => {
    const { app, host, events } = await mount()
    try {
      const clip = host.querySelector('[title^="hero shot"]') as HTMLElement
      expect(clip).toBeTruthy()
      pointer('pointerdown', clip, { screenX: 100, clientY: 40 })
      pointer('pointerup', host.querySelector('.select-none')!, { screenX: 101, clientY: 40 })
      await nextTick()
      // natural-height is a layout signal, not an edit.
      const interactions = events.filter(e => e.name !== 'natural-height')
      expect(interactions.map(e => e.name)).toEqual(['select'])
      expect(interactions[0]!.payload).toEqual({ clipId: 'v1' })
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

  it('keeps the ruler sticky inside the timeline scroll owner', async () => {
    const { app, host } = await mount()
    try {
      const scroller = host.querySelector('[data-timeline-scroll]') as HTMLElement
      const ruler = host.querySelector('[data-timeline-ruler]') as HTMLElement
      // The canvas scrolls both axes itself; a sticky ruler inside an x-only scroller never sticks.
      expect(scroller.classList.contains('overflow-auto')).toBe(true)
      expect(scroller.classList.contains('overflow-x-auto')).toBe(false)
      expect(scroller.contains(ruler)).toBe(true)
      expect(ruler.classList.contains('sticky')).toBe(true)
      expect(ruler.classList.contains('top-0')).toBe(true)
    } finally {
      app.unmount()
    }
  })

  it('spaces ruler labels for readability when zoomed out', async () => {
    const { app, host } = await mount({ duration: 120, pxPerSec: 4 })
    try {
      const labels = [...host.querySelectorAll('[data-timeline-ruler] span')].map(el => el.textContent?.trim())
      // 4 px/s → 15s ticks (60px apart), not 0.25s–1s ticks piled on each other.
      expect(labels).toEqual(['0s', '15s', '30s', '45s', '1:00', '1:15', '1:30', '1:45'])
    } finally {
      app.unmount()
    }
  })

  it('reports the height needed to show every track', async () => {
    const { app, events } = await mount()
    try {
      const reported = events.filter(e => e.name === 'natural-height').at(-1)?.payload as { heightPx: number }
      // happy-dom has no layout (toolbar 0px): 8px gap + 24px ruler + 2 lanes × 56px + 2px borders.
      expect(reported).toEqual({ heightPx: 8 + 24 + 2 * 56 + 2 })
    } finally {
      app.unmount()
    }
  })

  it('shows Delete as neutral until a clip is selected', async () => {
    const { app, host } = await mount()
    try {
      const del = () => [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Delete') as HTMLButtonElement
      expect(del().disabled).toBe(true)
      expect(del().dataset.color).toBe('neutral')
      pointer('pointerdown', host.querySelector('[title^="hero shot"]')!, { screenX: 100, clientY: 40 })
      pointer('pointerup', host.querySelector('.select-none')!, { screenX: 100, clientY: 40 })
      await nextTick()
      expect(del().disabled).toBe(false)
      expect(del().dataset.color).toBe('error')
    } finally {
      app.unmount()
    }
  })

  it('seeks from the scrolled position, not the visible left edge', async () => {
    const { app, host, events } = await mount()
    try {
      const scroller = host.querySelector('[data-timeline-scroll]') as HTMLElement
      scroller.scrollLeft = 120
      const lane = host.querySelectorAll('.cursor-crosshair')[1] as HTMLElement
      lane.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 180 }))
      await nextTick()
      // 180 - 120 label + 120 scroll = 180px at 60 px/s = 3s.
      expect(events.find(e => e.name === 'seek')?.payload).toBeCloseTo(3, 5)
    } finally {
      app.unmount()
    }
  })

  it('backs only the audio label text, not the whole waveform, with a dark legible chip', async () => {
    const clips = [{ clipId: 'a1', trackId: 'music', timelineStartSec: 0, durationSec: 4, r2_key: 'media/p/audio/voice-take.mp3' }]
    const { app, host } = await mount({ clips })
    try {
      const audioLabel = host.querySelector('[data-clip-label="audio"]')!
      expect(audioLabel.className).toContain('bg-black/75')
      expect(audioLabel.className).toContain('text-white')
      const videoLabel = host.querySelector('[data-clip-label="video"]')!
      expect(videoLabel.className).not.toContain('bg-black/75')
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
