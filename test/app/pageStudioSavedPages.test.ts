// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, reactive } from 'vue'
import { describe, expect, it, vi, afterEach } from 'vitest'
import SavedPages from '../../app/components/page-studio/SavedPages.client.vue'

const button = defineComponent({
  props: ['label', 'disabled'], emits: ['click'],
  setup(props, { emit }) { return () => h('button', { disabled: props.disabled, onClick: () => emit('click') }, props.label) }
})
const props = {
  saved: { checkpointId: 'latest', pages: [
    { id: 'home', title: 'Home', route: '/', visibility: 'public' as const, seo: { title: 'Fantasy Limo', description: 'Latest saved description' }, forms: [] },
    { id: 'booking', title: 'Request a booking', route: '/bookings', visibility: 'draft' as const, seo: { title: 'Book your journey' }, forms: [{ id: 'booking-form' }] }
  ] },
  pageLimit: 15, updatedAt: '2026-09-11T07:00:00Z', launching: false, canLaunch: true
}
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})
function mountSaved() {
  const state = reactive(structuredClone(props))
  const reload = vi.fn()
  const edit = vi.fn()
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(SavedPages, { ...state, onReload: reload, onEdit: edit }) })
  app.component('UButton', button)
  app.component('UBadge', { template: '<span><slot /></span>' })
  app.mount(element)
  cleanups.push(() => {
    app.unmount()
    element.remove()
  })
  return { element, state, reload, edit }
}
describe('Saved website Pages view', () => {
  it('renders saved page titles, routes, SEO and form counts without a second save action', () => {
    const { element } = mountSaved()
    expect(element.querySelectorAll('li')).toHaveLength(2)
    expect(element.textContent).toContain('2 of 15 pages')
    expect(element.textContent).toContain('Request a booking')
    expect(element.textContent).toContain('/bookings')
    expect(element.textContent).toContain('Latest saved description')
    expect(element.textContent).toContain('1 form')
    expect(element.textContent).not.toContain('Save pages')
    expect(element.textContent).not.toContain('Published')
  })
  it('launches Studio and reloads through the parent, and renders refreshed saved content', async () => {
    const { element, state, reload, edit } = mountSaved()
    element.querySelectorAll('button')[0].click()
    element.querySelectorAll('button')[1].click()
    expect(reload).toHaveBeenCalledOnce()
    expect(edit).toHaveBeenCalledOnce()
    state.saved = { ...props.saved, checkpointId: 'newer', pages: [{ ...props.saved.pages[0], title: 'Updated home' }] }
    await nextTick()
    expect(element.querySelectorAll('li')).toHaveLength(1)
    expect(element.textContent).toContain('Updated home')
    expect(element.textContent).not.toContain('Request a booking')
  })
})
