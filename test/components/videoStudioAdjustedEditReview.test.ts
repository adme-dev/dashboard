// @vitest-environment happy-dom
import { createApp, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import Review from '~~/app/components/media/VideoStudioAdjustedEditReview.vue'

describe('adjusted edit review', () => {
  it('requires explicit acceptance and shows only affected obligations while disabled entry remains recoverable', async () => {
    const events: unknown[] = []
    const host = document.createElement('div')
    const app = createApp({ render: () => h(Review, {
      snapshot: { timelineId: 'timeline', editRevision: 3, obligations: { cues: [], sources: [] }, findings: [], changes: [{ clipId: 'changed', reasons: ['timing'] }], review: null },
      clips: [{ value: 'changed', label: 'Changed clip' }, { value: 'untouched', label: 'Untouched clip' }],
      pending: false, error: null, onAccept: value => events.push(value)
    }) })
    app.component('UButton', { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' })
    app.component('UCheckbox', { props: ['modelValue', 'label'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">{{ label }}</label>' })
    app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
    app.component('USelect', { template: '<select />' })
    app.component('UInput', { template: '<input />' })
    app.component('UAlert', { props: ['title', 'description'], template: '<aside>{{ title }} {{ description }}</aside>' })
    app.mount(host)
    expect(host.textContent).toContain('Changed clip')
    expect(host.textContent).not.toContain('Untouched clip')
    const accept = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Accept adjusted edit'))!
    expect(accept.disabled).toBe(true)
    const check = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]!
    check.checked = true
    check.dispatchEvent(new Event('change'))
    await nextTick()
    accept.click()
    await nextTick()
    expect(events).toEqual([{ obligationMappings: [] }])
    app.unmount()
  })
})

it('requires separate human approval for revised exact copy and records only explicitly cleared references', async () => {
  const events: unknown[] = []
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Review, {
    snapshot: { timelineId: 'timeline', editRevision: 3, obligations: { cues: [], sources: [] }, findings: [], changes: [], review: null,
      copy: { contentHash: 'a'.repeat(64), scriptSegments: [], cues: [{ id: 'offer', text: 'Exact original', required: true }] },
      references: [{ sourceKind: 'video_asset', assetId: 'asset', contentHash: 'b'.repeat(64), decision: 'pending', clipIds: ['clip'] }] },
    clips: [{ value: 'clip', label: 'Footage' }], pending: false, error: null, onAccept: value => events.push(value)
  }) })
  app.component('UButton', { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' })
  app.component('UCheckbox', { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)">{{ label }}</label>' })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
  app.component('UTextarea', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('UAlert', { props: ['title'], template: '<aside>{{ title }}</aside>' })
  app.mount(host)
  const check = async (label: string) => {
    const input = [...host.querySelectorAll('label')].find(item => item.textContent === label)!.querySelector('input')!
    input.checked = true
    input.dispatchEvent(new Event('change'))
    await nextTick()
  }
  const accept = [...host.querySelectorAll('button')].find(item => item.textContent?.includes('Accept adjusted edit'))!
  await check('Revise required copy for this edit')
  const text = [...host.querySelectorAll('label')].find(item => item.textContent?.includes('On-screen copy: offer'))!.querySelector('textarea')!
  text.value = 'Exact revised 条件'
  text.dispatchEvent(new Event('input'))
  await nextTick()
  await check('I reviewed the affected clips, timing, layout and required copy.')
  expect(accept.disabled).toBe(true)
  await check('I approve this exact revised wording and its required-copy settings.')
  accept.click()
  expect(events).toEqual([{ obligationMappings: [], copyApproval: { expectedCopyHash: 'a'.repeat(64), scriptSegments: [], cues: [{ id: 'offer', text: 'Exact revised 条件', required: true }] } }])
  const evidence = [...host.querySelectorAll('label')].find(item => item.textContent?.includes('Usage approval evidence'))!.querySelector('textarea')!
  evidence.value = 'Reviewed usage clearance'
  evidence.dispatchEvent(new Event('input'))
  await nextTick()
  expect(accept.disabled).toBe(true)
  await check('I approve this source for the current edit.')
  await check('I reviewed the affected clips, timing, layout and required copy.')
  accept.click()
  expect(events[1]).toMatchObject({ referenceApproval: [{ sourceKind: 'video_asset', assetId: 'asset', expectedContentHash: 'b'.repeat(64), evidence: 'Reviewed usage clearance' }] })
  app.unmount()
})

it('requires current brand kit evidence and resets approvals before emitting exact pinned hashes', async () => {
  const events: unknown[] = []
  const host = document.createElement('div')
  const snapshot = ref({
    timelineId: 'timeline', editRevision: 3, obligations: { cues: [], sources: [] }, findings: [], changes: [], review: null,
    brandKit: { id: 'kit-1', name: 'Current campaign kit' as string | undefined, pinnedContentHash: 'c'.repeat(64), contentHash: 'd'.repeat(64), decision: 'pending' as 'pending' | 'approved' }
  })
  const app = createApp({ render: () => h(Review, {
    snapshot: snapshot.value,
    clips: [], pending: false, error: null, onAccept: value => events.push(value)
  }) })
  app.component('UButton', { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' })
  app.component('UCheckbox', { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)">{{ label }}</label>' })
  app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot /></label>' })
  app.component('UTextarea', { props: ['modelValue', 'disabled', 'maxlength'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :disabled="disabled" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('UAlert', { props: ['title'], template: '<aside>{{ title }}</aside>' })
  app.mount(host)

  const checkbox = (label: string) => [...host.querySelectorAll('label')].find(item => item.textContent === label)!.querySelector('input')!
  const check = async (label: string) => {
    const input = checkbox(label)
    input.checked = true
    input.dispatchEvent(new Event('change'))
    await nextTick()
  }
  const accept = [...host.querySelectorAll('button')].find(item => item.textContent?.includes('Accept adjusted edit'))!
  const brandAcknowledgement = 'I approve this pinned brand kit for the current edit.'
  const finalAcknowledgement = 'I reviewed the affected clips, timing, layout and required copy.'
  expect(host.textContent).toContain('Current campaign kit')
  expect(checkbox(brandAcknowledgement).disabled).toBe(true)

  await check(finalAcknowledgement)
  const evidence = [...host.querySelectorAll('label')].find(item => item.textContent?.includes('Brand kit approval evidence'))!.querySelector('textarea')!
  expect(evidence.maxLength).toBe(2000)
  evidence.value = '  Reviewed current client, actor and font approvals.  '
  evidence.dispatchEvent(new Event('input'))
  await nextTick()
  expect(checkbox(finalAcknowledgement).checked).toBe(false)
  expect(accept.disabled).toBe(true)
  await check(brandAcknowledgement)
  await check(finalAcknowledgement)
  accept.click()
  expect(events[0]).toEqual({
    obligationMappings: [],
    brandKitApproval: {
      id: 'kit-1', expectedPinnedHash: 'c'.repeat(64), expectedContentHash: 'd'.repeat(64),
      evidence: 'Reviewed current client, actor and font approvals.'
    }
  })

  evidence.value = 'Changed evidence'
  evidence.dispatchEvent(new Event('input'))
  await nextTick()
  expect(checkbox(brandAcknowledgement).checked).toBe(false)
  expect(checkbox(finalAcknowledgement).checked).toBe(false)
  expect(accept.disabled).toBe(true)
  await check(brandAcknowledgement)
  await check(finalAcknowledgement)
  snapshot.value = { ...snapshot.value, brandKit: { ...snapshot.value.brandKit, name: undefined } }
  await nextTick()
  expect(host.textContent).toContain('kit-1')
  expect(checkbox(brandAcknowledgement).checked).toBe(false)
  expect(checkbox(finalAcknowledgement).checked).toBe(false)
  expect(evidence.value).toBe('')

  snapshot.value = { ...snapshot.value, brandKit: { ...snapshot.value.brandKit, decision: 'approved' as const } }
  await nextTick()
  expect(host.textContent).not.toContain('Brand kit approval evidence')
  await check(finalAcknowledgement)
  accept.click()
  expect(events[1]).toEqual({ obligationMappings: [] })
  app.unmount()
})
