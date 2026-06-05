import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmImageLibraryPicker from '~~/app/components/email/builder/EdmImageLibraryPicker.vue'

Object.assign(globalThis, {
  ref,
  computed,
  useToast: () => ({ add: () => {} }),
  useFetch: async () => ({
    data: ref({
      assets: [
        {
          id: 'asset-1',
          name: 'Hero car.png',
          mimeType: 'image/png',
          fileSize: 1536,
          r2Key: 'banner-assets/u/hero.png',
          url: '/uploads/hero.png',
          thumbnailUrl: null,
          tags: ['email'],
          uploadedBy: 'user-1',
          createdAt: '2026-06-05T00:00:00.000Z'
        },
        {
          id: 'asset-2',
          name: 'Deck.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          r2Key: 'banner-assets/u/deck.pdf',
          url: '/uploads/deck.pdf',
          thumbnailUrl: null,
          tags: [],
          uploadedBy: 'user-1',
          createdAt: '2026-06-05T00:00:00.000Z'
        }
      ]
    }),
    refresh: () => {},
    pending: ref(false)
  })
})

const passthrough = (name: string) => ({ name, template: '<div><slot /><slot name="content" /></div>' })
const stubs: Record<string, unknown> = {
  USlideover: passthrough('USlideover'),
  UButton: { name: 'UButton', props: ['label', 'icon'], template: '<button :data-icon="icon"><slot />{{ label }}</button>' },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UInput: { name: 'UInput', props: ['modelValue'], template: '<input />' },
  UAlert: { name: 'UAlert', props: ['title', 'description'], template: '<div>{{ title }}{{ description }}</div>' }
}

async function renderPicker() {
  const app = createSSRApp({
    render: () => h(EdmImageLibraryPicker, { open: true })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp as never))
  return renderToString(app)
}

describe('EmailBuilderEdmImageLibraryPicker', () => {
  it('renders the agency image library with upload controls and image assets only', async () => {
    const html = await renderPicker()

    expect(html).toContain('Image Library')
    expect(html).toContain('Upload image')
    expect(html).toContain('Hero car.png')
    expect(html).toContain('1.5 KB')
    expect(html).not.toContain('Deck.pdf')
  })
})
