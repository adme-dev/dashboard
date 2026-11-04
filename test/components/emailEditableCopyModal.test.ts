// @vitest-environment happy-dom
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from '../../app/components/email/builder/EdmEditableCopyModal.vue'

const fetcher = vi.fn()
const created = vi.fn()
const busy = vi.fn()
let cleanup: (() => void) | undefined
const report = {
  width: 600,
  native: 3,
  protected: 1,
  responsivePairs: 1,
  sections: [
    { id: 'cv1-image', kind: 'Image', variant: 'both', label: '1 image: Hero' },
    { id: 'cv2-html', kind: 'Html', variant: 'desktop', label: 'Book now', reason: 'Styled button' }
  ],
  limitations: ['Outlook-only conditional fallbacks are omitted; each section keeps its standard HTML rendering.']
}
const preview = (sourceId = 'source-a', digest = 'a') => ({ html: `<html>copy ${sourceId}</html>`, original_html: '<html>original</html>', report, source_id: sourceId, source_digest: digest.repeat(64) })
const failure = (statusCode: number, outcome?: string, statusMessage = 'refused') => Object.assign(new Error(statusMessage), { statusCode, data: { statusMessage, ...(outcome ? { data: { outcome } } : {}) } })

async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
const state = { open: ref(true), templateId: ref('source-a'), unsaved: ref(false) }
async function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(Modal, {
      'open': state.open.value,
      'onUpdate:open': (value: boolean) => {
        state.open.value = value
      },
      'templateId': state.templateId.value,
      'templateName': 'Ford October',
      'unsavedChanges': state.unsaved.value,
      'onCreated': created,
      'onBusy': busy
    })
  })
  app.component('UModal', { props: ['title', 'description'], template: '<section><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><footer><slot name="footer" /></footer></section>' })
  app.component('UButton', { props: ['label', 'disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UInput', { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
  app.component('UFormField', { props: ['label'], template: '<label :data-label="label"><slot /></label>' })
  app.component('UTabs', { props: ['modelValue', 'items'], emits: ['update:modelValue'], template: '<div><button v-for="item in items" :key="item.value" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>' })
  app.component('UBadge', { props: ['label'], template: '<span class="badge">{{ label }}</span>' })
  app.component('UAlert', { props: ['title', 'description', 'actions'], template: '<div role="alert">{{ title }} {{ description }}<button v-for="action in actions || []" :key="action.label" @click="action.onClick()">{{ action.label }}</button><slot name="description" /></div>' })
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  await flush()
  return host
}
const button = (host: HTMLElement, label: string) => Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === label)
const saves = () => fetcher.mock.calls.filter(call => call[1]?.body?.save === true)

beforeEach(() => {
  vi.clearAllMocks()
  fetcher.mockReset()
  sessionStorage.clear()
  state.open.value = true
  state.templateId.value = 'source-a'
  state.unsaved.value = false
  vi.stubGlobal('$fetch', fetcher)
})
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('editable FigFlow copy review', () => {
  it('previews before writing, shows the report and limits, and keeps the chosen desktop viewport', async () => {
    fetcher.mockResolvedValueOnce(preview())
    const host = await mount()
    expect(fetcher).toHaveBeenCalledWith('/api/email/templates/source-a/editable-copy', { method: 'POST', body: { save: false } })
    expect(host.textContent).toContain('Styled button')
    expect(host.textContent).toContain('Desktop only')
    expect(host.textContent).toContain('Outlook-only conditional fallbacks')
    const frame = host.querySelector('iframe')!
    expect(frame.getAttribute('sandbox')).toBe('')
    // Never clamped to the column: the region scrolls horizontally instead.
    expect(frame.style.width).toBe('640px')
    expect(frame.style.minWidth).toBe('640px')
    expect(frame.getAttribute('style')).not.toContain('max-width')
    expect(host.querySelector('.\\@container')).toBeTruthy()
    button(host, 'Original')!.click()
    await flush()
    expect(host.querySelector('iframe')!.getAttribute('srcdoc')).toBe('<html>original</html>')
  })

  it('creates with the reviewed source digest against the request source and opens a clean workspace', async () => {
    fetcher.mockResolvedValueOnce(preview())
    const host = await mount()
    fetcher.mockResolvedValueOnce({ template: { id: 'copy-id' } })
    button(host, 'Create copy and open in FigFlow')!.click()
    await flush()
    expect(saves()[0][0]).toBe('/api/email/templates/source-a/editable-copy')
    expect(saves()[0][1].body).toMatchObject({ name: 'Ford October (editable)', source_digest: 'a'.repeat(64) })
    expect(created).toHaveBeenCalledWith('copy-id')
    expect(busy.mock.calls.map(call => call[0])).toEqual([true, false])
    expect(sessionStorage.length).toBe(0)
  })

  it('keeps the exact request through lost reply, 409 conflict, 403 and close/unmount; only a receipt resolves it', async () => {
    fetcher.mockResolvedValueOnce(preview())
    let host = await mount()
    fetcher.mockRejectedValueOnce(new Error('response lost'))
    button(host, 'Create copy and open in FigFlow')!.click()
    await flush()
    const original = saves()[0][1].body
    for (const response of [failure(403), failure(500)]) {
      fetcher.mockRejectedValueOnce(response)
      button(host, 'Retry and confirm copy')!.click()
      await flush()
    }
    // Unmount (navigation) and remount with a changed original: the request survives unchanged.
    cleanup!()
    fetcher.mockResolvedValueOnce(preview('source-a', 'b'))
    host = await mount()
    expect(host.textContent).toContain('A previous copy request is unconfirmed.')
    expect((host.querySelector('input') as HTMLInputElement).disabled).toBe(true)
    fetcher.mockRejectedValueOnce(failure(409, 'conflict', 'This request was already used for a different copy.'))
    button(host, 'Retry and confirm copy')!.click()
    await flush()
    expect(host.textContent).toContain('already used for a different copy')
    expect(button(host, 'Retry and confirm copy')!.disabled).toBe(true)
    expect(button(host, 'Create copy and open in FigFlow')).toBeUndefined()
    expect(saves().map(call => call[1].body)).toEqual(Array(4).fill(original))
    expect(created).not.toHaveBeenCalled()
  })

  it('recovers the committed copy on replay; a stale refusal keeps the request because an earlier attempt may still commit', async () => {
    fetcher.mockResolvedValueOnce(preview())
    const host = await mount()
    fetcher.mockRejectedValueOnce(new Error('response lost'))
    button(host, 'Create copy and open in FigFlow')!.click()
    await flush()
    const original = saves()[0][1].body
    for (const response of [failure(404, 'stale', 'The original template is no longer available.'), failure(409, 'stale', 'The original template changed after preview.')]) {
      fetcher.mockRejectedValueOnce(response)
      button(host, 'Retry and confirm copy')!.click()
      await flush()
      expect(button(host, 'Retry and confirm copy')).toBeTruthy()
      expect(sessionStorage.getItem('xeroflow:editable-copy-pending:source-a')).toContain(original.request_key)
    }
    expect(host.textContent).toContain('The original template changed after preview.')
    fetcher.mockResolvedValueOnce({ template: { id: 'committed-copy' }, replayed: true })
    button(host, 'Retry and confirm copy')!.click()
    await flush()
    expect(saves().map(call => call[1].body)).toEqual(Array(4).fill(original))
    expect(created).toHaveBeenCalledWith('committed-copy')
    expect(sessionStorage.length).toBe(0)
  })

  it('settles a late result only for its own source and request, never another source', async () => {
    // Source B already has an unresolved request of its own.
    const pendingB = { sourceId: 'source-b', body: { save: true, request_key: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'B copy', source_digest: 'c'.repeat(64) } }
    sessionStorage.setItem('xeroflow:editable-copy-pending:source-b', JSON.stringify(pendingB))
    const before = sessionStorage.getItem('xeroflow:editable-copy-pending:source-b')
    for (const outcome of ['success', 'failure', 'stale'] as const) {
      sessionStorage.removeItem('xeroflow:editable-copy-pending:source-a')
      state.templateId.value = 'source-a'
      fetcher.mockResolvedValueOnce(preview())
      const host = await mount()
      let settleA!: (value: unknown) => void
      let failA!: (value: unknown) => void
      fetcher.mockImplementationOnce(() => new Promise((resolve, reject) => {
        settleA = resolve
        failA = reject
      }))
      button(host, 'Create copy and open in FigFlow')!.click()
      await flush()
      const keyA = JSON.parse(sessionStorage.getItem('xeroflow:editable-copy-pending:source-a')!).body.request_key
      // Switch to B: B's own pending request is shown.
      fetcher.mockResolvedValueOnce(preview('source-b', 'c'))
      state.templateId.value = 'source-b'
      await flush()
      expect(host.textContent).toContain('A previous copy request is unconfirmed.')
      if (outcome === 'success') settleA({ template: { id: 'copy-A' } })
      else failA(outcome === 'stale' ? failure(409, 'stale') : new Error('lost'))
      await flush()
      // B is untouched, byte for byte, and A's result is not shown in B.
      expect(sessionStorage.getItem('xeroflow:editable-copy-pending:source-b')).toBe(before)
      expect(button(host, 'Retry and confirm copy')).toBeTruthy()
      expect(host.textContent).not.toContain('Editable copy created')
      expect(created).not.toHaveBeenCalled()
      // A settled only its own entry.
      const storedA = sessionStorage.getItem('xeroflow:editable-copy-pending:source-a')
      if (outcome === 'success') expect(storedA).toBeNull()
      else expect(storedA).toContain(keyA)
      // Back to A: its own result or pending request is shown.
      fetcher.mockResolvedValueOnce(preview())
      state.templateId.value = 'source-a'
      await flush()
      if (outcome === 'success') expect(host.textContent).toContain('Editable copy created')
      else expect(host.textContent).toContain('A previous copy request is unconfirmed.')
      cleanup!()
      cleanup = undefined
    }
  })

  it('abandons an unresolved request only by explicit choice', async () => {
    fetcher.mockResolvedValueOnce(preview())
    const host = await mount()
    fetcher.mockRejectedValueOnce(failure(409, 'conflict'))
    button(host, 'Create copy and open in FigFlow')!.click()
    await flush()
    button(host, 'Abandon unconfirmed request')!.click()
    await flush()
    expect(host.textContent).toContain('Check Drafts in the template library')
    expect(button(host, 'Create copy and open in FigFlow')!.disabled).toBe(false)
  })

  it('ignores a stale preview for a previous source and never retargets a pending request', async () => {
    let resolveA!: (value: unknown) => void
    fetcher.mockImplementationOnce(() => new Promise((resolve) => {
      resolveA = resolve
    }))
    const host = await mount()
    fetcher.mockResolvedValueOnce(preview('source-b', 'c'))
    state.templateId.value = 'source-b'
    await flush()
    resolveA(preview('source-a', 'a'))
    await flush()
    expect(host.querySelector('iframe')!.getAttribute('srcdoc')).toBe('<html>copy source-b</html>')
    fetcher.mockRejectedValueOnce(new Error('response lost'))
    button(host, 'Create copy and open in FigFlow')!.click()
    await flush()
    expect(saves()[0][0]).toBe('/api/email/templates/source-b/editable-copy')
    expect(saves()[0][1].body.source_digest).toBe('c'.repeat(64))
    // Switching back to source A shows no pending request for A.
    fetcher.mockResolvedValueOnce(preview('source-a', 'a'))
    state.templateId.value = 'source-a'
    await flush()
    expect(button(host, 'Create copy and open in FigFlow')).toBeTruthy()
    expect(sessionStorage.getItem('xeroflow:editable-copy-pending:source-b')).toContain('c'.repeat(64))
  })

  it('does not navigate over local edits made while the request was in flight', async () => {
    fetcher.mockResolvedValueOnce(preview())
    const host = await mount()
    let resolveSave!: (value: unknown) => void
    fetcher.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    button(host, 'Create copy and open in FigFlow')!.click()
    await flush()
    state.unsaved.value = true
    await flush()
    resolveSave({ template: { id: 'copy-id' } })
    await flush()
    expect(created).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Editable copy created')
    button(host, 'Open copy in FigFlow')!.click()
    expect(created).toHaveBeenCalledWith('copy-id')
  })

  it('blocks creation while the composer has unsaved changes or nothing can become a layer', async () => {
    state.unsaved.value = true
    fetcher.mockResolvedValueOnce(preview())
    let host = await mount()
    expect(host.textContent).toContain('Save the composer first')
    expect(button(host, 'Create copy and open in FigFlow')!.disabled).toBe(true)
    cleanup!()
    state.unsaved.value = false
    fetcher.mockResolvedValueOnce({ ...preview(), report: { ...report, native: 0 } })
    host = await mount()
    expect(host.textContent).toContain('No sections could become FigFlow layers')
    expect(button(host, 'Create copy and open in FigFlow')!.disabled).toBe(true)
    expect(saves()).toHaveLength(0)
  })
})
