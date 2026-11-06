// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import type { StoryboardShot } from '~~/shared/video/storyboard'
import Inspector from '~~/app/components/media/VideoStudioShotInspector.vue'

const shot = {
  id: 'shot-a',
  purpose: 'Reveal',
  durationFrames: 90,
  visualDirection: 'Wide view',
  referenceRoles: ['product'],
  spokenSegmentIds: ['speech'],
  copyCueIds: ['offer'],
  visual: { status: 'unresolved', reason: 'missing_source' },
  audioCues: [],
  captionCues: [],
  overlayCues: []
}
const copy = {
  scriptSegments: [{ id: 'speech', text: 'Exact — café' }],
  cues: [{ id: 'offer', text: '$29,990\nTerms apply.', required: true }],
  approval: { approvedAt: '2026-11-05' }
}
export const stubs = {
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: {
    props: ['modelValue', 'disabled', 'type'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" :disabled="disabled" :type="type" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UTextarea: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
  UBadge: { template: '<span><slot /></span>' },
  UAlert: {
    props: ['title', 'description'],
    template: '<aside>{{ title }} {{ description }}</aside>'
  },
  USelect: {
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>'
  },
  UCheckbox: {
    props: ['modelValue', 'label', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>'
  },
  UModal: { props: ['open'], template: '<div v-if="open"><slot name="content" /></div>' }
}
async function mount(disabled = false, extra: Record<string, unknown> = {}) {
  const updates: Partial<StoryboardShot>[] = []
  const host = document.createElement('div')
  const app = createApp({
    render: () =>
      h(Inspector, {
        shot,
        copy,
        fps: 30,
        disabled,
        ...extra,
        onUpdate: (p: Partial<StoryboardShot>) => updates.push(p)
      } as unknown as InstanceType<typeof Inspector>['$props'])
  })
  Object.entries(stubs).forEach(([k, v]) => app.component(k, v))
  app.mount(host)
  await nextTick()
  return { host, app, updates }
}
describe('Storyboard shot inspector', () => {
  it('shows complete exact copy read-only and missing media', async () => {
    const { host, app } = await mount()
    expect(host.textContent).toContain('Exact — café')
    expect(host.textContent).toContain('$29,990\nTerms apply.')
    expect(host.textContent).toContain('Missing media')
    expect(
      [...host.querySelectorAll('textarea')].some(el => el.value.includes('Terms apply'))
    ).toBe(false)
    app.unmount()
  })
  it('emits a frame edit without modifying shot or approved copy', async () => {
    const { host, app, updates } = await mount()
    const input = host.querySelector('input[type="number"]') as HTMLInputElement
    input.value = '120'
    input.dispatchEvent(new Event('input'))
    await nextTick()
    expect(updates).toContainEqual({ durationFrames: 120 })
    expect(shot.durationFrames).toBe(90)
    app.unmount()
  })
  it('adds explicit audio cues without claiming reviewed timing', async () => {
    const { host, app, updates } = await mount()
    const button = [...host.querySelectorAll('button')].find(
      el => el.textContent?.trim() === 'Add audio cue'
    )!
    button.click()
    await nextTick()
    expect(updates.at(-1)!.audioCues![0]).toMatchObject({
      kind: 'voiceover',
      timing: 'proposed',
      asset: { status: 'unresolved' }
    })
    app.unmount()
  })
  it('adds captions and overlays against exact copy identities', async () => {
    const { host, app, updates } = await mount()
    for (const label of ['Add caption cue', 'Add overlay cue'])
      [...host.querySelectorAll('button')].find(el => el.textContent?.trim() === label)!.click()
    expect(updates[0].captionCues![0]).toMatchObject({
      spokenSegmentId: 'speech',
      timing: 'proposed'
    })
    expect(updates[1].overlayCues![0]).toMatchObject({
      copyCueId: 'offer',
      asset: { status: 'unresolved' }
    })
    app.unmount()
  })
  it('changes audio timing back to proposed without changing source approval', async () => {
    const audio = {
      id: 'audio',
      kind: 'voiceover',
      required: true,
      startFrame: 0,
      durationFrames: 90,
      timing: 'reviewed',
      asset: {
        status: 'bound',
        sourceKind: 'audio_asset',
        assetId: 'asset',
        contentHash: 'a'.repeat(64)
      }
    }
    const { host, app, updates } = await mount(false, { shot: { ...shot, audioCues: [audio] } })
    const field = [...host.querySelectorAll('label')]
      .find(el => el.textContent?.startsWith('Start frame'))!
      .querySelector('input')!
    field.value = '5'
    field.dispatchEvent(new Event('input'))
    await nextTick()
    expect(updates.at(-1)!.audioCues![0]).toMatchObject({
      startFrame: 5,
      timing: 'proposed',
      asset: audio.asset
    })
    expect(audio.timing).toBe('reviewed')
    app.unmount()
  })
  it('disables editing while pending', async () => {
    const { host, app } = await mount(true)
    expect(
      [...host.querySelectorAll('input,textarea,select')].every(
        el => (el as HTMLInputElement).disabled
      )
    ).toBe(true)
    app.unmount()
  })
})
