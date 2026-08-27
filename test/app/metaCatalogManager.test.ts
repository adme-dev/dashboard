// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  computed,
  createApp,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
} from 'vue'

const fetchMock = vi.fn(async (request: string) => {
  if (request === '/api/agency/social/meta/accounts') {
    return [{
      id: '11111111-1111-4111-8111-111111111111',
      accountId: '1234',
      accountName: 'Dealer Ads',
      status: 'active',
      tokenExpiresAt: '2026-09-01T00:00:00.000Z',
      scopes: ['business_management', 'catalog_management'],
    }]
  }
  if (request.startsWith('/api/admin/meta-catalogs/context?')) {
    return {
      connection: {
        id: '11111111-1111-4111-8111-111111111111',
        accountId: '1234',
        accountName: 'Dealer Ads',
        scopes: ['business_management', 'catalog_management'],
        tokenExpiresAt: '2026-09-01T00:00:00.000Z',
      },
      businesses: [{ id: 'biz-1', name: 'Dealer Group' }],
      selectedBusinessId: 'biz-1',
      catalogs: [{
        id: 'cat-1',
        name: 'Dealer Vehicles',
        vertical: 'vehicles',
        productCount: 12,
        feedCount: 1,
        businessId: 'biz-1',
        businessName: 'Dealer Group',
      }],
      catalogAccessGranted: true,
    }
  }
  return {}
})

Object.assign(globalThis, {
  $fetch: fetchMock,
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useToast: () => ({ add: vi.fn() }),
  useMetaConnect: () => ({
    state: reactive({ status: 'idle', error: '' }),
    connect: vi.fn(),
  }),
})

const { default: MetaCatalogManager } = await import('~/components/dealer-feeds/MetaCatalogManager.vue')

const stubs = {
  UAlert: { props: ['title', 'description'], template: '<aside><strong>{{ title }}</strong><span>{{ description }}</span><slot name="actions" /></aside>' },
  UBadge: { template: '<span><slot /></span>' },
  UButton: { props: ['disabled', 'loading'], template: '<button type="button" :disabled="disabled"><slot /></button>' },
  UEmpty: { props: ['title', 'description'], template: '<section><h3>{{ title }}</h3><p>{{ description }}</p><slot name="actions" /></section>' },
  UForm: { template: '<form><slot /></form>' },
  UFormField: { props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  UIcon: { template: '<i />' },
  UInput: { template: '<input>' },
  UModal: { template: '<div><slot name="content" /></div>' },
  USelect: { template: '<select />' },
  USelectMenu: { template: '<select />' },
  UTable: { props: ['data'], template: '<pre>{{ JSON.stringify(data) }}</pre>' },
  UTooltip: { template: '<span><slot /></span>' },
  XfLoader: { template: '<span>Loading</span>' },
}

let app: ReturnType<typeof createApp> | null = null
let root: HTMLElement | null = null

afterEach(() => {
  app?.unmount()
  root?.remove()
  app = null
  root = null
  fetchMock.mockClear()
})

describe('MetaCatalogManager', () => {
  it('renders the activation stages and a Business-owned catalog row', async () => {
    root = document.createElement('div')
    document.body.appendChild(root)
    app = createApp({ render: () => h(MetaCatalogManager) })
    Object.entries(stubs).forEach(([name, component]) => app!.component(name, component))
    app.mount(root)

    await Promise.resolve()
    await Promise.resolve()
    await nextTick()

    const text = root.textContent || ''
    expect(text).toContain('01 · Meta connection')
    expect(text).toContain('02 · Business access')
    expect(text).toContain('03 · Catalog ready')
    expect(text).toContain('Meta connection')
    expect(text).toContain('Meta Business')
    expect(text).toContain('Dealer Vehicles')
  })

  it('uses Nuxt UI forms and exact-name deletion instead of browser-native controls', () => {
    const sourcePath = resolve(process.cwd(), 'app/components/dealer-feeds/MetaCatalogManager.vue')
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain('Grant catalog access')
    expect(source).toContain('<UFormField label="Catalog name"')
    expect(source).toContain('deleteConfirmationName.value === selectedCatalog.value.name')
    expect(source).not.toMatch(/\bconfirm\s*\(/)
    expect(source).not.toMatch(/\balert\s*\(/)
    expect(source).not.toMatch(/\bprompt\s*\(/)
    expect(source).not.toMatch(/<(select|input|button)(\s|>)/i)
  })
})
