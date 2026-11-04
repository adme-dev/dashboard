// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Handoff from '../../app/components/email/builder/EdmFigflowHandoff.client.vue'
import { designerCapabilities } from '../../shared/emailRendering/designDesigner'
import { FIGFLOW_EDM_ORIGIN } from '../../shared/emailRendering/designRoundtrip'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'
import { structuredDesign } from '../fixtures/email-design/structured'

const op = '50000000-0000-4000-8000-000000000001'
let dispose: (() => void) | undefined
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
async function mount() {
  const source = validateEmailDesign(structuredDesign()), requested = vi.fn(), proposed = vi.fn(), applied = vi.fn()
  vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ html: '<p>Compiled current design</p>' }))
  const host = document.createElement('div')
  const app = createApp({ render: () => h(Handoff, {
    handoff: { id: op, draftId: op, templateId: op, baseRevisionId: op, state: 'open', source, proposal: null, proposalRevisionId: null, appliedRevisionId: null, expiresAt: '2026-11-02T00:00:00Z', editorUrl: `${FIGFLOW_EDM_ORIGIN}/figflow/0.11.2-edm1/` },
    busy: false, mode: 'designer', capabilities: designerCapabilities(source), operationId: op, libraryAvailable: true, libraryPublisher: true,
    onLibraryRequest: requested, onProposeDesigner: proposed, onApply: applied
  }) })
  app.component('UButton', { props: ['label', 'disabled'], template: '<button :disabled="disabled">{{label}}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<div role="alert">{{title}} {{description}}</div>' })
  app.mount(host)
  dispose = () => app.unmount()
  const frame = host.querySelector('iframe')!, send = vi.fn(), remote = { postMessage: send }
  Object.defineProperty(frame, 'contentWindow', { value: remote })
  frame.dispatchEvent(new Event('load'))
  await flush()
  const reply = async (type: string, payload?: unknown, override = {}) => {
    window.dispatchEvent(new MessageEvent('message', { origin: FIGFLOW_EDM_ORIGIN, source: remote as unknown as Window, data: { ...send.mock.calls.at(-1)![0], type, payload, ...override } }))
    await flush()
  }
  await reply('ready')
  const click = async (label: string) => {
    const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent === label)!
    expect(button).toBeTruthy()
    button.click()
    await flush()
  }
  return { host, frame, send, reply, click, requested, proposed, applied, source }
}
describe('native library frame and explicit save boundary', () => {
  it('captures exact context, freezes canvas, previews and cancels with no mutation or iframe replacement', async () => {
    const f = await mount()
    await f.click('Library')
    expect(f.send.mock.calls.at(-1)![0].type).toBe('context')
    expect(f.frame.parentElement!.hasAttribute('inert')).toBe(true)
    await f.reply('context', { operationId: op, operations: [], selectedBlockIds: ['heading'], insertionTarget: { parentId: 'root', index: 1 } })
    expect(f.host.querySelector('iframe[title="Captured email preview"]')?.getAttribute('sandbox')).toBe('')
    expect(f.requested).not.toHaveBeenCalled()
    expect(f.proposed).not.toHaveBeenCalled()
    await f.click('Continue editing')
    expect(f.host.querySelector('iframe[title="FigFlow email design"]')).toBe(f.frame)
    expect(f.frame.parentElement!.hasAttribute('inert')).toBe(false)
    expect(f.requested).not.toHaveBeenCalled()
  })
  it('requires compiled review and an explicit click before requesting saved library work', async () => {
    const f = await mount(), operations = [{ op: 'set-style', blockId: 'heading', style: { fontSize: 28 } }]
    await f.click('Save selected section')
    await f.reply('context', { operationId: op, operations, selectedBlockIds: ['heading'] })
    expect(f.requested).not.toHaveBeenCalled()
    await f.click('Review and save for library')
    expect(f.requested).toHaveBeenCalledWith({ operationId: op, operations, selectedBlockIds: ['heading'] }, 'section')
    expect(f.applied).not.toHaveBeenCalled()
  })
  it('refuses unmapped/null targets and stale channels without a library request', async () => {
    const f = await mount()
    await f.click('Images')
    await f.reply('context', { operationId: op, operations: [], selectedBlockIds: ['heading'] }, { channel: 'stale' })
    expect(f.host.querySelector('iframe[title="Captured email preview"]')).toBeNull()
    await f.reply('context', { operationId: op, operations: [], selectedBlockIds: ['missing'], insertionTarget: { parentId: 'root', index: 0, columnIndex: null } })
    expect(f.host.textContent).toContain('Choose a mapped email section')
    expect(f.requested).not.toHaveBeenCalled()
    expect(f.frame.parentElement!.hasAttribute('inert')).toBe(false)
  })
})
