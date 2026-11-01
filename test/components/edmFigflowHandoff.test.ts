// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Panel from '../../app/components/email/builder/EdmFigflowHandoff.client.vue'
import { composerToDesignDraft } from '../../shared/emailRendering/designComposer'
import { FIGFLOW_EDM_ORIGIN } from '../../shared/emailRendering/designRoundtrip'
import { structuredDesign } from '../fixtures/email-design/structured'

let dispose: (() => void) | undefined
const flush = async () => { for (let i = 0; i < 5; i++) { await Promise.resolve(); await nextTick() } }
afterEach(() => { dispose?.(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function mount(review = false) {
  const source = composerToDesignDraft(structuredDesign().blocks, structuredDesign().scope.clientId)
  const proposed = vi.fn()
  const applied = vi.fn()
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Panel, {
    handoff: { id: '10000000-0000-4000-8000-000000000001', draftId: '10000000-0000-4000-8000-000000000002', templateId: '10000000-0000-4000-8000-000000000003', baseRevisionId: '10000000-0000-4000-8000-000000000004', state: review ? 'proposed' : 'open', expiresAt: '2026-11-02T00:00:00Z', source, proposal: review ? source : null, proposalRevisionId: review ? '10000000-0000-4000-8000-000000000005' : null, appliedRevisionId: null, editorUrl: `${FIGFLOW_EDM_ORIGIN}/figflow/0.11.2-edm1/` },
    busy: false, onPropose: proposed, onApply: applied
  }) })
  app.component('UButton', { props: ['label', 'disabled', 'loading'], template: '<button :disabled="disabled || loading">{{ label }}</button>' })
  app.component('UAlert', { props: ['title'], template: '<div role="alert">{{ title }}</div>' })
  app.mount(host)
  dispose = () => app.unmount()
  if (review) { await flush(); return { host, applied } }
  const iframe = host.querySelector('iframe')!
  const send = vi.fn()
  const remote = { postMessage: send }
  Object.defineProperty(iframe, 'contentWindow', { value: remote, configurable: true })
  iframe.dispatchEvent(new Event('load'))
  await flush()
  const connect = send.mock.calls[0][0]
  const reply = async (data: any, origin = FIGFLOW_EDM_ORIGIN, sourceWindow: any = remote) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: sourceWindow }))
    await flush()
  }
  return { source, proposed, host, send, connect, reply, remote }
}

describe('FigFlow frame return boundary', () => {
  it('requires a rendered preview and an explicit click before applying a durable proposal', async () => {
    let complete!: (value: { html: string }) => void
    vi.stubGlobal('$fetch', vi.fn(() => new Promise(resolve => { complete = resolve })))
    const { host, applied } = await mount(true)
    const applyButton = () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Apply and save changes')!
    expect(applyButton().disabled).toBe(true)
    expect(applied).not.toHaveBeenCalled()
    complete({ html: '<p>Canonical preview</p>' })
    await flush()
    expect(host.querySelector('iframe')!.getAttribute('sandbox')).toBe('')
    expect(host.querySelector('iframe')!.getAttribute('srcdoc')).toContain('Canonical preview')
    expect(applyButton().disabled).toBe(false)
    expect(applied).not.toHaveBeenCalled()
    applyButton().click()
    expect(applied).toHaveBeenCalledOnce()
  })

  it('ignores another origin, window, channel and stale request before accepting readiness', async () => {
    const { host, connect, reply } = await mount()
    const button = host.querySelector('button')!
    expect(button.disabled).toBe(true)
    await reply({ ...connect, type: 'ready' }, 'https://attacker.example')
    await reply({ ...connect, type: 'ready' }, FIGFLOW_EDM_ORIGIN, window)
    await reply({ ...connect, channel: 'wrong', type: 'ready' })
    await reply({ ...connect, requestId: 'wrong', type: 'ready' })
    expect(button.disabled).toBe(true)
    await reply({ ...connect, type: 'ready' })
    expect(button.disabled).toBe(false)
  })
  it('returns only a validated content proposal and refuses structure changes from the real frame identity', async () => {
    const { source, host, connect, reply, send, proposed } = await mount()
    await reply({ ...connect, type: 'ready' })
    host.querySelector('button')!.click()
    await flush()
    const request = send.mock.calls.at(-1)![0]
    const invalid = JSON.parse(JSON.stringify(source))
    invalid.blocks.root.data.childrenIds.reverse()
    await reply({ ...request, type: 'snapshot', payload: invalid })
    expect(proposed).not.toHaveBeenCalled()
    expect(host.textContent).toContain('cannot preserve')
    host.querySelector('button')!.click()
    await flush()
    const valid = JSON.parse(JSON.stringify(source))
    valid.blocks.heading.data.props.text = 'Updated in FigFlow'
    await reply({ ...send.mock.calls.at(-1)![0], type: 'snapshot', payload: valid })
    expect(proposed).toHaveBeenCalledOnce()
    expect(proposed.mock.calls[0][0].blocks.heading.data.props.text).toBe('Updated in FigFlow')
    expect(send.mock.calls.every(call => call[1] === FIGFLOW_EDM_ORIGIN)).toBe(true)
  })
})
