// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import * as Vue from 'vue'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'

const navigate = vi.fn()
const filename = resolve(process.cwd(), 'app/pages/agency/audio/projects/index.vue')
const descriptor = parse(readFileSync(filename, 'utf8'), { filename }).descriptor
const compiled = compileScript(descriptor, { id: 'media-project-nav', inlineTemplate: true }).content
const code = ts.transpileModule(compiled, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const ProjectsPage = new Function('require', 'exports', `${code}; return exports.default`)((id: string) => {
  if (id === 'vue') return Vue
  if (id === '#app') return { navigateTo: navigate }
  throw new Error(`Unexpected page runtime import: ${id}`)
}, {})

const api = vi.fn()
const apps: App[] = []
const avProject = {
  id: 'av-proj-1',
  title: 'Launch Reel',
  clientId: null,
  mediaType: 'av',
  status: 'draft',
  updatedAt: '2026-11-24T00:00:00.000Z'
}

const select = {
  props: ['modelValue', 'items', 'disabled'],
  emits: ['update:modelValue'],
  template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
}

const stubs = {
  UButton: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled || loading" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>'
  },
  UModal: { props: ['open'], template: '<section v-if="open" role="dialog"><slot name="content" /></section>' },
  UFormField: { props: ['label'], template: '<div :data-field="label"><slot /></div>' },
  UInput: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  USelect: select,
  USelectMenu: select,
  UAlert: { props: ['title', 'description'], template: '<div role="alert">{{ title }} {{ description }}<slot name="actions" /></div>' },
  UIcon: { template: '<i />' },
  USkeleton: { template: '<div />' },
  UTable: { template: '<div />' },
  UBadge: { template: '<span />' },
  MediaVideoStudioWorkspaceHeader: {
    emits: ['create'],
    template: '<header><button data-test="create-video" @click="$emit(\'create\')">New video project</button></header>'
  },
  MediaVideoStudioProjectGallery: {
    props: ['projects'],
    emits: ['open', 'duplicate', 'delete', 'create'],
    template: `
      <div>
        <button v-for="p in projects" :key="p.id + '-open'" data-test="open-video" @click="$emit('open', p)">Open {{ p.title }}</button>
        <button v-for="p in projects" :key="p.id + '-dup'" data-test="duplicate-video" @click="$emit('duplicate', p)">Duplicate {{ p.title }}</button>
      </div>
    `
  }
}

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mountVideoStudioPage() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(ProjectsPage) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub)
  apps.push(app)
  app.mount(host)
  await settle()
  return host
}

beforeEach(() => {
  navigate.mockReset()
  api.mockReset().mockImplementation((url: string, options?: { method?: string, body?: { mediaType?: string } }) => {
    if (options?.method === 'POST') {
      const isDuplicate = url === '/api/agency/audio/projects' && options.body?.mediaType === 'av'
      return Promise.resolve({
        project: {
          id: isDuplicate ? 'av-proj-created' : 'aud-proj-created',
          mediaType: options.body?.mediaType ?? 'audio'
        }
      })
    }
    if (url === '/api/agency/audio/projects/av-proj-1') {
      return Promise.resolve({ project: avProject, timeline: null })
    }
    if (url === '/api/agency/clients') return Promise.resolve([])
    return Promise.resolve({ projects: [avProject] })
  })
  vi.stubGlobal('$fetch', api)
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useRoute', () => ({ query: { mediaType: 'av' } }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  localStorage.clear()
})

afterEach(() => {
  for (const app of apps.splice(0)) app.unmount()
  vi.unstubAllGlobals()
})

