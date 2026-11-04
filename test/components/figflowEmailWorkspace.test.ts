// @vitest-environment happy-dom
import { createEmptyDocument } from '../../app/types/edm'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Workspace from '../../app/components/email/workspace/FigflowEmailWorkspace.client.vue'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const routeGuard = vi.hoisted(() => ({ current: null as null | (() => boolean | Promise<boolean>) }))
vi.mock('vue-router', async importOriginal => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, onBeforeRouteLeave: (guard: () => boolean | Promise<boolean>) => { routeGuard.current = guard; actual.onBeforeRouteLeave(guard) } }
})

const TEMPLATE = '10000000-0000-4000-8000-000000000001'
const DOCUMENT = '10000000-0000-4000-8000-000000000002'
const HEAD = '20000000-0000-4000-8000-000000000001'
const NEXT = '20000000-0000-4000-8000-000000000002'
const HANDOFF = '30000000-0000-4000-8000-000000000001'
const CONTINUATION = '30000000-0000-4000-8000-000000000002'
const source = () => validateEmailDesign({ ...structuredDesign(), scope: { clientId: null } })
const draft = (head = HEAD) => ({ state: 'structured' as const, source: source(), documentId: DOCUMENT, templateId: TEMPLATE, headRevisionId: head, projectionRevisionId: head, projection: { state: 'current' as const } })
const handoff = (id = HANDOFF, head = HEAD) => ({ id, draftId: DOCUMENT, templateId: TEMPLATE, baseRevisionId: head, state: 'open' as const, source: source(), proposal: null, proposalRevisionId: null, appliedRevisionId: null, expiresAt: '2026-11-05T00:00:00Z', editorUrl: 'https://creative.xeroflow.io/figflow/0.11.2-edm1/' })
const fetch = vi.fn()
const replace = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
let reviewedDesign = validateEmailDesign(source())
let reviewedChanges = true
let serverDiffers = false
let resumeState = 'open'
let snapshotFails = false
let frameReady = true
let snapshotDirty = false
const flush = async () => {
  for (let n = 0; n < 12; n++) {
    await Promise.resolve()
    await nextTick()
  }
}
function response(url: string, options?: { method?: string, body?: any }) {
  const command = options?.body?.command
  if (url === `/api/email/templates/${TEMPLATE}`) return { template: { id: TEMPLATE, name: 'Saved newsletter', subject: 'Subject', preview_text: 'Preview', body_source: source().blocks, template_kind: 'draft', client_id: null } }
  if (url === '/api/email/templates/render') return { html: '<table><tr><td>Compiled proposal</td></tr></table>' }
  if (url !== '/api/email/design/roundtrip') throw new Error(`Unexpected request: ${url}`)
  if (command === 'lookup') return { draft: draft(options?.body?.expectedRevisionId || (fetch.mock.calls.some(([, call]) => call?.body?.command === 'apply') ? NEXT : HEAD)), designerAuthoring: { available: false } }
  if (command === 'resume') return { handoff: { ...handoff(), state: resumeState, proposal: source(), proposalRevisionId: 'proposal', appliedRevisionId: resumeState === 'applied' ? NEXT : null } }
  if (command === 'cancel') return { handoff: { ...handoff(), state: 'cancelled' } }
  if (command === 'open') return { handoff: handoff(options.body.expectedRevisionId === NEXT ? CONTINUATION : HANDOFF, options.body.expectedRevisionId) }
  if (command === 'propose') {
    const proposal = JSON.parse(JSON.stringify(options.body.action.design))
    if (serverDiffers) proposal.blocks.heading.data.props.text = 'Server-normalized proposal'
    return { handoff: { ...handoff(), state: 'proposed', proposal, proposalRevisionId: '40000000-0000-4000-8000-000000000001' } }
  }
  if (command === 'apply') return { handoff: { ...handoff(), state: 'applied', proposal: options.body.action.proposal ?? source(), proposalRevisionId: '40000000-0000-4000-8000-000000000001', appliedRevisionId: NEXT } }
  throw new Error(`Unexpected design command: ${command}`)
}
async function mount(handler = response, realRouter = false) {
  fetch.mockImplementation(async (url: string, options?: { method?: string, body?: any }) => handler(url, options))
  const host = document.createElement('div')
  document.body.append(host)
  const routeComponent = { render: () => h(Workspace, { templateId: TEMPLATE }) }
  const real = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: routeComponent }, { path: '/away', component: { render: () => h('p', 'Away') } }] })
  const app = createApp(realRouter ? { render: () => h(RouterView) } : routeComponent)
  if (realRouter) { app.use(real); await real.push('/'); await real.isReady() }
  const passthrough = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })
  app.component('UButton', defineComponent({ props: ['label', 'disabled', 'loading'], emits: ['click'], setup: (props, { emit }) => () => h('button', { disabled: props.disabled || props.loading, onClick: () => emit('click') }, props.label) }))
  app.component('UFormField', passthrough)
  app.component('UInput', defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('input', { value: p.modelValue, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }) }))
  app.component('UAlert', defineComponent({ props: ['title', 'description'], setup: props => () => h('div', `${props.title || ''} ${props.description || ''}`) }))
  app.component('USlideover', defineComponent({ props: ['open'], setup: (props, { slots }) => () => props.open ? h('section', [slots.body?.(), slots.footer?.()]) : null }))
  app.component('UModal', defineComponent({ props: ['open'], setup: (p, { slots }) => () => p.open ? h('section', [slots.body?.(), slots.footer?.()]) : null }))
  app.component('UTooltip', passthrough)
  app.component('UIcon', defineComponent({ setup: () => () => h('i') }))
  app.component('EmailBuilderEdmEditableCopyModal', defineComponent({ setup: () => () => null }))
  app.component('EmailBuilderEdmFigflowHandoff', defineComponent({
    props: ['handoff'],
    emits: ['review', 'dirtyChange', 'snapshotFailed'],
    setup(props, { emit, expose }) {
      expose({
        ready: frameReady,
        requestSnapshot: () => {
          if (snapshotFails) { emit('snapshotFailed'); return }
          emit('dirtyChange', reviewedChanges)
          emit('review', reviewedDesign, [], null, reviewedChanges)
        }
      })
      if (snapshotDirty) emit('dirtyChange', true)
      return () => h('div', { 'data-handoff-id': props.handoff.id }, 'Native frame')
    }
  }))
  app.mount(host)
  apps.push(app)
  await flush()
  return { host, real, click: async (label: string, last = false) => {
    const buttons = Array.from(host.querySelectorAll('button')).filter(button => button.textContent === label)
    const button = last ? buttons.at(-1) : buttons[0]
    expect(button, label).toBeDefined()
    button!.click()
    await flush()
  } }
}
beforeEach(() => {
  fetch.mockReset()
  replace.mockReset()
  reviewedDesign = validateEmailDesign(source())
  reviewedDesign.blocks.heading.data.props.text = 'Edited in FigFlow'
  reviewedChanges = true
  serverDiffers = false
  resumeState = 'open'
  snapshotFails = false
  frameReady = true
  snapshotDirty = false
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('useRoute', () => ({ query: {} }))
  vi.stubGlobal('useRouter', () => ({ replace }))
  vi.stubGlobal('navigateTo', vi.fn())
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('FigFlow email workspace save orchestration', () => {
  it('reviews locally, applies an equal server proposal and reopens the same template at the applied head', async () => {
    const { host, click } = await mount()
    expect(fetch.mock.calls.filter(([, options]) => options?.body?.command === 'open')).toHaveLength(1)
    await click('Save draft')
    expect(host.querySelectorAll('iframe')).toHaveLength(2)
    expect(Array.from(host.querySelectorAll('iframe')).some(frame => frame.className.includes('w-[390px]'))).toBe(true)
    expect(fetch.mock.calls.filter(([, options]) => options?.body?.command === 'propose')).toHaveLength(0)
    await click('Save draft', true)
    const calls = fetch.mock.calls.map(([, options]) => options?.body?.command).filter(Boolean)
    expect(calls).toEqual(expect.arrayContaining(['propose', 'apply', 'open']))
    const reopen = fetch.mock.calls.find(([, options]) => options?.body?.command === 'open' && options?.body?.expectedRevisionId === NEXT)
    expect(reopen?.[1].body).toMatchObject({ draftId: DOCUMENT, expectedRevisionId: NEXT })
    expect(reopen?.[1].body).not.toHaveProperty('templateId')
    expect(host.querySelector('[data-handoff-id]')?.getAttribute('data-handoff-id')).toBe(CONTINUATION)
    expect(replace).toHaveBeenCalledWith({ query: { designSession: CONTINUATION, designMode: 'content' } })
    expect(fetch.mock.calls.some(([url]) => url === '/api/email/design/templates')).toBe(false)
    reviewedChanges = false
    await click('Save draft')
    expect(host.textContent).toContain('No changes to save')
    expect(fetch.mock.calls.filter(([, options]) => options?.body?.command === 'propose')).toHaveLength(1)
  })
  it('keeps editing without a proposal or any other write', async () => {
    const { click } = await mount()
    const writesBefore = fetch.mock.calls.filter(([, options]) => ['propose', 'apply'].includes(options?.body?.command)).length
    await click('Save draft')
    await click('Keep editing')
    expect(fetch.mock.calls.filter(([, options]) => ['propose', 'apply'].includes(options?.body?.command))).toHaveLength(writesBefore)
  })
  it('stops before Apply when the server proposal differs and requires a second explicit confirmation', async () => {
    serverDiffers = true
    const { host, click } = await mount()
    await click('Save draft')
    await click('Save draft', true)
    expect(host.textContent).toContain('server proposal differs')
    expect(fetch.mock.calls.filter(([, options]) => options?.body?.command === 'apply')).toHaveLength(0)
    await click('Apply server proposal')
    expect(fetch.mock.calls.filter(([, options]) => options?.body?.command === 'apply')).toHaveLength(1)
    expect(host.querySelector('[data-handoff-id]')?.getAttribute('data-handoff-id')).toBe(CONTINUATION)
  })
  it('resumes a proposal into explicit review without applying and can discard/reopen', async () => {
    resumeState = 'proposed'
    vi.stubGlobal('useRoute', () => ({ query: { designSession: HANDOFF } }))
    const { host, click } = await mount()
    expect(host.textContent).toContain('Apply server proposal')
    expect(fetch.mock.calls.some(([, o]) => o?.body?.command === 'apply')).toBe(false)
    await click('Discard proposal and reopen saved draft')
    expect(fetch.mock.calls.some(([, o]) => o?.body?.command === 'cancel')).toBe(true)
    expect(host.querySelector('[data-handoff-id]')).not.toBeNull()
    await click('Save draft')
    expect(host.textContent).toContain('Compiled from your local snapshot')
  })
  it('offers explicit Apply retry and saved-head reopen after definite CAS refusal', async () => {
    const { host, click } = await mount()
    fetch.mockImplementation(async (url, options) => {
      if (options?.body?.command === 'apply') throw { statusCode: 409, data: { statusMessage: 'REVISION_CONFLICT' } }
      return response(url, options)
    })
    await click('Save draft')
    await click('Save draft', true)
    expect(host.textContent).toContain('Apply server proposal')
    expect(host.textContent).toContain('Reopen saved draft')
    await click('Discard proposal and reopen saved draft')
    await click('Save draft')
    expect(host.textContent).toContain('Compiled from your local snapshot')
  })
  it('settles failed leave snapshots and allows the next navigation attempt', async () => {
    const { click } = await mount()
    snapshotFails = true
    expect(await routeGuard.current!()).toBe(false)
    snapshotFails = false
    reviewedChanges = false
    const next = routeGuard.current!()
    await flush()
    await click('Leave without saving')
    expect(await next).toBe(true)
  })
  it('guards a not-ready dirty frame and open-session unload before a snapshot', async () => {
    frameReady = false
    snapshotDirty = true
    const { click } = await mount()
    const decision = routeGuard.current!()
    await flush()
    await click('Keep editing')
    expect(await decision).toBe(false)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
  it('guards a resumed proposal even when the frame is not ready', async () => {
    resumeState = 'proposed'
    frameReady = false
    vi.stubGlobal('useRoute', () => ({ query: { designSession: HANDOFF } }))
    const { click } = await mount()
    const decision = routeGuard.current!()
    await flush()
    await click('Leave without saving')
    expect(await decision).toBe(true)
  })
  it('replays the exact lost continuation-open payload and clears the old review', async () => {
    const { host, click } = await mount()
    let lost = false
    fetch.mockImplementation(async (url, options) => {
      if (options?.body?.command === 'open' && options.body.expectedRevisionId === NEXT && !lost) { lost = true; throw new Error('lost open') }
      return response(url, options)
    })
    await click('Save draft')
    await click('Save draft', true)
    expect(host.textContent).toContain('Reconcile save')
    await click('Reconcile save')
    const opens = fetch.mock.calls.filter(([, o]) => o?.body?.command === 'open' && o.body.expectedRevisionId === NEXT)
    expect(opens).toHaveLength(2)
    expect(opens[0][1].body).toEqual(opens[1][1].body)
    expect(host.querySelector('[data-handoff-id]')?.getAttribute('data-handoff-id')).toBe(CONTINUATION)
    expect(host.textContent).not.toContain('Review and save draft')
    await click('Save draft')
    expect(host.textContent).toContain('Compiled from your local snapshot')
  })
  it('replays the exact uncertain Apply and never creates another proposal', async () => {
    const { click } = await mount()
    let lost = false
    fetch.mockImplementation(async (url, options) => {
      if (options?.body?.command === 'apply' && !lost) { lost = true; throw new Error('lost apply') }
      return response(url, options)
    })
    await click('Save draft')
    await click('Save draft', true)
    await click('Reconcile save')
    const applies = fetch.mock.calls.filter(([, o]) => o?.body?.command === 'apply')
    expect(applies).toHaveLength(2)
    expect(applies[0][1].body).toEqual(applies[1][1].body)
    expect(fetch.mock.calls.filter(([, o]) => o?.body?.command === 'propose')).toHaveLength(1)
  })

  it('recovers uncertain initial open without issuing another operation identity', async () => {
    let lost = false
    const { host, click } = await mount((url, options) => {
      if (options?.body?.command === 'open' && !lost) { lost = true; throw new Error('lost initial open') }
      return response(url, options)
    })
    expect(host.textContent).toContain('Reconcile save')
    await click('Reconcile save')
    const opens = fetch.mock.calls.filter(([, o]) => o?.body?.command === 'open')
    expect(opens).toHaveLength(2)
    expect(opens[0][1].body).toEqual(opens[1][1].body)
    expect(host.querySelector('[data-handoff-id]')).not.toBeNull()
    await click('Save draft')
    expect(host.textContent).toContain('Compiled from your local snapshot')
  })
  it.each(['expired', 'cancelled'])('offers reopen for a %s resumed handoff', async state => {
    resumeState = state
    vi.stubGlobal('useRoute', () => ({ query: { designSession: HANDOFF } }))
    const { host, click } = await mount()
    expect(host.textContent).toContain('Reopen saved draft')
    await click('Reopen saved draft')
    expect(host.querySelector('[data-handoff-id]')).not.toBeNull()
    expect(fetch.mock.calls.some(([, o]) => o?.body?.command === 'apply')).toBe(false)
  })
  it('continues an applied resumed handoff from its verified head', async () => {
    resumeState = 'applied'
    vi.stubGlobal('useRoute', () => ({ query: { designSession: HANDOFF } }))
    const { host } = await mount((url, options) => options?.body?.command === 'lookup'
      ? { draft: draft(NEXT), designerAuthoring: { available: false } } : response(url, options))
    expect(host.querySelector('[data-handoff-id]')?.getAttribute('data-handoff-id')).toBe(CONTINUATION)
    expect(fetch.mock.calls.some(([, o]) => o?.body?.command === 'apply')).toBe(false)
  })
  it('keeps loading side effects read-only until the template identity is confirmed', async () => {
    let resolveTemplate!: (value: any) => void
    const waiting = new Promise(resolve => { resolveTemplate = resolve })
    const { host } = await mount((url, options) => url === `/api/email/templates/${TEMPLATE}` ? waiting : response(url, options))
    expect(host.textContent).toContain('Opening the saved email design')
    expect(fetch).toHaveBeenCalledTimes(1)
    resolveTemplate({ template: { id: 'wrong-template' } })
    await flush()
    expect(host.textContent).toContain('identity does not match')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refuses metadata writes while the native snapshot has edits, then saves and reopens without a copy', async () => {
    const { host, click } = await mount()
    await click('Email details')
    const inputs = host.querySelectorAll('input')
    inputs[0].value = 'Updated subject'
    inputs[0].dispatchEvent(new Event('input'))
    await click('Save email details')
    expect(host.textContent).toContain('Save or undo native edits')
    expect(fetch.mock.calls.some(([url]) => url.endsWith('/metadata'))).toBe(false)
    expect(inputs[0].value).toBe('Updated subject')
    reviewedChanges = false
    fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/metadata')) return { revisionId: NEXT }
      if (options?.body?.command === 'lookup') return { draft: draft(NEXT), designerAuthoring: { available: false } }
      return response(url, options)
    })
    await click('Save email details')
    const metadata = fetch.mock.calls.find(([url]) => url.endsWith('/metadata'))!
    expect(metadata[1].body).toMatchObject({ subject: 'Updated subject', previewText: 'Preview', expectedRevisionId: HEAD })
    expect(host.querySelector('[data-handoff-id]')?.getAttribute('data-handoff-id')).toBe(CONTINUATION)
    expect(fetch.mock.calls.some(([url]) => url === '/api/email/design/templates' || url === '/api/email/templates')).toBe(false)
  })

  it('cancels failed leave through the installed router and permits explicit discard on the next attempt', async () => {
    const { real, click } = await mount(response, true)
    snapshotFails = true
    await real.push('/away')
    expect(real.currentRoute.value.path).toBe('/')
    const navigation = real.push('/away')
    await flush()
    await click('Leave without saving')
    await navigation
    expect(real.currentRoute.value.path).toBe('/away')
  })

  it.each([true, false])('starts only an exact raw blank with server designer admission (blank=%s)', async blank => {
    const body = createEmptyDocument()
    if (!blank) body.root.data.props!.canvasColor = '#000000'
    let started = false
    const { host } = await mount((url, options) => {
      if (url === `/api/email/templates/${TEMPLATE}`) return { template: { id: TEMPLATE, name: 'Blank', body_source: body, template_kind: 'draft', client_id: null } }
      if (options?.body?.command === 'lookup') return { draft: started ? draft() : null, designerAuthoring: { available: true, endpoint: '/api/email/design/designer', capabilities: null } }
      if (url === '/api/email/design/designer' && options?.body?.command === 'start') { started = true; return { handoff: handoff() } }
      return response(url, options)
    })
    expect(started).toBe(blank)
    if (!blank) expect(host.textContent).toContain('needs the staff composer')
    expect(fetch.mock.calls.some(([url]) => url === '/api/email/templates' || url === '/api/email/design/templates')).toBe(false)
  })

  it('reconciles the exact uncertain metadata payload before reopening', async () => {
    const { host, click } = await mount()
    reviewedChanges = false
    let lost = false
    fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/metadata')) {
        if (!lost) { lost = true; throw new Error('lost metadata') }
        return { revisionId: NEXT }
      }
      if (options?.body?.command === 'lookup') return { draft: draft(NEXT), designerAuthoring: { available: false } }
      return response(url, options)
    })
    await click('Email details')
    await click('Save email details')
    await click('Reconcile save')
    const writes = fetch.mock.calls.filter(([url]) => url.endsWith('/metadata'))
    expect(writes).toHaveLength(2)
    expect(writes[0][1].body).toEqual(writes[1][1].body)
    expect(host.querySelector('[data-handoff-id]')?.getAttribute('data-handoff-id')).toBe(CONTINUATION)
  })

  it('does not open a handoff when the template read resolves after unmount', async () => {
    let resolveTemplate!: (value: any) => void
    const waiting = new Promise(resolve => { resolveTemplate = resolve })
    await mount((url, options) => url === `/api/email/templates/${TEMPLATE}` ? waiting : response(url, options))
    expect(await routeGuard.current!()).toBe(false)
    apps.pop()!.unmount()
    resolveTemplate(response(`/api/email/templates/${TEMPLATE}`))
    await flush()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

})
