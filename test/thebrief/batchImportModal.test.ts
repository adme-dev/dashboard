// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, defineComponent, h, nextTick, reactive, ref, shallowRef, toRaw, watch, type App } from 'vue'
import type { TheBriefImportRow } from '../../app/utils/thebrief-import-batch'

const api = vi.fn()
const readBatch = vi.fn()
vi.mock('~/utils/thebrief-import-batch', async importOriginal => ({ ...await importOriginal<object>(), readImportBatch: (...args: unknown[]) => readBatch(...args) }))
let app: App | undefined, host: HTMLDivElement
const clientId = '11111111-1111-4111-8111-111111111111'
const stubs = {
  UModal: defineComponent({ props: ['open', 'title'], setup: (p, { slots }) => () => p.open ? h('section', { 'aria-label': p.title }, [slots.body?.(), slots.footer?.()]) : null }),
  UFormField: defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
  UPopover: defineComponent({ setup: (_, { slots }) => () => h('div', [slots.default?.(), slots.content?.()]) }),
  UCalendar: defineComponent({ setup: () => () => h('div') }),
  UFileUpload: defineComponent({ props: ['disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('button', { disabled: p.disabled, onClick: () => emit('update:modelValue', [new File(['{}'], 'prepared.json')]) }, 'Load packages') }),
  USelectMenu: defineComponent({ props: ['modelValue'], setup: p => () => h('span', String(p.modelValue)) }),
  UBadge: defineComponent({ setup: (_, { slots }) => () => h('span', { 'data-badge': '' }, slots.default?.()) }),
  UAlert: defineComponent({ props: ['title', 'description'], setup: (p, { slots }) => () => h('div', [h('p', `${p.title}: ${p.description}`), slots.actions?.()]) }),
  UCheckbox: defineComponent({ props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], setup: (p, { emit }) => () => h('button', { disabled: p.disabled, onClick: () => emit('update:modelValue', !p.modelValue) }, p.label) }),
  UButton: defineComponent({ props: ['disabled', 'loading', 'to'], emits: ['click'], setup: (p, { slots, emit }) => () => h('button', { 'disabled': p.disabled || p.loading, 'data-to': p.to, 'onClick': () => emit('click') }, slots.default?.()) })
}

function row(name: string, hashChar: string, overrides: Partial<TheBriefImportRow> = {}): TheBriefImportRow {
  return {
    file: new File(['{}'], `${name}.json`),
    pkg: {
      kind: 'xeroflow-thebrief-import', version: 1, name,
      source: { designHash: name.toLowerCase(), sha256: hashChar.repeat(64), folder: 'Updates', duration: 4, loopCount: 0 },
      canvasData: { custom_300x250: { layers: [{ id: 1, type: 'text', name: 'Title', text: name, x: 0, y: 0, w: 300, h: 50, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4 }] } },
      warnings: [], assets: [], fonts: []
    } as TheBriefImportRow['pkg'],
    clientId, folderId: '__unfiled__', sourceCreatedDate: '2021-03-04',
    ...overrides
  }
}

// A minimal banner library: POST deduplicates by client + checksum, as the server does.
let library: Array<{ id: string, clientId: string, folderId: null, canvasData: unknown, tags: string[] }>
let failNext: Map<string, 'before-commit' | 'after-commit'>
let posts: Array<{ name: string, key: string }>
function serve(url: string, options?: { method?: string, headers?: Record<string, string>, body?: { name: string, clientId: string, canvasData: unknown, tags: string[] } }) {
  if (url.endsWith('/clients')) return [{ id: clientId, name: 'Blood Motor Group' }]
  if (url.endsWith('/folders')) return []
  if (url.endsWith('/projects') && options?.method === 'POST') {
    const body = options.body!
    posts.push({ name: body.name, key: options.headers!['Idempotency-Key']! })
    const failure = failNext.get(body.name)
    failNext.delete(body.name)
    if (failure === 'before-commit') throw Object.assign(new Error('Server unavailable'), { statusCode: 503 })
    const sha = body.tags.find(tag => tag.startsWith('source-sha256:'))
    const existing = library.find(project => project.clientId === body.clientId && project.tags.includes(sha!))
    if (existing) return { ...existing, importOutcome: 'existing' }
    const created = { id: `project-${library.length + 1}`, clientId: body.clientId, folderId: null, canvasData: structuredClone(body.canvasData), tags: body.tags }
    library.push(created)
    if (failure === 'after-commit') throw new TypeError('Connection reset')
    return { ...created, importOutcome: 'created' }
  }
  if (url.endsWith('/projects')) return structuredClone(library)
  const project = library.find(candidate => url.endsWith(`/projects/${candidate.id}`))
  if (project) return structuredClone(project)
  throw new Error(`Unexpected request ${url}`)
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
  }
}
const buttons = (label: string | RegExp) => [...host.querySelectorAll('button')].filter(el => typeof label === 'string' ? el.textContent?.trim() === label : label.test(el.textContent?.trim() || ''))
const importButton = () => buttons(/^Import (\d+ )?ready/)[0]!
const sections = () => [...host.querySelectorAll('section section')]
const sectionFor = (name: string) => sections().find(el => el.querySelector('h3')?.textContent?.trim() === name)!
const badges = (el: Element) => [...el.querySelectorAll('[data-badge]')].map(badge => badge.textContent?.trim())

async function mountModal(rows: TheBriefImportRow[]) {
  readBatch.mockImplementation(async () => rows)
  for (const [name, value] of Object.entries({ ref, shallowRef, computed, watch, toRaw, $fetch: api })) vi.stubGlobal(name, value)
  vi.stubGlobal('useBannerFonts', () => ({ uploadCustomFont: vi.fn(), refreshCustomFonts: vi.fn(async () => []) }))
  const { default: Modal } = await import('../../app/components/banner/TheBriefImportModal.client.vue')
  const props = reactive({ open: false })
  app = createApp({ render: () => h(Modal, { ...props }) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub)
  host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  props.open = true
  await flush()
  buttons('Load packages')[0]!.click()
  await flush()
}

beforeEach(() => {
  library = []
  failNext = new Map()
  posts = []
  localStorage.clear()
  readBatch.mockReset()
  api.mockReset().mockImplementation(async (url: string, options?: never) => serve(url, options))
})
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
})

