// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Panel from '../../app/components/email/builder/EdmFigflowHandoff.client.vue'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { FIGFLOW_EDM_ORIGIN } from '../../shared/emailRendering/designRoundtrip'
import { structuredDesign } from '../fixtures/email-design/structured'

const apps: ReturnType<typeof createApp>[] = []
const flush = async () => {
  for (let n = 0; n < 6; n++) {
    await Promise.resolve()
    await nextTick()
  }
}
async function mount() {
  const source = composerToDesignDraft(structuredDesign().blocks, structuredDesign().scope.clientId)
  source.blocks.protected = { type: 'Html', data: { props: { contents: '<table><tr><td>Protected section</td></tr></table>' } } }
  source.blocks.root.data.childrenIds!.push('protected')
  const host = document.createElement('div')
  document.body.append(host)
  const panel = ref<any>(null)
  const failed = vi.fn()
  const app = createApp({ render: () => h(Panel, {
    ref: panel, onSnapshotFailed: failed,
    presentation: 'workspace',
    handoff: { id: '10000000-0000-4000-8000-000000000001', draftId: '10000000-0000-4000-8000-000000000002', templateId: '10000000-0000-4000-8000-000000000003', baseRevisionId: '10000000-0000-4000-8000-000000000004', state: 'open', expiresAt: '2026-11-05T00:00:00Z', source, proposal: null, proposalRevisionId: null, appliedRevisionId: null, editorUrl: `${FIGFLOW_EDM_ORIGIN}/figflow/0.11.2-edm1/` },
    busy: false,
    mode: 'content'
  }) })
  app.component('UButton', defineComponent({ props: ['label'], emits: ['click'], setup: (props, { emit }) => () => h('button', { onClick: () => emit('click') }, props.label) }))
  app.component('UAlert', defineComponent({ props: ['title'], setup: props => () => h('div', { role: 'alert' }, props.title) }))
  app.mount(host)
  apps.push(app)
  await flush()
  const native = host.querySelector('iframe[title="FigFlow email design"]')!
  const send = vi.fn()
  const remote = { postMessage: send }
  Object.defineProperty(native, 'contentWindow', { value: remote, configurable: true })
  return { host, native, send, remote, panel, failed }
}
async function reply(remote: unknown, message: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data: message, origin: FIGFLOW_EDM_ORIGIN, source: remote as MessageEventSource }))
  await flush()
}
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('FigFlow workspace frame host', () => {
  it('renders protected saved source beside native output with a real 390px mobile frame', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ html: '<table><tr><td>Saved source</td></tr></table>' }))
    const { host } = await mount()
    const saved = host.querySelector('iframe[title="Saved compiled email output"]')!
    expect(saved.getAttribute('srcdoc')).toContain('Saved source')
    expect(host.textContent).toContain('Saved source — native edits appear only after Save draft')
    Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Mobile')!.click()
    await flush()
    expect(saved.getAttribute('style')).toContain('width: 390px')
    expect($fetch).toHaveBeenCalledWith('/api/email/templates/render', expect.objectContaining({ method: 'POST' }))
  })
  it('defers connect while hidden and sends it when the tab becomes visible', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ html: '<p>Saved</p>' }))
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    const { host, native, send } = await mount()
    native.dispatchEvent(new Event('load'))
    await flush()
    expect(send).not.toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(send).toHaveBeenCalledOnce()
    expect(host.textContent).not.toContain('still loading')
  })
  it('retries only the identical connect payload after a bridge-ready timeout', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ html: '<p>Saved</p>' }))
    const { native, send, remote } = await mount()
    native.dispatchEvent(new Event('load'))
    await flush()
    const first = send.mock.calls[0][0]
    await reply(remote, { ...first, type: 'error', payload: { code: 'timeout' } })
    expect(send).toHaveBeenCalledTimes(2)
    const retry = send.mock.calls[1][0]
    expect(retry.payload).toEqual(first.payload)
    expect(retry.payload.handoffId).toBe(first.payload.handoffId)
    await reply(remote, { ...retry, type: 'ready' })
    expect(document.body.textContent).not.toContain('still loading')
  })
  it('keeps image failures specific and does not retry them as connects', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ html: '<p>Saved</p>' }))
    const { host, native, send, remote } = await mount()
    native.dispatchEvent(new Event('load'))
    await flush()
    const first = send.mock.calls[0][0]
    await reply(remote, { ...first, type: 'error', payload: { code: 'image_fetch_failed' } })
    expect(send).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('could not load an email image')
    expect(host.textContent).toContain('saved draft is unchanged')
  })
  it.each(['refused', 'invalid', 'timeout'])('settles snapshot %s through the workspace failure event', async failure => {
    vi.useFakeTimers()
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ html: '<p>Saved</p>' }))
    const { native, send, remote, panel, failed } = await mount()
    native.dispatchEvent(new Event('load'))
    await flush()
    await reply(remote, { ...send.mock.calls[0][0], type: 'ready' })
    panel.value.requestSnapshot()
    const request = send.mock.calls.at(-1)![0]
    if (failure === 'timeout') await vi.advanceTimersByTimeAsync(15_000)
    else await reply(remote, { ...request, type: failure === 'refused' ? 'error' : 'snapshot', payload: failure === 'refused' ? { code: 'native_refused' } : { invalid: true } })
    expect(failed).toHaveBeenCalledOnce()
  })

})
