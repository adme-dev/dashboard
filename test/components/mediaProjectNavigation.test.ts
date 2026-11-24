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

  it('publishes loaded project mediaType from ProjectEditor to the agency sidebar state', () => {
    const editorSource = readFileSync('app/components/media/ProjectEditor.client.vue', 'utf8')
    expect(editorSource).toContain('ACTIVE_MEDIA_PROJECT_NAV_STATE_KEY')
    expect(editorSource).toContain('mediaType: mediaType === \'av\' ? \'av\' : \'audio\'')
  })
})
