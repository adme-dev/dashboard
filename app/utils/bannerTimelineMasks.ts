import type { gsap } from 'gsap'

const updates = new WeakMap<gsap.core.Timeline, Array<() => void>>()

export function updateTimelineMasks(timeline: gsap.core.Timeline) {
  updates.get(timeline)?.forEach(update => update())
}

export function registerTimelineMaskUpdate(timeline: gsap.core.Timeline, update: () => void) {
  let callbacks = updates.get(timeline)
  if (!callbacks) {
    callbacks = []
    updates.set(timeline, callbacks)
    const previous = timeline.eventCallback('onUpdate')
    timeline.eventCallback('onUpdate', () => {
      previous?.call(timeline)
      updateTimelineMasks(timeline)
    })
  }
  callbacks.push(update)
}
