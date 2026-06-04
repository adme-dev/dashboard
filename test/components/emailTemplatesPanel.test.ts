import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TemplatesPanel from '~~/app/components/email/TemplatesPanel.vue'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

const savedDocument: EdmFlyhubDocument = {
  root: { type: 'EmailLayout', data: { childrenIds: ['h'] } },
  h: { type: 'Heading', data: { props: { level: 'h2', text: 'Saved preview' }, style: {} } }
}

const savedTemplates = [
  {
    id: 'tpl-1',
    name: 'Saved Newsletter',
    subject: 'June update',
    preview_text: 'Preview line',
    body_source: savedDocument,
    template_kind: 'template',
    folder_name: 'Newsletters',
    updated_at: '2026-06-05T01:00:00.000Z'
  },
  {
    id: 'tpl-2',
    name: 'Saved Promo',
    subject: null,
    preview_text: null,
    body_source: savedDocument,
    template_kind: 'draft',
    folder_name: null,
    updated_at: '2026-06-04T01:00:00.000Z'
  }
]

Object.assign(globalThis, {
  ref,
  computed,
  useToast: () => ({ add: () => {} }),
  navigateTo: () => {},
  useFetch: async () => ({
    data: ref({ items: savedTemplates }),
    refresh: () => {},
    pending: ref(false)
  })
})

const passthrough = (name: string) => ({ name, template: '<div><slot /></div>' })
const stubs: Record<string, unknown> = {
  UButton: { name: 'UButton', props: ['label', 'icon'], template: '<button :data-icon="icon"><slot />{{ label }}</button>' },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}<slot /></span>' },
  UInput: { name: 'UInput', props: ['modelValue'], template: '<input />' },
  UTooltip: { name: 'UTooltip', props: ['text'], template: '<div>{{ text }}<slot /></div>' },
  UModal: passthrough('UModal'),
  UFormField: { name: 'UFormField', props: ['label'], template: '<div>{{ label }}<slot /></div>' },
  EmailBuilderEdmTemplateThumbnail: {
    name: 'EmailBuilderEdmTemplateThumbnail',
    props: ['templateId'],
    template: '<div class="starter-thumb" :data-template-id="templateId" />'
  },
  EmailBuilderEdmDocumentThumbnail: {
    name: 'EmailBuilderEdmDocumentThumbnail',
    props: ['document'],
    template: '<div class="saved-document-thumb">{{ document?.root?.type }}</div>'
  }
}

async function renderPanel() {
  const app = createSSRApp({
    render: () => h(TemplatesPanel)
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp as never))
  return renderToString(app)
}

describe('Email TemplatesPanel saved templates', () => {
  it('renders saved templates as preview cards instead of a divided row list', async () => {
    const html = await renderPanel()

    expect(html).toContain('Your templates')
    expect(html).toContain('saved-template-grid')
    expect(html).toContain('saved-template-card')
    expect(html).toContain('saved-document-thumb')
    expect(html).toContain('Saved Newsletter')
    expect(html).toContain('June update')
    expect(html).toContain('No subject')
    expect(html).not.toContain('divide-y')
  })

  it('preserves saved-template actions on every card', async () => {
    const html = await renderPanel()

    expect(html).toContain('Edit')
    expect(html).toContain('Duplicate')
    expect(html).toContain('Rename')
    expect(html).toContain('Delete')
    expect(html).toContain('data-icon="i-lucide-copy"')
    expect(html).toContain('data-icon="i-lucide-trash-2"')
  })

  it('groups saved templates by drafts and folder name', async () => {
    const html = await renderPanel()

    expect(html).toContain('Drafts')
    expect(html).toContain('Newsletters')
    expect(html).toContain('Saved Newsletter')
    expect(html).toContain('Saved Promo')
  })
})
