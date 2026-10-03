// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'

const request = vi.fn(async (url: string) => url.endsWith('/boards') ? [{ id: 'social', name: 'Social Media' }] : url.endsWith('/team-members') ? [] : { id: 'saved-task' })
Object.assign(globalThis, { computed, ref, watch, $fetch: request, useAuth: () => ({ user: ref({ id: 'manager' }) }), useToast: () => ({ add: vi.fn() }) })
const QuickTask = (await import('~~/app/components/task/QuickTaskCreate.vue')).default
let cleanup = () => {}
afterEach(() => {
  cleanup()
  request.mockClear()
})
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const open = ref(false)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(QuickTask, { 'open': open.value, 'onUpdate:open': (v: boolean) => {
    open.value = v
  }, 'sourceType': 'brief', 'sourceLabel': 'SOC-26-0007', 'briefId': 'brief', 'prefillProjectId': 'project', 'prefillTitle': 'Prepare social copy', 'prefillDescription': 'Use the approved audience and CTA.' }) })
  app.component('UModal', { props: ['open'], template: '<div v-if="open"><slot name="content"/></div>' })
  app.component('UFormField', { props: ['label'], template: '<section :data-field="label"><label>{{label}}</label><slot/></section>' })
  for (const name of ['UInput', 'UTextarea']) app.component(name, { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('USelectMenu', { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :value="item.value">{{ item.label }}</option></select>' })
  app.component('UButton', { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot/></button>' })
  app.component('UIcon', { template: '<span/>' })
  app.mount(host)
  open.value = true
  await flush()
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  return { host, open }
}
describe('brief task handoff', () => {
  it('keeps editable acceptance criteria and source links in the created task', async () => {
    const { host } = await mount()
    const description = host.querySelector('[data-field="Description"] textarea') as HTMLTextAreaElement
    expect(description, 'task instructions must be editable before handoff').not.toBeNull()
    expect(description.value).toBe('Use the approved audience and CTA.')
    description.value = 'Final copy must include the approved demo CTA.'
    description.dispatchEvent(new Event('input'))
    const board = host.querySelector('select')!
    board.value = 'social'
    board.dispatchEvent(new Event('change'))
    await flush()
    Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Create Task')!.click()
    await flush()
    expect(request).toHaveBeenCalledWith('/api/agency/tasks', expect.objectContaining({ body: expect.objectContaining({ description: 'Final copy must include the approved demo CTA.', briefId: 'brief', projectId: 'project', departmentId: 'social' }) }))
  })
  it('restores the supplied instructions when reopened', async () => {
    const { host, open } = await mount()
    const description = host.querySelector('[data-field="Description"] textarea') as HTMLTextAreaElement
    expect(description).not.toBeNull()
    description.value = 'Unsaved text'
    description.dispatchEvent(new Event('input'))
    open.value = false
    await flush()
    open.value = true
    await flush()
    expect((host.querySelector('[data-field="Description"] textarea') as HTMLTextAreaElement).value).toBe('Use the approved audience and CTA.')
  })
})
