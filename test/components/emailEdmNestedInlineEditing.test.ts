import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h, reactive, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ContainerBlockRenderer from '~~/app/components/email/builder/ContainerBlockRenderer.vue'
import ColumnsContainerRenderer from '~~/app/components/email/builder/ColumnsContainerRenderer.vue'

Object.assign(globalThis, { computed, reactive, ref })

function makeStore() {
  return {
    selectedBlockId: ref('text-child'),
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
      'text-child': {
        type: 'Text',
        data: {
          style: { color: '#111111' },
          props: { text: 'Nested copy' }
        }
      }
    }),
    setSelectedBlockId: () => {},
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
    template: '<button class="child-renderer" :data-type="type" :data-editable="editable" @click="$emit(\'update:text\', \'Updated nested copy\')">{{ props?.text }}</button>'
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

    expect(emptyColumnAddButton).toContain('data-edm-column-index="1"')
    expect(emptyColumnAddButton).not.toContain('display:none')
  })
})
