// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, createSSRApp, h, nextTick, ref, Suspense } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmImageLibraryPicker from '~~/app/components/email/builder/EdmImageLibraryPicker.vue'

const fetchMock = vi.fn()
const refreshMock = vi.fn()
const toastAddMock = vi.fn()
const imageAssets = [
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

Object.assign(globalThis, {
  ref,
  computed,
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock }),
  useFetch: async () => ({
    data: ref({ assets: imageAssets }),
    refresh: refreshMock,
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

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountPicker() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(Suspense, null, {
      default: () => h(EdmImageLibraryPicker, { open: true }),
      fallback: () => h('div', 'loading')
    })
  })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp as never))
  app.mount(host)
  await flush()
  return { app, host }
}

describe('EmailBuilderEdmImageLibraryPicker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (url: string) => (
      url === '/api/agency/email/assets' ? { assets: imageAssets } : {}
    ))
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('renders the agency image library with upload controls and image assets only', async () => {
    const html = await renderPicker()

    expect(html).toContain('Image Library')
    expect(html).toContain('Upload image')
    expect(html).toContain('Hero car.png')
    expect(html).toContain('1.5 KB')
    expect(html).not.toContain('Deck.pdf')
  })

  it('surfaces backend validation details when upload fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/agency/email/assets') return { assets: imageAssets }
      throw {
        data: {
          statusMessage: 'invalid_body',
          data: [
            { message: 'Image file is required.' },
            { message: 'Unsupported image type.' }
          ]
        }
      }
    })

    const { app, host } = await mountPicker()
    const input = host.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    const file = new File(['image'], 'hero.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true
    })

    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/agency/email/assets/upload', {
      method: 'POST',
      body: expect.any(FormData)
    })
    expect(toastAddMock).toHaveBeenCalledWith({
      title: 'Upload failed',
      description: 'invalid_body: Image file is required.; Unsupported image type.',
      color: 'error'
    })
    expect(host.textContent).toContain('invalid_body: Image file is required.; Unsupported image type.')

    app.unmount()
  })
})
