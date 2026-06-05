// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { computed, createApp, createSSRApp, h, nextTick, reactive, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ContainerBlockRenderer from '~~/app/components/email/builder/ContainerBlockRenderer.vue'
import ColumnsContainerRenderer from '~~/app/components/email/builder/ColumnsContainerRenderer.vue'

Object.assign(globalThis, { computed, reactive, ref })

function makeStore() {
  const removedBlockIds: string[] = []
  return {
    selectedBlockId: ref('text-child'),
    removedBlockIds,
    document: ref({
      'root': { type: 'root', data: { childrenIds: ['container'] } },
      'container': {
        type: 'Container',
        data: {
          childrenIds: ['text-child'],
          style: { padding: { top: 16, right: 24, bottom: 16, left: 24 } },
          props: {}
        }
      },
      'columns': {
        type: 'ColumnsContainer',
        data: {
          style: { padding: { top: 16, right: 24, bottom: 16, left: 24 } },
          props: {
            columnsCount: 2,
            columns: [{ childrenIds: ['text-child'] }, { childrenIds: [] }]
          }
        }
      },
      'button-child': {
        type: 'Button',
        data: {
          style: { fontSize: 16 },
          props: { text: 'Click Here', buttonBackgroundColor: '#2f4574' }
        }
      },
      'text-child': {
        type: 'Text',
        data: {
          style: { color: '#111111' },
          props: { text: 'Nested copy' }
        }
      }
    }),
    setSelectedBlockId: () => {},
    removeBlock: (blockId: string) => removedBlockIds.push(blockId),
    addBlock: () => '',
    addBlockToDocument: () => {},
    addBlockToColumn: () => {},
    insertBlocks: () => {},
    insertBlocksToColumn: () => {}
  }
}

const stubs = {
  UPopover: { name: 'UPopover', template: '<div><slot /><slot name="content" /></div>' },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  EmailBuilderEdmBlockRenderer: {
    name: 'EmailBuilderEdmBlockRenderer',
    props: ['type', 'style', 'props', 'hiddenOnDevice', 'editable'],
    emits: ['update:text'],
    template: '<button class="child-renderer" :data-type="type" :data-editable="editable" :data-button-color="props?.buttonBackgroundColor" :data-font-size="style?.fontSize" @click="$emit(\'update:text\', \'Updated nested copy\')">{{ props?.text }}</button>'
  },
  EmailBuilderEdmAddModuleMenu: {
    name: 'EmailBuilderEdmAddModuleMenu',
    template: '<div class="nested-module-picker">Unified module picker</div>'
  }
}

async function render(component: unknown, props: Record<string, unknown>, store = makeStore()) {
  ;(globalThis as Record<string, unknown>).useEdmBuilder = () => store
  const app = createSSRApp({
    render: () => h(component as never, props)
  })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  return renderToString(app)
}

function mount(component: unknown, props: Record<string, unknown>, store = makeStore()) {
  ;(globalThis as Record<string, unknown>).useEdmBuilder = () => store
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(component as never, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

describe('nested EDM inline editing', () => {
  it('marks container child renderers editable on the editor canvas', async () => {
    const html = await render(ContainerBlockRenderer, { blockId: 'container', device: 'desktop' })

    expect(html).toContain('class="child-renderer"')
    expect(html).toContain('data-type="Text"')
    expect(html).toContain('data-editable')
    expect(html).toContain('Nested copy')
  })

  it('marks columns child renderers editable on the editor canvas', async () => {
    const store = makeStore()
    const html = await render(ColumnsContainerRenderer, {
      blockId: 'columns',
      device: 'desktop',
      style: store.document.value.columns.data.style,
      props: store.document.value.columns.data.props
    }, store)

    expect(html).toContain('class="child-renderer"')
    expect(html).toContain('data-type="Text"')
    expect(html).toContain('data-editable')
    expect(html).toContain('Nested copy')
  })

  it('uses the unified module picker when adding children to containers', async () => {
    const html = await render(ContainerBlockRenderer, { blockId: 'container', device: 'desktop' })

    expect(html).toContain('nested-module-picker')
    expect(html).toContain('Unified module picker')
  })

  it('uses the unified module picker when adding children to columns', async () => {
    const store = makeStore()
    const html = await render(ColumnsContainerRenderer, {
      blockId: 'columns',
      device: 'desktop',
      style: store.document.value.columns.data.style,
      props: store.document.value.columns.data.props
    }, store)

    expect(html).toContain('nested-module-picker')
    expect(html).toContain('Unified module picker')
  })

  it('keeps the add control visible in empty columns', async () => {
    const store = makeStore()
    const html = await render(ColumnsContainerRenderer, {
      blockId: 'columns',
      device: 'desktop',
      style: store.document.value.columns.data.style,
      props: store.document.value.columns.data.props
    }, store)
    const emptyColumnAddButton = html.match(/<button[^>]*data-edm-nested-add-trigger[^>]*data-edm-column-index="1"[^>]*>/)?.[0] || ''

    expect(html).toContain('class="column is-empty"')
    expect(html).toContain('min-height:60px')
    expect(html).toContain('class="column-add-block is-inline"')
    expect(html).toContain('class="column-add-block is-empty"')
    expect(emptyColumnAddButton).toContain('data-edm-column-index="1"')
    expect(emptyColumnAddButton).not.toContain('display:none')
  })

  it('refreshes nested child renderer props when selected block settings change', async () => {
    const store = makeStore()
    store.document.value.columns.data.props = {
      columnsCount: 2,
      columns: [{ childrenIds: ['button-child'] }, { childrenIds: [] }]
    }
    const { app, host } = mount(ColumnsContainerRenderer, {
      blockId: 'columns',
      device: 'desktop',
      style: store.document.value.columns.data.style,
      props: store.document.value.columns.data.props
    }, store)

    expect(host.querySelector('.child-renderer')?.textContent).toBe('Click Here')
    expect(host.querySelector('.child-renderer')?.getAttribute('data-button-color')).toBe('#2f4574')

    store.document.value = {
      ...store.document.value,
      'button-child': {
        ...store.document.value['button-child'],
        data: {
          style: { fontSize: 26 },
          props: { text: 'Updated CTA', buttonBackgroundColor: '#123456' }
        }
      }
    }
    await nextTick()

    expect(host.querySelector('.child-renderer')?.textContent).toBe('Updated CTA')
    expect(host.querySelector('.child-renderer')?.getAttribute('data-button-color')).toBe('#123456')
    expect(host.querySelector('.child-renderer')?.getAttribute('data-font-size')).toBe('26')

    app.unmount()
    host.remove()
  })

  it('shows a delete action for the selected column child', async () => {
    const store = makeStore()
    const { app, host } = mount(ColumnsContainerRenderer, {
      blockId: 'columns',
      device: 'desktop',
      style: store.document.value.columns.data.style,
      props: store.document.value.columns.data.props
    }, store)

    const deleteButton = host.querySelector('[data-edm-column-child-delete]') as HTMLButtonElement | null
    expect(deleteButton?.getAttribute('title')).toBe('Delete element')

    deleteButton?.click()

    expect(store.removedBlockIds).toEqual(['text-child'])

    app.unmount()
    host.remove()
  })
})
