// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import VideoStudioCampaignPrompt from '~~/app/components/media/VideoStudioCampaignPrompt.vue'
import type { CampaignPrompt } from '~~/server/utils/audio/timelineSchema'

const clientId = 'f7c142a6-a63f-4f75-90aa-700db68c1c76'
const draft = { clientId, brief: 'Book a demo', guideRules: 'Keep logo crisp', prompt: 'Preserve the approved artwork.' }
const toast = vi.fn()
const campaignId = '01a60d22-ff86-4501-a0a7-521bc12e4cc9'
Object.assign(globalThis, { useToast: () => ({ add: toast }), $fetch: async () => [{ id: campaignId, name: 'Product launch', status: 'planning' }] })
async function mount(saveDraft: (value: CampaignPrompt) => Promise<void>, savedDraft: CampaignPrompt = draft) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const apply = vi.fn()
  const app = createApp({ render: () => h(VideoStudioCampaignPrompt, { clientId, savedDraft, saveDraft, onApply: apply }) })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UModal', { props: ['modelValue', 'open'], template: '<section v-if="open"><slot name="body"/><slot name="footer"/></section>' })
  app.component('UFormField', { template: '<div><slot/></div>' })
  app.component('UTextarea', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('UAlert', { props: ['title'], template: '<p role="alert">{{ title }}</p>' })
  app.component('USelectMenu', { props: ['modelValue', 'items', 'disabled'], emits: ['update:modelValue'], template: '<select :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' })
  app.mount(host)
  await nextTick()
  const click = async (label: string) => {
    const button = [...host.querySelectorAll('button')].find(b => b.textContent === label)!
    button.click()
    await nextTick()
    await nextTick()
  }
  return { host, app, apply, click }
}
describe('campaign prompt review and save', () => {
  it('reloads the saved draft and only applies after the project save succeeds', async () => {
    let resolve!: () => void
    const saveDraft = vi.fn(() => new Promise<void>((done) => {
      resolve = done
    }))
    const view = await mount(saveDraft)
    try {
      await view.click('Prepare campaign prompt')
      expect([...view.host.querySelectorAll('textarea')].map(t => t.value)).toEqual([draft.brief, draft.guideRules, draft.prompt, ''])
      await view.click('Save and apply prompt')
      expect(view.apply).not.toHaveBeenCalled()
      expect(saveDraft).toHaveBeenCalledWith({ ...draft, campaignId: null, socialBrief: '' })
      resolve()
      await nextTick()
      await nextTick()
      expect(view.apply).toHaveBeenCalledWith(draft.prompt)
    } finally {
      view.app.unmount()
      view.host.remove()
    }
  })
  it('keeps editable text after a failed save and does not apply it', async () => {
    const view = await mount(async () => {
      throw new Error('Offline')
    })
    try {
      await view.click('Prepare campaign prompt')
      await view.click('Save and apply prompt')
      expect(view.apply).not.toHaveBeenCalled()
      expect(view.host.querySelector('[role="alert"]')?.textContent).toContain('Could not save')
      expect(view.host.querySelector('textarea')?.value).toBe(draft.brief)
    } finally {
      view.app.unmount()
      view.host.remove()
    }
  })
  it('ignores another client’s saved guidance', async () => {
    const view = await mount(vi.fn(), { ...draft, clientId: 'bc8a15a8-f523-4a75-a8f4-a501649bb71d' })
    try {
      await view.click('Prepare campaign prompt')
      expect([...view.host.querySelectorAll('textarea')].every(t => !t.value)).toBe(true)
    } finally {
      view.app.unmount()
      view.host.remove()
    }
  })
  it('does not show success or apply an old prompt after leaving the project', async () => {
    toast.mockClear()
    let resolve!: () => void
    const view = await mount(() => new Promise<void>((done) => {
      resolve = done
    }))
    await view.click('Prepare campaign prompt')
    await view.click('Save and apply prompt')
    view.app.unmount()
    view.host.remove()
    resolve()
    await nextTick()
    await nextTick()
    expect(toast).not.toHaveBeenCalled()
    expect(view.apply).not.toHaveBeenCalled()
  })
  it('requires replacing an unavailable saved campaign before saving', async () => {
    const saveDraft = vi.fn()
    const view = await mount(saveDraft, { ...draft, campaignId: '7e7cb0e9-4f90-448b-8e17-2ebff3d5d1cd' })
    try {
      await view.click('Prepare campaign prompt')
      const button = [...view.host.querySelectorAll('button')].find(b => b.textContent === 'Save and apply prompt')!
      expect(button.disabled).toBe(true)
      await view.click('Save and apply prompt')
      expect(saveDraft).not.toHaveBeenCalled()
      const select = view.host.querySelector('select')!
      select.value = '__none__'
      select.dispatchEvent(new Event('change'))
      await nextTick()
      expect(button.disabled).toBe(false)
    } finally {
      view.app.unmount()
      view.host.remove()
    }
  })
  it('restores and saves the social caption brief and campaign without adding them to the motion prompt', async () => {
    const saveDraft = vi.fn().mockResolvedValue(undefined)
    const saved = { ...draft, campaignId, socialBrief: 'Introduce the product. Book a demo.' }
    const view = await mount(saveDraft, saved)
    try {
      await view.click('Prepare campaign prompt')
      expect(view.host.querySelector('select')?.value).toBe(campaignId)
      expect([...view.host.querySelectorAll('textarea')].at(-1)?.value).toBe(saved.socialBrief)
      await view.click('Save and apply prompt')
      expect(saveDraft).toHaveBeenCalledWith(saved)
      expect(view.apply).toHaveBeenCalledWith(draft.prompt)
    } finally {
      view.app.unmount()
      view.host.remove()
    }
  })
})
