// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, ref, Suspense, watch } from 'vue'

const task = { id: 'real-task-id', title: 'Prepare final video', description: 'Check approved copy.', priority: 'medium', status: { name: 'To Do', category: 'not_started', color: '#888888', isFinal: false }, department: { id: 'social', slug: 'social-media', name: 'Social Media' }, project: { id: 'project', name: 'DriveAgent introduction' }, assignee: { name: 'Real owner' }, reporter: { name: 'Real manager' }, createdAt: '2026-10-03', updatedAt: '2026-10-03', labels: [] }
const request = vi.fn(async (url: string) => url === '/api/agency/tasks' ? { tasks: [task], pagination: { total: 1, limit: 25, offset: 0 } } : url.endsWith('/real-task-id') ? task : url.endsWith('/projects') ? [{ id: 'project', name: 'DriveAgent introduction' }] : url.endsWith('/team-members') ? { members: [] } : [])
Object.assign(globalThis, { computed, ref, watch, onMounted, $fetch: request, definePageMeta: vi.fn(), useRoute: () => ({ params: { id: 'real-task-id' } }), useToast: () => ({ add: vi.fn() }) })
const List = (await import('~~/app/pages/agency/tasks/index.vue')).default
const Detail = (await import('~~/app/pages/agency/tasks/[id].vue')).default
const Info = (await import('~~/app/components/task/TaskInfo.vue')).default
let cleanup = () => {}
afterEach(() => cleanup())
async function mount(component: typeof List) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(component, { taskId: task.id }) }) })
  for (const name of ['UCard', 'UBadge', 'UFormField', 'UDashboardPanel', 'UDashboardNavbar']) app.component(name, { template: '<div><slot/><slot name="right"/></div>' })
  for (const name of ['UInput', 'UTextarea', 'UIcon', 'UAvatar', 'UCheckbox', 'UProgress', 'XfLoader', 'UModal']) app.component(name, { template: '<span/>' })
  app.component('UButton', { props: ['to'], emits: ['click'], template: '<button :data-to="to" @click="$emit(\'click\')"><slot/></button>' })
  app.component('USelectMenu', { props: ['items'], template: '<div data-options>{{JSON.stringify(items)}}</div>' })
  app.component('NuxtLink', { props: ['to'], template: '<a :href="to"><slot/></a>' })
  app.component('UBreadcrumb', { props: ['items'], template: '<nav><a v-for="item in items" :href="item.to">{{item.label}}</a></nav>' })
  app.component('UTable', { props: ['data'], setup(props, { slots }) {
    return () => h('div', props.data.flatMap((original: unknown, index: number) => Object.values(slots).map(slot => slot?.({ row: { id: String(index), original } }))))
  } })
  for (const name of ['TaskCommentThread', 'TaskDetailsPanel', 'TaskSubtaskList']) app.component(name, { props: ['taskId'], template: '<div :data-task-component="taskId"/>' })
  app.config.globalProperties.safeMediaUrl = (value: string) => value
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  for (let i = 0; i < 15; i++) {
    await Promise.resolve()
    await nextTick()
  }
  return host
}
describe('task views use saved records', () => {
  it('shows real task data and UUID links from Nuxt UI row wrappers', async () => {
    const host = await mount(List)
    expect(host.querySelector('a[href="/agency/tasks/real-task-id"]')?.textContent).toContain('Prepare final video')
    expect(host.textContent).toContain('To Do')
    expect(host.textContent).toContain('Real owner')
    expect(host.querySelector('a[href="/agency/tasks/0"]')).toBeNull()
  })
  it('shows the saved nested status, project, board and reporter in Details', async () => {
    const host = await mount(Info as typeof List)
    expect(host.textContent).toContain('To Do')
    expect(host.textContent).toContain('Real owner')
    expect(host.textContent).toContain('Real manager')
    expect(host.querySelector('a[href="/agency/projects/project"]')?.textContent).toContain('DriveAgent introduction')
    expect(host.querySelector('a[href="/agency/boards/social-media"]')?.textContent).toContain('Social Media')
  })
  it('uses persisted update/activity components without invented task history', async () => {
    const host = await mount(Detail as typeof List)
    expect(host.textContent).not.toContain('Started working on this task')
    expect(host.textContent).not.toContain('Sarah Chen')
    expect(host.querySelector('a[href="/agency/boards/undefined"]')).toBeNull()
    expect(host.querySelectorAll('[data-task-component="real-task-id"]').length).toBeGreaterThanOrEqual(2)
  })
})
