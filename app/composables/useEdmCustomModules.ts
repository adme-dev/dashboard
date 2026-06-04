// app/composables/useEdmCustomModules.ts
// CRUD data layer for EDM custom modules (enterprise Phase 2).
// Wraps /api/agency/email/modules (list/create/patch/delete). Shared singleton
// state via useState so the builder's "Save as module" action and the palette's
// "Custom Modules" category stay in sync without prop drilling.
import type { EdmDocumentFragment } from '~~/app/utils/edmPresets'
import type { EdmPreviewTone } from '~~/app/utils/edmPresets'

export interface EdmCustomModule {
  id: string
  name: string
  description: string | null
  category: string
  blocks: EdmDocumentFragment
  preview_tone: EdmPreviewTone
  client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface SaveModuleInput {
  name: string
  description?: string | null
  category?: string
  preview_tone?: EdmPreviewTone
  blocks: EdmDocumentFragment
}

const BASE = '/api/agency/email/modules'

export function useEdmCustomModules() {
  const modules = useState<EdmCustomModule[]>('edm-custom-modules', () => [])
  const loading = useState<boolean>('edm-custom-modules-loading', () => false)
  const loaded = useState<boolean>('edm-custom-modules-loaded', () => false)

  async function load(force = false) {
    if (loaded.value && !force) return
    loading.value = true
    try {
      const res = await $fetch<{ items: EdmCustomModule[] }>(BASE)
      modules.value = res.items
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function save(input: SaveModuleInput): Promise<EdmCustomModule> {
    const res = await $fetch<{ module: EdmCustomModule }>(BASE, { method: 'POST', body: input })
    modules.value = [res.module, ...modules.value]
    return res.module
  }

  async function rename(id: string, patch: { name?: string; description?: string | null }) {
    const res = await $fetch<{ module: EdmCustomModule }>(`${BASE}/${id}`, { method: 'PATCH', body: patch })
    modules.value = modules.value.map(m => (m.id === id ? res.module : m))
    return res.module
  }

  async function remove(id: string) {
    await $fetch(`${BASE}/${id}`, { method: 'DELETE' })
    modules.value = modules.value.filter(m => m.id !== id)
  }

  return { modules, loading, loaded, load, save, rename, remove }
}
