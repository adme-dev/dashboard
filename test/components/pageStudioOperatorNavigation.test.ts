// @vitest-environment happy-dom
import { computed, readonly, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TransferPage from '~~/app/pages/agency/page-studio/transfer-requests.vue'
import PlansPage from '~~/app/pages/agency/page-studio/customer-plans.vue'
import Queue from '~~/app/components/page-studio/TransferRequests.client.vue'
import Plans from '~~/app/components/page-studio/CustomerPlans.client.vue'
import { useAuth } from '~~/app/composables/useAuth'
import { button, cleanup, control, deferred, mount, siteId } from './pageStudioTransferTestSupport'

vi.stubGlobal('defineNuxtRouteMiddleware', <T>(handler: T) => handler)
const { default: globalAuth } = await import('../../app/middleware/auth.global')
const { default: namedAuth } = await import('../../app/middleware/auth')

const fetch = vi.fn(), navigate = vi.fn(), defineMeta = vi.fn()
const states = new Map<string, ReturnType<typeof ref>>()
const pages = [
  {
    path: '/agency/page-studio/transfer-requests',
    page: TransferPage,
    childName: 'PageStudioTransferRequests',
    child: Queue,
    action: 'Open request',
    response: { requests: [control()], nextCursor: null }
  },
  {
    path: '/agency/page-studio/customer-plans',
    page: PlansPage,
    childName: 'PageStudioCustomerPlans',
    child: Plans,
    action: 'Set publishing plan',
    response: {
      targets: [{ workspaceId: 'workspace', entitlementId: 'entitlement', workspaceName: 'Flowers', siteId,
        siteName: 'Flowers website', eligible: true, status: 'trial', planKey: 'customer_preview_v1',
        effectiveUntil: null, limits: { pagesPerSiteLimit: 5, domainLimit: 0, buildLimit: 10 } }],
      nextCursor: null
    }
  }
]

beforeEach(() => {
  vi.resetAllMocks()
  states.clear()
  localStorage.clear()
  navigate.mockImplementation(destination => ({ redirected: destination }))
  for (const [name, value] of Object.entries({
    computed, readonly, useAuth, definePageMeta: defineMeta, $fetch: fetch, navigateTo: navigate,
    useRouter: () => ({}), useToast: () => ({ add: vi.fn() }),
    useCookie: (key: string) => ref(key === 'auth_token' ? 'test-session-cookie' : null),
    useState: (key: string, init: () => unknown) => {
      if (!states.has(key)) states.set(key, ref(init()))
      return states.get(key)
    }
  })) vi.stubGlobal(name, value)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe.each(pages)('$path cold authenticated navigation', (route) => {
  // Read the actual compiled wrapper's metadata without mounting its operator
  // child. Then model Nuxt's global -> named middleware -> page render order.
  async function navigateFromColdState() {
    await mount(route.page, {}, { [route.childName]: { template: '<div />' } })
    const metadata = defineMeta.mock.calls.at(-1)![0]
    cleanup()
    const to = { path: route.path, fullPath: `${route.path}?from=bookmark` }
    if (await globalAuth(to as never, {} as never)) return null
    const middleware = { auth: namedAuth }
    for (const name of metadata.middleware ?? []) {
      const guard = middleware[name as keyof typeof middleware]
      if (!guard) throw new Error(`Unknown middleware: ${name}`)
      if (await guard(to as never, {} as never)) return null
    }
    return mount(route.page, {}, {
      [route.childName]: route.child,
      PageStudioTransferRequestDetail: { template: '<div />' },
      PageStudioCustomerPlanGrant: { template: '<div />' },
      USkeleton: { template: '<div />' }
    })
  }

  it.each(['owner', 'admin'])('awaits the current %s before rendering actionable data', async (role) => {
    const identity = deferred()
    fetch.mockImplementation(url => url === '/api/auth/me' ? identity.promise : Promise.resolve(route.response))
    expect(useAuth().user.value).toBeNull()
    const navigation = navigateFromColdState()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/auth/me', {
      headers: { Authorization: 'Bearer test-session-cookie' }
    }))
    expect(document.querySelector('main')).toBeNull()
    identity.resolve({ user: { id: 'operator', role, custom_role_id: 'assigned-system-role' } })
    const host = await navigation
    expect(host).not.toBeNull()
    expect(host!.textContent).not.toContain('Platform administrator access required')
    expect(button(host!, route.action)).toBeDefined()
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/auth/me', `/api${route.path}`])
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })

  it('keeps authenticated non-operators behind the component permission gate', async () => {
    fetch.mockResolvedValue({ user: { id: 'staff', role: 'member' } })
    const host = await navigateFromColdState()
    expect(host!.textContent).toContain('Platform administrator access required')
    expect(button(host!, route.action)).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('/api/auth/me')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('redirects an expired cookie session before mounting the operator page', async () => {
    fetch.mockRejectedValue({ statusCode: 401 })
    expect(await navigateFromColdState()).toBeNull()
    expect(navigate).toHaveBeenCalledExactlyOnceWith({
      path: '/auth/login', query: { redirect: `${route.path}?from=bookmark` }
    })
    expect(document.querySelector('main')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('offers no action when the list endpoint denies a loaded owner candidate', async () => {
    fetch.mockImplementation(url => url === '/api/auth/me'
      ? Promise.resolve({ user: { id: 'operator', role: 'owner' } })
      : Promise.reject({ statusCode: 403 }))
    const host = await navigateFromColdState()
    expect(button(host!, route.action)).toBeUndefined()
    expect(host!.textContent).toContain('could not be loaded')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
