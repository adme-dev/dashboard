// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import PublishingHandoff from '~~/app/components/task/PublishingHandoff.vue'

const fetchMock = vi.fn()
Object.assign(globalThis, { computed, ref, shallowRef, watch, $fetch: (...args: unknown[]) => fetchMock(...args), useToast: () => ({ add: vi.fn() }) })
const control = { props: ['modelValue', 'items', 'multiple'], emits: ['update:modelValue'], template: '<select :multiple="multiple" :value="modelValue" @change="$emit(\'update:modelValue\', multiple ? Array.from($event.target.selectedOptions).map(o => o.value) : $event.target.value)"><option v-for="item in items" :value="item.value || item">{{ item.label || item }}</option></select>' }
const input = { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' }
const stubs = {
  UModal: { props: ['open'], template: '<div v-if="open"><slot name="body"/><slot name="footer"/></div>' },
  UFormField: { props: ['label'], template: '<label :data-field="label"><span>{{ label }}</span><slot/></label>' },
  UButton: { props: ['loading', 'disabled', 'label'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot/>{{ label }}</button>' },
  UInput: input, UTextarea: input, USelect: control, USelectMenu: control,
  UCheckbox: { template: '<span/>' }, UAlert: { props: ['description'], template: '<p role="alert">{{ description }}</p>' },
  UPopover: { template: '<div><slot/><slot name="content"/></div>' }, UCalendar: { template: '<span/>' }
}
const cleanups: (() => void)[] = []
function mount(component: unknown, initial: Record<string, unknown>) {
  const props = reactive({ open: true, ...initial })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(component as never, { ...props, 'onUpdate:open': (value: boolean) => {
    props.open = value
  } }) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, props }
}
async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
function click(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent?.includes(label))
  button?.click()
}
async function change(host: HTMLElement, label: string, value: string) {
  const element = host.querySelector(`[data-field="${label}"] input, [data-field="${label}"] select`) as HTMLInputElement
  element.value = value
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  await flush()
}
beforeEach(() => fetchMock.mockReset())
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

describe('task publishing controls', () => {
  it('links a selected existing draft and shows persisted status without auto-navigation or scheduling', async () => {
    fetchMock.mockResolvedValueOnce({ clientId: 'product', briefId: 'brief', post: null, drafts: [{ id: 'existing', content: 'DriveAgent intro' }] })
      .mockResolvedValueOnce({ clientId: 'product', briefId: 'brief', post: { id: 'existing', status: 'draft' } })
    const { host } = mount(PublishingHandoff, { taskId: 'task' })
    await flush()
    await change(host, 'Publishing draft', 'existing')
    click(host, 'Link selected draft')
    await flush()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/agency/tasks/task/publishing', { method: 'POST', body: { postId: 'existing' } })
    expect(host.textContent).toContain('Saved status: draft')
    expect(host.textContent).toContain('Open linked post')
    expect(host.textContent).not.toContain('Create linked draft')
  })
  it('retains selected draft on failure and allows a safe retry', async () => {
    fetchMock.mockResolvedValueOnce({ clientId: 'product', post: null, drafts: [{ id: 'existing', content: 'Intro' }] })
      .mockRejectedValueOnce({ data: { statusMessage: 'Ownership changed' } })
    const { host } = mount(PublishingHandoff, { taskId: 'task' })
    await flush()
    await change(host, 'Publishing draft', 'existing')
    click(host, 'Link selected draft')
    await flush()
    expect(host.textContent).toContain('Ownership changed')
    expect((host.querySelector('select') as HTMLSelectElement).value).toBe('existing')
  })
  it('never renders a stale response after switching tasks', async () => {
    let resolveOld: (v: unknown) => void
    fetchMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveOld = resolve
    }))
      .mockResolvedValueOnce({ clientId: 'new-client', briefId: null, post: null, drafts: [] })
    const { host, props } = mount(PublishingHandoff, { taskId: 'old' })
    props.taskId = 'new'
    await flush()
    resolveOld!({ clientId: 'old-client', post: { id: 'old-post', status: 'published' }, drafts: [] })
    await flush()
    expect(host.textContent).not.toContain('published')
    expect(host.textContent).toContain('Create linked draft')
  })
})