describe('Video Studio project actions preserve mediaType=av context', () => {
  it('navigates with ?mediaType=av when opening a video project', async () => {
    const host = await mountVideoStudioPage()
    host.querySelector<HTMLButtonElement>('[data-test="open-video"]')!.click()
    await settle()

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/agency/audio/projects/av-proj-1?mediaType=av')
  })

  it('navigates with ?mediaType=av when duplicating a video project', async () => {
    const host = await mountVideoStudioPage()
    host.querySelector<HTMLButtonElement>('[data-test="duplicate-video"]')!.click()
    await settle()

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/agency/audio/projects/av-proj-created?mediaType=av')
  })

  it('navigates with ?mediaType=av when creating a video project from Video Studio', async () => {
    const host = await mountVideoStudioPage()
    host.querySelector<HTMLButtonElement>('[data-test="create-video"]')!.click()
    await settle()

    const submit = [...host.querySelectorAll('button')].find(el => el.textContent?.trim() === 'Create video project')
    expect(submit).toBeTruthy()
    submit!.click()
    await settle()

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/agency/audio/projects/av-proj-created?mediaType=av')
  })

  it('publishes loaded project metadata from ProjectEditor independent of engine readiness', () => {
    const editorSource = readFileSync('app/components/media/ProjectEditor.client.vue', 'utf8')
    const start = editorSource.indexOf('const activeMediaProjectNav = useState')
    const end = editorSource.indexOf('const storyboardEnabled =', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const watcherBlock = editorSource.slice(start, end)
    expect(watcherBlock).toContain('ACTIVE_MEDIA_PROJECT_NAV_STATE_KEY')
    expect(watcherBlock).toContain('resolveLoadedMediaProjectContext')
    expect(watcherBlock).toContain('() => editor.project.value')
    expect(watcherBlock).not.toContain('editor.status')
  })
})

describe('useMediaProjectEditor metadata availability under delayed or failed audio engine load', () => {
  it('keeps a bare AV editor link current while clip sources load and after they fail', async () => {
    const { useMediaProjectEditor } = await import('~~/app/composables/useMediaProjectEditor')
    const { applyActiveSidebarNavGroup, applyMediaProjectSidebarContext, resolveLoadedMediaProjectContext } = await import('~~/app/utils/sidebarActiveNav')
    const path = '/agency/audio/projects'
    const clipSources = Promise.withResolvers<{ sources: Record<string, string> }>()
    vi.stubGlobal('$fetch', vi.fn((url: string) => url.endsWith('/clip-sources')
      ? clipSources.promise
      : Promise.resolve({ project: avProject, timeline: null })))

    let editor!: ReturnType<typeof useMediaProjectEditor>
    const app = createApp({
      setup() {
        editor = useMediaProjectEditor(avProject.id)
        return () => h('div')
      }
    })
    apps.push(app)
    app.mount(document.createElement('div'))
    const current = () => {
      const context = resolveLoadedMediaProjectContext(editor.project.value, editor.timeline.value?.media_type)
      const location = applyMediaProjectSidebarContext({ path: `${path}/${avProject.id}` }, context)
      return applyActiveSidebarNavGroup([{ to: path }, { to: `${path}?mediaType=av` }], location)
        .filter(item => item.active).map(item => item.to)
    }
    await settle()
    expect(editor.status.value).toBe('loading')
    expect(current()).toEqual([`${path}?mediaType=av`])
    clipSources.reject(new Error('Clip sources unavailable'))
    await settle()
    expect(editor.status.value).toBe('error')
    expect(current()).toEqual([`${path}?mediaType=av`])
  })

  it('exposes AV project metadata for sidebar resolution while engine.load is pending and when audio init fails', async () => {
    const engineLoadMock = vi.fn()
    const audioCtxMock = vi.fn()

    vi.resetModules()
    vi.doMock('~~/app/utils/audio/audioContextFactory', () => ({
      createBrowserAudioContext: audioCtxMock,
      browserSetTimer: vi.fn(),
      makeR2Resolver: () => vi.fn()
    }))
    vi.doMock('~~/app/composables/useAudioEngine', () => ({
      createAudioEngine: () => ({
        load: engineLoadMock,
        duration: () => 12,
        currentTime: () => 0,
        isPlaying: () => false,
        play: vi.fn(),
        pause: vi.fn(),
        seek: vi.fn(),
        dispose: vi.fn()
      })
    }))

    const { useMediaProjectEditor } = await import('~~/app/composables/useMediaProjectEditor')
    const {
      applyActiveSidebarNav,
      applyMediaProjectSidebarContext,
      resolveLoadedMediaProjectContext
    } = await import('~~/app/utils/sidebarActiveNav')

    function mountEditorComposable(id: string) {
      let editor!: ReturnType<typeof useMediaProjectEditor>
      const host = document.createElement('div')
      const app = createApp({
        setup() {
          editor = useMediaProjectEditor(id)
          return () => h('div')
        }
      })
      apps.push(app)
      app.mount(host)
      return { editor, app }
    }

    const sidebarNav = [[
      { label: 'Audio Studio', to: '/agency/audio' },
      { label: 'Video Studio', to: '/agency/audio/projects?mediaType=av' },
      { label: 'Audio Projects', to: '/agency/audio/projects' }
    ]]
    const avTimeline = {
      schema_version: 1,
      media_type: 'av',
      sample_rate: 48000,
      fps: 30,
      width: 1080,
      height: 1920,
      duration_sec: 10,
      tracks: [],
      ducking: []
    }

    // 1. Delayed engine.load: status is still 'loading', yet metadata already highlights Video Studio.
    let resolveEngineLoad!: (value: { missingClipIds: string[] }) => void
    engineLoadMock.mockImplementationOnce(() => new Promise((res) => {
      resolveEngineLoad = res
    }))
    audioCtxMock.mockReturnValueOnce({})
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/clip-sources')) return { sources: {} }
      return {
        project: { id: 'av-delayed', title: 'Delayed Reel', mediaType: 'av', status: 'draft' },
        timeline: { id: 'tl-1', editRevision: 1, state: avTimeline }
      }
    }))

    const { editor: delayedEditor, app: delayedApp } = mountEditorComposable('av-delayed')
    await settle()

    expect(delayedEditor.status.value).toBe('loading')
    const delayedContext = resolveLoadedMediaProjectContext(delayedEditor.project.value, delayedEditor.timeline.value?.media_type)
    expect(delayedContext).toEqual({ projectId: 'av-delayed', mediaType: 'av' })
    const delayedResolved = applyActiveSidebarNav(
      sidebarNav,
      applyMediaProjectSidebarContext(
        { path: '/agency/audio/projects/av-delayed', matched: [{ path: '/agency/audio/projects/:id()' }] },
        delayedContext
      )
    )
    expect(delayedResolved[0]!.filter(item => item.active).map(item => item.label)).toEqual(['Video Studio'])

    resolveEngineLoad({ missingClipIds: [] })
    await settle()
    expect(delayedEditor.status.value).toBe('ready')
    delayedApp.unmount()

    // 2. Failed audio engine load: status becomes 'error', yet Video Studio remains highlighted.
    audioCtxMock.mockImplementationOnce(() => {
      throw new Error('AudioContext blocked by browser autoplay policy')
    })
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/clip-sources')) return { sources: {} }
      return {
        project: { id: 'av-failed', title: 'Blocked Audio Reel', mediaType: 'av', status: 'draft' },
        timeline: { id: 'tl-2', editRevision: 1, state: avTimeline }
      }
    }))

    const { editor: failedEditor, app: failedApp } = mountEditorComposable('av-failed')
    await settle()
    expect(failedEditor.status.value).toBe('error')
    const failedContext = resolveLoadedMediaProjectContext(failedEditor.project.value, failedEditor.timeline.value?.media_type)
    expect(failedContext).toEqual({ projectId: 'av-failed', mediaType: 'av' })
    const failedResolved = applyActiveSidebarNav(
      sidebarNav,
      applyMediaProjectSidebarContext(
        { path: '/agency/audio/projects/av-failed', matched: [{ path: '/agency/audio/projects/:id()' }] },
        failedContext
      )
    )
    expect(failedResolved[0]!.filter(item => item.active).map(item => item.label)).toEqual(['Video Studio'])
    failedApp.unmount()

    // 3. Project missing timeline: status is 'error', yet project.mediaType still highlights Video Studio.
    vi.stubGlobal('$fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/clip-sources')) return { sources: {} }
      return {
        project: { id: 'av-no-timeline', title: 'Empty AV Project', mediaType: 'av', status: 'draft' },
        timeline: null
      }
    }))

    const { editor: noTimelineEditor, app: noTimelineApp } = mountEditorComposable('av-no-timeline')
    await settle()
    expect(noTimelineEditor.status.value).toBe('error')
    const noTimelineContext = resolveLoadedMediaProjectContext(noTimelineEditor.project.value, noTimelineEditor.timeline.value?.media_type)
    expect(noTimelineContext).toEqual({ projectId: 'av-no-timeline', mediaType: 'av' })
    noTimelineApp.unmount()

    vi.doUnmock('~~/app/utils/audio/audioContextFactory')
    vi.doUnmock('~~/app/composables/useAudioEngine')
  })
})
