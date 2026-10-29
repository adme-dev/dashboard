import { readFileSync } from 'node:fs'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Both agency and full-screen routes render this shared editor. Exercise its
// actual save handlers without mounting the canvas/timeline.
const source = readFileSync('app/components/banner/StudioEditor.client.vue', 'utf8')
const settingsHandler = source.slice(source.indexOf('async function saveProjectSettings()'), source.indexOf('/** If the client has a default brand kit'))
const saveHandler = source.slice(source.indexOf('async function handleSave()'), source.indexOf('// Save version'))

function editor(clientId = 'driveagent') {
  const state: {
    project: { id?: string, name?: string, clientId?: string | null, clientName?: string } | null
    sets: Record<string, { layers: unknown[] }>
    isDirty: boolean
    isSaving: boolean
  } = { project: null, sets: { mrec: { layers: [] } }, isDirty: false, isSaving: false }
  const settingsName = { value: 'DriveAgent campaign' }
  const settingsClientId = { value: clientId }
  const showProjectSettings = { value: true }
  const settingsSaving = { value: false }
  const clientsForSettings = { value: [{ id: 'driveagent', name: 'DriveAgent' }] }
  const fetch = vi.fn(async (_url, options) => ({ id: 'saved-project', ...options.body }))
  const offerDefaultBrandKit = vi.fn()
  const globals = { state, settingsName, settingsClientId, showProjectSettings, settingsSaving, clientsForSettings,
    $fetch: fetch, offerDefaultBrandKit, saveProject: vi.fn(), toast: { add: vi.fn() },
    route: { path: '/creative/banner-studio/new' }, navigateTo: vi.fn(), isAmbiguousApiFailure: () => false, crypto: { randomUUID: () => 'retry-key' } }
  const compiled = transpileModule(`let createProjectIdempotencyKey = 'create-key';\n${settingsHandler}\n${saveHandler}\nreturn { saveProjectSettings, handleSave };`, {
    compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None }
  }).outputText
  const handlers = new Function(...Object.keys(globals), compiled)(...Object.values(globals))
  return { ...globals, fetch, ...handlers }
}

describe('Banner Studio first save', () => {
  it('retains the selected client, offers its kit and creates the banner in that client scope', async () => {
    const e = editor()
    await e.saveProjectSettings()
    expect(e.state.project).toMatchObject({ name: 'DriveAgent campaign', clientId: 'driveagent', clientName: 'DriveAgent' })
    expect(e.state.isDirty).toBe(true)
    expect(e.offerDefaultBrandKit).toHaveBeenCalledWith('driveagent')
    await e.handleSave()
    expect(e.fetch.mock.calls[0]![1].body.clientId).toBe('driveagent')
    expect(e.state.project.clientId).toBe('driveagent')
    expect(e.state.isDirty).toBe(false)
    expect(e.navigateTo).toHaveBeenCalledWith('/creative/banner-studio/saved-project', { replace: true })
  })

  it('keeps an explicitly unassigned new banner unassigned', async () => {
    const e = editor('none')
    await e.saveProjectSettings()
    expect(e.state.project.clientId).toBeNull()
    expect(e.offerDefaultBrandKit).not.toHaveBeenCalled()
    await e.handleSave()
    expect(e.fetch.mock.calls[0]![1].body.clientId).toBeNull()
  })

  it('allows only one create request while first save is in progress', async () => {
    const e = editor()
    await e.saveProjectSettings()
    let finish!: (value: unknown) => void
    e.fetch.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const pending = e.handleSave()
    expect(e.state.isSaving).toBe(true)
    await e.handleSave()
    expect(e.fetch).toHaveBeenCalledTimes(1)
    finish({ id: 'saved-project', name: 'DriveAgent campaign', clientId: 'driveagent' })
    await pending
    expect(e.state.isSaving).toBe(false)
  })

  it('retains the unsaved client and unlocks save after a failed create', async () => {
    const e = editor()
    await e.saveProjectSettings()
    e.fetch.mockRejectedValueOnce(new Error('Unavailable'))
    await e.handleSave()
    expect(e.state.isSaving).toBe(false)
    expect(e.state.project).toMatchObject({ clientId: 'driveagent' })
    expect(e.state.isDirty).toBe(true)
    await e.handleSave()
    expect(e.state.project).toMatchObject({ id: 'saved-project', clientId: 'driveagent' })
  })
})


it('retains edits made while the first viewer snapshot is being stored', async () => {
  const e = editor()
  await e.saveProjectSettings()
  let finish!: () => void
  e.fetch.mockImplementation(async (url, options) => {
    if (url.endsWith('/snapshot')) return new Promise<void>(resolve => { finish = resolve })
    return { id: 'saved-project', ...options.body }
  })
  e.saveProject.mockImplementation(async () => {
    expect(e.state.sets.mrec.layers).toEqual([{ text: 'Typed during snapshot' }])
    e.state.isDirty = false
  })
  const pending = e.handleSave()
  await vi.waitFor(() => expect(e.fetch).toHaveBeenCalledTimes(2))
  e.state.sets.mrec.layers.push({ text: 'Typed during snapshot' })
  e.state.isDirty = true
  finish()
  expect(await pending).toBe(true)
  expect(e.saveProject).toHaveBeenCalledTimes(1)
  expect(e.navigateTo).toHaveBeenCalledTimes(1)
})

it('keeps the chosen library folder on the first autosaved project', async () => {
  const e = editor()
  ;(e.route as any).query = { folder: '632a71d5-cd2c-4d9f-812d-e3f70bb6c241' }
  await e.saveProjectSettings()
  expect(await e.handleSave()).toBe(true)
  expect(e.fetch.mock.calls[0]![1].body.folderId).toBe('632a71d5-cd2c-4d9f-812d-e3f70bb6c241')
})