describe('TheBrief batch import', () => {
  it('imports only the valid packages of a mixed selection', async () => {
    await mountModal([
      row('Ready', 'a'),
      { file: new File(['broken'], 'broken.json'), invalidReason: 'Not a readable JSON package', clientId: '__unassigned__', folderId: '__unfiled__', sourceCreatedDate: '' },
      row('Unassigned', 'b', { clientId: '__unassigned__' }),
      row('Undated', 'c', { sourceCreatedDate: '' })
    ])
    expect(badges(sectionFor('broken.json'))).toContain('Invalid')
    expect(sectionFor('broken.json').textContent).toContain('Not a readable JSON package')
    expect(badges(sectionFor('Unassigned'))).toContain('Needs attention')
    expect(sectionFor('Unassigned').textContent).toContain('Choose the client')
    expect(sectionFor('Undated').textContent).toContain('Verify the original creation date')
    expect(importButton().textContent).toContain('Import 1 ready draft')

    importButton().click()
    await flush()
    expect(posts.map(post => post.name)).toEqual(['Ready'])
    expect(badges(sectionFor('Ready'))).toContain('Saved')
    expect(sectionFor('Ready').querySelector('[data-to="/agency/banner-studio/project-1"]')).not.toBeNull()
    const summary = host.querySelector('[aria-label="Batch summary"]')!.textContent
    expect(summary).toContain('Saved: 1')
    expect(summary).toContain('Needs attention: 2')
    expect(summary).toContain('Invalid: 1')
  })

  it('marks a mid-batch failure and continues with the remaining designs', async () => {
    failNext.set('Second', 'before-commit')
    await mountModal([row('First', 'a'), row('Second', 'b'), row('Third', 'c')])
    importButton().click()
    await flush()
    expect(posts.map(post => post.name)).toEqual(['First', 'Second', 'Third'])
    expect(badges(sectionFor('First'))).toContain('Saved')
    expect(badges(sectionFor('Second'))).toContain('Failed')
    expect(sectionFor('Second').textContent).toContain('Server unavailable')
    expect(badges(sectionFor('Third'))).toContain('Saved')
    expect(host.querySelector('[aria-label="Batch summary"]')!.textContent).toMatch(/Saved: 2.*Failed: 1/)

    expect(sectionFor('Second').querySelector('button[data-to]')).toBeNull()
    const retry = [...sectionFor('Second').querySelectorAll('button')].find(el => el.textContent?.trim() === 'Retry')!
    retry.click()
    await flush()
    expect(badges(sectionFor('Second'))).toContain('Saved')
    expect(library).toHaveLength(3)
  })

  it('retries idempotently after a lost response and keeps the saved draft', async () => {
    failNext.set('First', 'after-commit')
    await mountModal([row('First', 'a')])
    importButton().click()
    await flush()
    expect(badges(sectionFor('First'))).toContain('Failed')
    expect(library).toHaveLength(1)
    library[0]!.canvasData = { edited: true }

    const retry = [...sectionFor('First').querySelectorAll('button')].find(el => el.textContent?.trim() === 'Retry')!
    retry.click()
    await flush()
    expect(posts).toHaveLength(2)
    // A fresh key per attempt: the server resolves the retry by source identity, not by key replay.
    expect(posts[0]!.key).not.toBe(posts[1]!.key)
    expect(library).toHaveLength(1)
    expect(library[0]!.canvasData).toEqual({ edited: true })
    expect(badges(sectionFor('First'))).toContain('Saved')
    expect(sectionFor('First').textContent).toContain('existing draft kept')
  })

  it('ignores a double submit while a batch is importing', async () => {
    await mountModal([row('First', 'a'), row('Second', 'b')])
    importButton().click()
    importButton().click()
    await flush()
    importButton()?.click()
    await flush()
    expect(posts.map(post => post.name)).toEqual(['First', 'Second'])
    expect(library).toHaveLength(2)
  })

  it('restores progress from the library when the same batch is selected again', async () => {
    library.push({ id: 'project-1', clientId, folderId: null, canvasData: {}, tags: ['source:thebrief', `source-sha256:${'a'.repeat(64)}`, 'source-design:first'] })
    await mountModal([row('First', 'a'), row('Second', 'b')])
    expect(badges(sectionFor('First'))).toContain('Saved')
    expect(importButton().textContent).toContain('Import 1 ready draft')
    importButton().click()
    await flush()
    expect(posts.map(post => post.name)).toEqual(['Second'])
  })
})
