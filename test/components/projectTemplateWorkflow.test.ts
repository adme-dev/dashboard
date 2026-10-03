// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import TaskEditor from '~~/app/components/templates/TaskEditor.vue'
import ConvertModal from '~~/app/components/briefs/ConvertProjectModal.vue'

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

describe('template workflow controls', () => {
  it('saves editable instructions and the revision seen when the editor opened', async () => {
    fetchMock.mockResolvedValueOnce([{ id: 'social', name: 'Social', isActive: true }]).mockResolvedValueOnce({ id: 'task' })
    const saved = vi.fn()
    const { host, props } = mount(TaskEditor, { templateId: 'template', revision: 'v1', tasks: [], defaultDepartmentId: 'social', onSaved: saved })
    await flush()
    props.revision = 'v2'
    await change(host, 'Task title', 'Review video')
    await change(host, 'Instructions and acceptance criteria', 'Confirm the approved client and asset')
    click(host, 'Save task')
    await flush()
    expect(fetchMock).toHaveBeenLastCalledWith('/api/agency/templates/template/tasks', expect.objectContaining({ body: expect.objectContaining({ title: 'Review video', description: 'Confirm the approved client and asset', expectedRevision: 'v1', defaultDepartmentId: 'social' }) }))
    expect(saved).toHaveBeenCalledOnce()
    expect(props.open).toBe(false)
  })
  it('excludes self dependencies and retains the form on a stale edit', async () => {
    fetchMock.mockResolvedValueOnce([{ id: 'social', name: 'Social' }]).mockRejectedValueOnce({ data: { statusMessage: 'This template changed. Refresh first.' } })
    const task = { id: 'review', title: 'Review video', defaultDepartmentId: 'social' }
    const { host, props } = mount(TaskEditor, { templateId: 'template', revision: 'v1', task, tasks: [task, { id: 'copy', title: 'Write copy' }] })
    await flush()
    expect(host.querySelector('[data-field="Prerequisite tasks"]')?.textContent).not.toContain('Review video')
    click(host, 'Save task')
    await flush()
    expect(props.open).toBe(true)
    expect(host.textContent).toContain('This template changed. Refresh first.')
  })
  it('submits the selected six-task template and an explicit project-only alternative', async () => {
    fetchMock.mockResolvedValue({ templates: [{ id: 'six', name: 'Social video', taskCount: 6 }] })
    const submit = vi.fn()
    const { host } = mount(ConvertModal, { title: 'DriveAgent introduction', templateId: 'six', onSubmit: submit })
    await flush()
    expect(host.textContent).toContain('Creates one project with 6 tasks.')
    click(host, 'Create project')
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ projectName: 'DriveAgent introduction', projectTemplateId: 'six' }))
    await change(host, 'Job template', '_none')
    click(host, 'Create project')
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ projectTemplateId: null }))
  })
  it('blocks empty or unavailable templates instead of silently creating no tasks', async () => {
    fetchMock.mockResolvedValue({ templates: [{ id: 'empty', name: 'Empty job', taskCount: 0 }] })
    const submit = vi.fn()
    const { host } = mount(ConvertModal, { title: 'DriveAgent introduction', templateId: 'empty', onSubmit: submit })
    await flush()
    click(host, 'Create project')
    expect(submit).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Add tasks to this template')
  })
})
