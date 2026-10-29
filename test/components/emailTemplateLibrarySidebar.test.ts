// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TemplateLibrarySidebar from '~~/app/components/email/TemplateLibrarySidebar.vue'

type SidebarEvent = { name: 'select', payload: string } | { name: 'newFolder' | 'imageLibrary' }

let cleanup: () => void

afterEach(() => {
  cleanup?.()
})

function mount(props: { activeView: string, folders: string[] }) {
  const events: SidebarEvent[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(defineComponent({
    setup() {
      return () => h(TemplateLibrarySidebar, {
        activeView: props.activeView,
        folders: props.folders,
        onSelect: (view: string) => events.push({ name: 'select', payload: view }),
        onNewFolder: () => events.push({ name: 'newFolder' }),
        onImageLibrary: () => events.push({ name: 'imageLibrary' })
      })
    }
  }))
  app.component('UButton', {
    inheritAttrs: false,
    props: ['label', 'icon', 'to', 'active', 'color', 'variant'],
    emits: ['click'],
    template: `
      <a
        v-if="to"
        v-bind="$attrs"
        :href="to"
        :data-icon="icon"
        :data-active="String(!!active)"
        :data-color="color"
        :data-variant="variant"
      >{{ label }}<slot /></a>
      <button
        v-else
        v-bind="$attrs"
        type="button"
        :data-icon="icon"
        :data-active="String(!!active)"
        :data-color="color"
        :data-variant="variant"
        @click="$emit('click')"
      >{{ label }}<slot /></button>
    `
  })
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  return { host, events }
}

function control(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll<HTMLElement>('button, a')).find(el => el.textContent?.trim() === label)
}

describe('TemplateLibrarySidebar', () => {
  it('marks the active view and links invite and support to existing routes', () => {
    const { host } = mount({ activeView: 'drafts', folders: ['Newsletters'] })

    expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe('Template library')
    expect(control(host, 'Recently viewed')?.dataset).toMatchObject({ active: 'false', color: 'neutral', variant: 'ghost' })
    expect(control(host, 'Drafts')?.dataset).toMatchObject({ active: 'true', color: 'primary', variant: 'soft' })
    expect(control(host, 'Drafts')?.getAttribute('aria-current')).toBe('page')
    expect(control(host, 'All templates')?.dataset.active).toBe('false')
    expect(control(host, 'Shared defaults')?.dataset.active).toBe('false')
    expect(host.textContent).toContain('Categories')
    expect(control(host, 'Newsletters')?.dataset).toMatchObject({ active: 'false', variant: 'ghost' })
    expect(control(host, 'Invite a teammate')?.getAttribute('href')).toBe('/settings/members')
    expect(control(host, 'Help & support')?.getAttribute('href')).toBe('/support')
    expect(control(host, 'Image library')?.tagName).toBe('BUTTON')
    expect(host.textContent).not.toContain('Chat with Us')
    expect(host.textContent).not.toContain('Chat with us')
  })

  it('highlights folder:<name> without activating the library views', () => {
    const { host } = mount({ activeView: 'folder:Newsletters', folders: ['Newsletters', 'Offers'] })

    expect(control(host, 'Newsletters')?.dataset).toMatchObject({ active: 'true', color: 'primary', variant: 'soft' })
    expect(control(host, 'Newsletters')?.getAttribute('aria-current')).toBe('page')
    expect(control(host, 'Offers')?.dataset.active).toBe('false')
    expect(control(host, 'All templates')?.dataset.active).toBe('false')
    expect(control(host, 'Shared defaults')?.dataset.active).toBe('false')
    expect(control(host, 'Recently viewed')?.dataset.active).toBe('false')
  })

  it('emits select, newFolder, and imageLibrary from buttons and not from links', async () => {
    const { host, events } = mount({ activeView: 'templates', folders: ['Newsletters'] })

    control(host, 'Recently viewed')!.click()
    control(host, 'Drafts')!.click()
    control(host, 'All templates')!.click()
    control(host, 'Shared defaults')!.click()
    control(host, 'Newsletters')!.click()
    control(host, 'New category')!.click()
    control(host, 'Image library')!.click()
    control(host, 'Invite a teammate')!.click()
    control(host, 'Help & support')!.click()
    await nextTick()

    expect(events).toEqual([
      { name: 'select', payload: 'recent' },
      { name: 'select', payload: 'drafts' },
      { name: 'select', payload: 'templates' },
      { name: 'select', payload: 'shared' },
      { name: 'select', payload: 'folder:Newsletters' },
      { name: 'newFolder' },
      { name: 'imageLibrary' }
    ])
  })

  it('shows an empty category state and still offers New category', async () => {
    const { host, events } = mount({ activeView: 'shared', folders: [] })

    expect(host.textContent).toContain('No categories yet.')
    expect(control(host, 'Shared defaults')?.dataset).toMatchObject({ active: 'true', color: 'primary', variant: 'soft' })
    control(host, 'New category')!.click()
    await nextTick()
    expect(events).toEqual([{ name: 'newFolder' }])
  })
})
