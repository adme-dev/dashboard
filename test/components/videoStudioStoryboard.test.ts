import { ReferenceSetWriteSchema } from '~~/shared/video/storyboardReferences'
// @vitest-environment happy-dom
import { createApp, h, nextTick, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import type { StoryboardShot } from '~~/shared/video/storyboard'
import type { StoryboardDraft } from '~~/app/composables/useVideoStoryboard'
import Storyboard from '~~/app/components/media/VideoStudioStoryboard.vue'

const shot = (id: string): StoryboardShot => ({
  id,
  purpose: id,
  durationFrames: 90,
  visualDirection: '',
  referenceRoles: [],
  spokenSegmentIds: [],
  copyCueIds: [],
  visual: { status: 'unresolved', reason: 'missing_source' },
  audioCues: [],
  captionCues: [],
  overlayCues: []
})
const draft = (): StoryboardDraft => ({
  brief: '',
  inputMode: 'idea',
  durationSeconds: 30,
  targetFormat: 'reels_9x16',
  copy: { scriptSegments: [], cues: [] },
  shots: [shot('first'), shot('second')]
})
const stubs = {
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
  UModal: {
    props: ['open'],
    template: '<div v-if="open" role="dialog"><slot name="content" /></div>'
  },
  VideoStudioShotInspector: { template: '<div />' }
}
async function mount(extra: Record<string, unknown> = {}) {
  const events: Array<[string, unknown?]> = []
  const props = reactive({
    draft: draft(),
    plan: null,
    candidate: null,
    enabled: true,
    pending: false,
    findings: [],
    examples: [],
    referenceSet: null,
    timelineNonEmpty: false,
    ...extra
  })
  const host = document.createElement('div')
  const app = createApp({
    render: () =>
      h(Storyboard, {
        ...props,
        'onUpdate:draft': (value: unknown) => events.push(['draft', value]),
        'onApply': (v: unknown) => events.push(['apply', v]),
        'onRequestPlan': (v: unknown) => events.push(['plan', v]),
        'onAcceptCandidate': (v: unknown) => events.push(['accept', v]),
        'onRecover': () => events.push(['recover']),
        'onRefresh': () => events.push(['refresh']),
        'onSaveReferences': (value: unknown) => events.push(['references', value])
      } as unknown as InstanceType<typeof Storyboard>['$props'])
  })
  Object.entries(stubs).forEach(([k, v]) => app.component(k, v))
  app.mount(host)
  await nextTick()
  return { host, app, events, props }
}
function button(host: HTMLElement, text: string) {
  const b = [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text))
  if (!b) throw new Error(text)
  return b
}
describe('Storyboard workbench', () => {
  it('supports empty recipe and manual flows without paid generation', async () => {
    const { host, app, events } = await mount()
    expect(host.textContent).toContain('Storyboard')
    expect(host.textContent).toContain('Recipe')
    button(host, 'Review manual plan').click()
    await nextTick()
    expect(events).toContainEqual(['plan', 'manual'])
    expect(host.textContent).not.toContain('Generate video')
    app.unmount()
  })
  it('reorders with keyboard without mutating incoming draft', async () => {
    const { host, app, events, props } = await mount()
    host
      .querySelector('[data-shot-id="second"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }))
    await nextTick()
    expect((events[0][1] as StoryboardDraft).shots.map((s: StoryboardShot) => s.id)).toEqual(['second', 'first'])
    expect(props.draft.shots[0].id).toBe('first')
    app.unmount()
  })
  it('requires explicit nonempty replacement confirmation', async () => {
    const { host, app, events } = await mount({
      plan: { shots: [shot('saved')], copy: { approval: {} }, durationFrames: 90, fps: 30 },
      timelineNonEmpty: true,
      canApply: true
    })
    button(host, 'Apply storyboard').click()
    await nextTick()
    expect(events).toEqual([])
    expect(host.querySelector('[role="dialog"]')).not.toBeNull()
    button(host, 'Replace full cut').click()
    expect(events).toContainEqual(['apply', true])
    app.unmount()
  })
  it('shows blockers and disables pending actions', async () => {
    const { host, app } = await mount({
      pending: true,
      findings: [{ code: 'missing', severity: 'blocker', message: 'Missing approved footage' }]
    })
    expect(host.textContent).toContain('Missing approved footage')
    expect(button(host, 'Review manual plan').disabled).toBe(true)
    app.unmount()
  })
  it('shows candidate changes and accepts only on explicit action', async () => {
    const { host, app, events } = await mount({
      candidate: {
        id: 'candidate',
        plan: { shots: [shot('new')], copy: { scriptSegments: [], cues: [] }, fps: 30 },
        findings: [],
        diff: { changedShotIds: ['new'] }
      }
    })
    expect(host.textContent).toContain('Review proposed revision')
    expect(events).toEqual([])
    button(host, 'Accept revision').click()
    expect(events).toContainEqual(['accept', false])
    app.unmount()
  })
  it('removes accidentally added copy and linked draft mappings', async () => {
    const value = draft()
    value.copy.cues = [{ id: 'copy-a', text: '', required: true }]
    value.shots[0].copyCueIds = ['copy-a']
    const { host, app, events } = await mount({ draft: value })
    button(host, 'Remove copy cue').click()
    expect((events[0][1] as StoryboardDraft).copy.cues).toEqual([])
    expect((events[0][1] as StoryboardDraft).shots[0].copyCueIds).toEqual([])
    expect(value.copy.cues).toHaveLength(1)
    app.unmount()
  })
  it('removes an accidental reference without mutating saved identity', async () => {
    const referenceSet = {
      references: [
        {
          role: 'product',
          sourceKind: 'video_asset',
          assetId: 'a',
          contentHash: 'hash-a',
          decision: 'unreviewed',
          approval: null
        }
      ]
    }
    const { host, app, events } = await mount({ referenceSet })
    button(host, 'Remove reference').click()
    expect(events).toEqual([['references', []]])
    expect(referenceSet.references).toHaveLength(1)
    app.unmount()
  })
  it('emits canonical Banner identity from a composite overlay library selection and prevents duplicates', async () => {
    const assetId = '00000000-0000-4000-8000-000000000020'
    const { host, app, events, props } = await mount({ selectedAsset: { type: 'overlay', rawId: `${assetId}:reels_9x16`, name: 'Banner' } })
    button(host, 'Add selected reference').click()
    const references = events[0]![1] as Array<Record<string, unknown>>
    expect(ReferenceSetWriteSchema.safeParse({ operationId: '00000000-0000-4000-8000-000000000001', expectedRevision: null, references, brandKit: null }).success).toBe(true)
    expect(references[0]!.assetId).toBe(assetId)
    expect(references[0]!.sourceKind).toBe('banner_project')
    props.referenceSet = { references: references.map(ref => ({ ...ref, contentHash: 'a'.repeat(64), approval: null })) }
    await nextTick()
    button(host, 'Add selected reference').click()
    expect(events).toHaveLength(1)
    app.unmount()
  })
  it('freezes mutation while unresolved and offers receipt recovery', async () => {
    const { host, app } = await mount({ pendingOperation: 'apply-pending' })
    expect(button(host, 'Review manual plan').disabled).toBe(true)
    expect(button(host, 'Recover application').disabled).toBe(false)
    expect(button(host, 'Retry same application').disabled).toBe(false)
    app.unmount()
  })
  it('recipe prefill is local and keeps duration and format settings aligned', async () => {
    const { host, app, events } = await mount()
    const select = host.querySelector('select')!
    select.value = 'product-reveal'
    select.dispatchEvent(new Event('change'))
    await nextTick()
    expect(events).toHaveLength(1)
    expect(events[0][0]).toBe('draft')
    expect((events[0][1] as StoryboardDraft).recipe.values.targetFormat).toBe((events[0][1] as StoryboardDraft).targetFormat)
    expect((events[0][1] as StoryboardDraft).recipe.values.durationSeconds).toBe((events[0][1] as StoryboardDraft).durationSeconds)
    app.unmount()
  })
  it('keeps recovery available on error', async () => {
    const { host, app, events } = await mount({ error: 'Conflict. Your draft is preserved.' })
    expect(host.textContent).toContain('Your draft is preserved')
    button(host, 'Refresh saved plan, keep draft').click()
    expect(events).toContainEqual(['refresh'])
    app.unmount()
  })
})
