<!-- app/components/email/TemplatesPanel.vue -->
<!-- Templates manager (Phase 5). Lists saved edm_templates and offers the
     lifecycle actions around the composer: new / open / duplicate / rename /
     delete. Reuses the existing /api/email/templates CRUD — no new endpoints. -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import TemplateLibrarySidebar from './TemplateLibrarySidebar.vue'
import { filterTemplateLibrary } from '~~/app/utils/edmTemplateLibrary'
import type { EdmImageAsset } from '~~/app/utils/edmImageAssets'
import { EDM_STARTER_TEMPLATES } from '~~/app/utils/edmPresets'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

interface TemplateRow {
  id: string
  name: string
  subject: string | null
  preview_text?: string | null
  body_source?: unknown
  template_kind?: 'template' | 'draft' | null
  client_id?: string | null
  folder_name?: string | null
  updated_at: string
}
interface FullTemplate {
  name: string
  subject: string | null
  preview_text: string | null
  body_source: unknown
  template_kind?: 'template' | 'draft' | null
  client_id?: string | null
  folder_name?: string | null
}
interface TemplateGroup {
  key: string
  title: string
  rows: TemplateRow[]
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const data = ref<{ items: TemplateRow[] }>({ items: [] })
const pending = ref(false)
// Keep confirmed deletions out of any older list response still in flight.
const deletedTemplateIds = new Set<string>()

async function refresh() {
  pending.value = true
  try {
    const result = await apiFetch<{ items: TemplateRow[] }>('/api/email/templates')
    data.value = { items: result.items.filter(row => !deletedTemplateIds.has(row.id)) }
  } finally {
    pending.value = false
  }
}

await refresh()

const showImport = ref(false)
function onImported(template: TemplateRow) {
  mergeSavedTemplate(template)
  libraryView.value = 'templates'
  selectedClient.value = template.client_id || 'shared'
}

const busyId = ref<string | null>(null)
const libraryView = ref('templates')
const selectedClient = ref('all')
const clientChoices = ref<{ clients: { id: string, name: string }[], canUseSharedTemplates: boolean }>({ clients: [], canUseSharedTemplates: false })
const clientsError = ref('')
async function refreshClients() {
  try {
    const result = await apiFetch<typeof clientChoices.value>('/api/email/template-clients')
    clientChoices.value = { clients: result.clients || [], canUseSharedTemplates: result.canUseSharedTemplates === true }
    clientsError.value = ''
  } catch { clientsError.value = 'Client choices could not be loaded. Try again before creating a client template.' }
}
await refreshClients()
const clientOptions = computed(() => [{ label: 'All clients', value: 'all' }, ...(clientChoices.value.canUseSharedTemplates ? [{ label: 'Shared defaults', value: 'shared' }] : []), ...clientChoices.value.clients.map(client => ({ label: client.name, value: client.id }))])
const clientName = (id: string) => clientChoices.value.clients.find(client => client.id === id)?.name || 'Client template'
const targetClient = computed(() => clientChoices.value.clients.some(client => client.id === selectedClient.value) ? selectedClient.value : '')
const recentSavedIds = ref<string[]>([])
const recentStarterIds = ref<string[]>([])
const RECENT_KEY = 'xeroflow:email:recent-template-ids'
onMounted(() => {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}')
    const ids = (value: unknown) => Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length < 120).slice(0, 20) : []
    recentSavedIds.value = ids(stored.saved)
    recentStarterIds.value = ids(stored.starters)
  } catch { /* A corrupt or unavailable local history must not block the library. */ }
})
function rememberTemplate(id: string, starter = false) {
  const history = starter ? recentStarterIds : recentSavedIds
  history.value = [id, ...history.value.filter(value => value !== id)].slice(0, 20)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify({ saved: recentSavedIds.value, starters: recentStarterIds.value })) } catch { /* Optional local ID-only history. */ }
}
const allSavedRows = computed(() => data.value.items.map(row => ({ ...row, client_name: row.client_id ? clientName(row.client_id) : 'Shared default' })))
const savedRows = computed(() => filterTemplateLibrary(allSavedRows.value, { view: libraryView.value, client: selectedClient.value, search: starterSearch.value, recentIds: recentSavedIds.value }))
const categoryNames = computed(() => Array.from(new Set(filterTemplateLibrary(allSavedRows.value, { view: 'templates', client: selectedClient.value }).map(row => row.folder_name?.trim()).filter((name): name is string => Boolean(name)))).sort())
const showStarters = computed(() => ['templates', 'shared', 'recent'].includes(libraryView.value))
const libraryTitle = computed(() => ({ templates: 'All templates', shared: 'Shared defaults', drafts: 'Drafts', recent: 'Recently viewed' }[libraryView.value] || libraryView.value.slice(7)))
function selectLibraryView(view: string) { libraryView.value = view }
function mergeSavedTemplate(template: TemplateRow) {
  data.value = { items: [template, ...data.value.items.filter(row => row.id !== template.id)] }
}
function openCopyTemplate(row: TemplateRow) {
  rememberTemplate(row.id)
  const query = new URLSearchParams({ copy: row.id })
  if (targetClient.value) query.set('client', targetClient.value)
  navigateTo(`/agency/email/compose?${query}`)
}

function rowKind(row: TemplateRow): 'template' | 'draft' {
  return row.template_kind === 'draft' ? 'draft' : 'template'
}

function rowFolder(row: TemplateRow): string {
  return row.folder_name?.trim() || 'No category'
}

const savedTemplateGroups = computed<TemplateGroup[]>(() => {
  const drafts = savedRows.value.filter(row => rowKind(row) === 'draft')
  const templates = savedRows.value.filter(row => rowKind(row) === 'template')
  const groups: TemplateGroup[] = []
  if (drafts.length > 0) {
    groups.push({ key: 'drafts', title: 'Drafts', rows: drafts })
  }

  const byFolder = new Map<string, TemplateRow[]>()
  for (const row of templates) {
    const folder = rowFolder(row)
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), row])
  }
  for (const [folder, rows] of Array.from(byFolder.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({ key: `folder:${folder}`, title: folder, rows })
  }

  return groups
})

function openComposer(id?: string) {
  const query = new URLSearchParams()
  if (id) { query.set('id', id); rememberTemplate(id) }
  else if (targetClient.value) query.set('client', targetClient.value)
  navigateTo(`/agency/email/compose${query.size ? '?' + query : ''}`)
}

function openStarter(starterId: string) {
  rememberTemplate(starterId, true)
  const query = new URLSearchParams({ starter: starterId })
  if (targetClient.value) query.set('client', targetClient.value)
  navigateTo(`/agency/email/compose?${query}`)
}

// ── Starter gallery: filters + search ────────────────────────────────────────
const industryOptions = computed(() =>
  Array.from(new Set(EDM_STARTER_TEMPLATES.map(t => t.industry || 'General')))
)
const usageOptions = computed(() =>
  Array.from(new Set(EDM_STARTER_TEMPLATES.map(t => t.usage)))
)
const styleOptions = computed(() =>
  Array.from(new Set(EDM_STARTER_TEMPLATES.map(t => t.style)))
)

const selectedIndustry = ref('all')
const selectedUsage = ref('all')
const selectedStyle = ref('all')
const starterSearch = ref('')

function resetFilters() {
  selectedIndustry.value = 'all'
  selectedUsage.value = 'all'
  selectedStyle.value = 'all'
  starterSearch.value = ''
}

const hasActiveFilters = computed(() =>
  selectedIndustry.value !== 'all'
  || selectedUsage.value !== 'all'
  || selectedStyle.value !== 'all'
  || starterSearch.value.trim().length > 0
)

const filteredStarters = computed(() => {
  const q = starterSearch.value.trim().toLowerCase()
  return EDM_STARTER_TEMPLATES.filter((t) => {
    if (libraryView.value === 'recent' && !recentStarterIds.value.includes(t.id)) return false
    const industryOk = selectedIndustry.value === 'all' || (t.industry || 'General') === selectedIndustry.value
    const usageOk = selectedUsage.value === 'all' || t.usage === selectedUsage.value
    const styleOk = selectedStyle.value === 'all' || t.style === selectedStyle.value
    const searchOk = !q
      || t.name.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
      || (t.industry || '').toLowerCase().includes(q)
    return industryOk && usageOk && styleOk && searchOk
  })
})

function starterPreviewImageUrl(starterId: string): string {
  return `/email/template-previews/${starterId}.jpeg?v=20261029-oem3`
}

const showCategory = ref(false)
const categoryName = ref('')
const categoryTemplateIds = ref<string[]>([])
const categoryBusy = ref(false)
function openCategory() { categoryName.value = ''; categoryTemplateIds.value = []; showCategory.value = true }
const categoryOptions = computed(() => filterTemplateLibrary(allSavedRows.value, { view: 'templates', client: selectedClient.value }).map(row => ({ label: `${row.name} · ${row.client_name}`, value: row.id })))
async function saveCategory() {
  const name = categoryName.value.trim()
  if (!name || name.length > 120 || !categoryTemplateIds.value.length || categoryBusy.value) return
  categoryBusy.value = true
  const failed: string[] = []
  let saved = 0
  for (const id of categoryTemplateIds.value) {
    try {
      const { template } = await apiFetch<{ template: TemplateRow }>(`/api/email/templates/${id}`, { method: 'PATCH', body: { folder_name: name } })
      mergeSavedTemplate(template)
      saved++
    } catch { failed.push(id) }
  }
  categoryBusy.value = false
  if (saved) libraryView.value = `folder:${name}`
  if (failed.length) {
    categoryTemplateIds.value = failed
    toast.add({ title: 'Some templates could not be categorised', description: `${saved} updated. Retry the remaining ${failed.length}.`, color: 'error' })
  } else {
    showCategory.value = false
    categoryName.value = ''
    categoryTemplateIds.value = []
    toast.add({ title: 'Category saved', color: 'success' })
  }
}
const showImageLibrary = ref(false)
const showImageDetails = ref(false)
const chosenImage = ref<EdmImageAsset | null>(null)
function selectLibraryImage(asset: EdmImageAsset) { chosenImage.value = asset; showImageLibrary.value = false; showImageDetails.value = true }
async function copyImageUrl() {
  if (!chosenImage.value) return
  try { await navigator.clipboard.writeText(chosenImage.value.url); toast.add({ title: 'Image link copied', color: 'success' }) }
  catch { toast.add({ title: 'Select and copy the image link below', color: 'warning' }) }
}

// ── Rename ──────────────────────────────────────────────────────────────────
const showRename = ref(false)
const renameTarget = ref<TemplateRow | null>(null)
const renameValue = ref('')

function openRename(row: TemplateRow) {
  renameTarget.value = row
  renameValue.value = row.name
  showRename.value = true
}

async function doRename() {
  const row = renameTarget.value
  if (!row || !renameValue.value.trim()) return
  busyId.value = row.id
  try {
    const { template } = await apiFetch<{ template: TemplateRow }>(`/api/email/templates/${row.id}`, {
      method: 'PATCH',
      body: { name: renameValue.value.trim() }
    })
    mergeSavedTemplate(template)
    toast.add({ title: 'Template renamed', color: 'success' })
    showRename.value = false
  } catch {
    toast.add({ title: 'Rename failed', color: 'error' })
  } finally {
    busyId.value = null
  }
}

// ── Duplicate ───────────────────────────────────────────────────────────────
async function duplicate(row: TemplateRow) {
  busyId.value = row.id
  try {
    const { template } = await apiFetch<{ template: FullTemplate }>(`/api/email/templates/${row.id}`)
    const result = await apiFetch<{ template: TemplateRow }>('/api/email/templates', {
      method: 'POST',
      body: {
        name: `${template.name} (copy)`,
        subject: template.subject,
        preview_text: template.preview_text,
        body_source: template.body_source,
        template_kind: template.template_kind === 'draft' ? 'draft' : 'template',
        folder_name: template.folder_name || null,
        client_id: template.client_id ?? row.client_id ?? null
      }
    })
    mergeSavedTemplate(result.template)
    toast.add({ title: 'Template duplicated', color: 'success' })
  } catch {
    toast.add({ title: 'Duplicate failed', color: 'error' })
  } finally {
    busyId.value = null
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────
const showDelete = ref(false)
const deleteTarget = ref<TemplateRow | null>(null)
const deleting = ref(false)

function confirmDelete(row: TemplateRow) {
  if (deleting.value) return
  deleteTarget.value = row
  showDelete.value = true
}

async function doDelete() {
  const row = deleteTarget.value
  if (!row || deleting.value) return
  deleting.value = true
  try {
    await apiFetch(`/api/email/templates/${row.id}`, { method: 'DELETE' })
    deletedTemplateIds.add(row.id)
    data.value = { items: data.value.items.filter(item => item.id !== row.id) }
    toast.add({ title: 'Template deleted', color: 'success' })
    showDelete.value = false
    deleteTarget.value = null
  } catch {
    toast.add({ title: 'Delete failed', description: 'The template was not removed. Try again.', color: 'error' })
  } finally {
    deleting.value = false
  }
}

function fmtDate(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function templateDocument(row: TemplateRow): EdmFlyhubDocument | null {
  if (!row.body_source || typeof row.body_source !== 'object') return null
  const candidate = row.body_source as Partial<EdmFlyhubDocument>
  return candidate.root?.type === 'EmailLayout' ? candidate as EdmFlyhubDocument : null
}
</script>

<template>
  <div class="email-template-gallery-shell min-h-[calc(100vh-13rem)] overflow-hidden rounded-xl border border-default bg-default lg:flex">
    <aside class="email-template-gallery-sidebar shrink-0 border-b border-default bg-elevated/20 lg:w-64 lg:border-b-0 lg:border-r">
      <div class="flex h-16 items-center border-b border-default px-5">
        <p class="text-sm font-semibold">
          Team
        </p>
      </div>
      <div class="border-b border-default p-4">
        <UFormField label="Search templates">
          <UInput v-model="starterSearch" icon="i-lucide-search" placeholder="Name, client or category" class="w-full" />
        </UFormField>
      </div>
      <TemplateLibrarySidebar
        :active-view="libraryView"
        :folders="categoryNames"
        @select="selectLibraryView"
        @new-folder="openCategory"
        @image-library="showImageLibrary = true"
      />
    </aside>

    <main class="min-w-0 flex-1 bg-default">
      <div class="flex h-16 items-center justify-between border-b border-default px-6">
        <p class="text-sm font-semibold">
          {{ libraryTitle }}
        </p>
        <UButton label="Import template" icon="i-lucide-upload" variant="outline" @click="showImport = true" />
        <UButton
          v-if="hasActiveFilters"
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-x"
          label="Clear filters"
          @click="resetFilters()"
        />
      </div>

      <div class="space-y-10 p-6">
        <UAlert v-if="clientsError" color="warning" :title="clientsError" :actions="[{ label: 'Retry', onClick: refreshClients }]" />
        <UFormField label="Client" help="Choose a client to browse its templates and start a client copy of a default.">
          <USelect v-model="selectedClient" :items="clientOptions" value-key="value" class="w-full max-w-md" />
        </UFormField>
        <section v-if="showStarters" class="space-y-5">
          <h2 class="text-sm font-semibold">XeroFlow defaults</h2>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UFormField label="Industry">
              <USelect value-key="value" v-model="selectedIndustry" :items="[{ label: 'All industries', value: 'all' }, ...industryOptions.map(value => ({ label: value, value }))]" class="w-full" />
            </UFormField>
            <UFormField label="Email type">
              <USelect value-key="value" v-model="selectedUsage" :items="[{ label: 'All types', value: 'all' }, ...usageOptions.map(value => ({ label: value, value }))]" class="w-full" />
            </UFormField>
            <UFormField label="Design style">
              <USelect value-key="value" v-model="selectedStyle" :items="[{ label: 'All styles', value: 'all' }, ...styleOptions.map(value => ({ label: value, value }))]" class="w-full" />
            </UFormField>
          </div>

          <div class="email-starter-gallery-grid grid gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <UButton
              color="neutral" variant="ghost"
              type="button"
              class="email-starter-blank-card p-0 w-full whitespace-normal flex min-h-[430px] flex-col items-center justify-center rounded-lg border border-default bg-elevated/30 text-center transition hover:border-primary hover:bg-primary/5"
              @click="openComposer()"
            >
              <UIcon name="i-lucide-plus" class="size-10 text-muted" />
              <p class="mt-5 text-sm font-semibold text-muted">
                Create Blank Template
              </p>
            </UButton>

            <UButton
              color="neutral" variant="ghost"
              v-for="starter in filteredStarters"
              :key="starter.id"
              type="button"
              class="email-starter-card group block w-full min-w-0 p-0 text-left whitespace-normal hover:bg-transparent"
              @click="openStarter(starter.id)"
            >
              <div class="overflow-hidden rounded-lg border border-default bg-elevated/30 transition group-hover:border-primary group-hover:shadow-sm">
                <EmailBuilderEdmTemplateThumbnail
                  :template-id="starter.id"
                  :preview-image-url="starterPreviewImageUrl(starter.id)"
                  :width="320"
                  :max-height="430"
                />
              </div>
              <div class="mt-3 min-w-0">
                <div class="flex min-w-0 items-center gap-2">
                  <span v-if="starter.isNew" class="rounded bg-success px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">NEW</span>
                  <p class="truncate text-base font-semibold group-hover:text-primary">
                    {{ starter.name }}
                  </p>
                </div>
                <p class="mt-2 truncate text-sm text-muted">
                  {{ starter.industry || 'General' }} · {{ starter.usage }} · {{ starter.style }} · {{ starter.description }}
                </p>
              </div>
            </UButton>
          </div>

          <div
            v-if="filteredStarters.length === 0"
            class="rounded-lg border border-dashed border-default py-10 text-center text-sm text-muted"
          >
            No templates match your filters.
          </div>
        </section>

        <section class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold uppercase text-muted">
              Your templates
            </p>
            <p class="text-sm text-muted">
              {{ savedRows.length }} template(s)
            </p>
          </div>

          <div v-if="pending" class="text-sm text-muted">
            Loading…
          </div>
          <div v-else-if="!savedRows.length" class="text-sm text-muted py-8 text-center">
            No templates yet. Build one in the composer and save it to reuse across campaigns.
          </div>

          <div v-else class="space-y-6">
            <section
              v-for="group in savedTemplateGroups"
              :key="group.key"
              class="space-y-3"
            >
              <div v-if="savedTemplateGroups.length > 1 || group.key !== 'folder:No category'" class="flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-default">
                  {{ group.title }}
                </h3>
                <span class="text-xs text-muted">{{ group.rows.length }} template(s)</span>
              </div>

              <div class="saved-template-grid grid gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                <div
                  v-for="row in group.rows"
                  :key="row.id"
                  class="saved-template-card group flex min-h-80 flex-col overflow-hidden rounded-lg border border-default bg-default hover:border-primary hover:shadow-sm"
                >
                  <UButton
                    color="neutral" variant="ghost"
                    type="button"
                    class="flex w-full flex-1 flex-col rounded-none p-0 text-left cursor-pointer whitespace-normal hover:bg-transparent"
                    @click="libraryView === 'shared' ? openCopyTemplate(row) : openComposer(row.id)"
                  >
                    <div class="flex h-[430px] w-full items-start justify-center overflow-hidden bg-elevated/40">
                      <EmailBuilderEdmDocumentThumbnail
                        :document="templateDocument(row)"
                        :width="320"
                        :max-height="430"
                      />
                    </div>
                    <div class="w-full flex-1 border-t border-default p-4">
                      <div class="mb-2 flex flex-wrap gap-1.5">
                        <UBadge variant="subtle" color="neutral" size="xs" :label="row.client_id ? clientName(row.client_id) : 'Shared default'" />
                        <UBadge
                          v-if="rowKind(row) === 'draft'"
                          variant="subtle"
                          color="warning"
                          size="xs"
                          label="Draft"
                        />
                        <UBadge
                          v-else-if="row.folder_name?.trim()"
                          variant="subtle"
                          color="neutral"
                          size="xs"
                          :label="rowFolder(row)"
                        />
                      </div>
                      <p class="font-semibold truncate group-hover:text-primary">
                        {{ row.name }}
                      </p>
                      <p class="mt-1 text-sm text-muted truncate">
                        {{ row.subject || 'No subject' }}
                      </p>
                      <p v-if="row.preview_text" class="mt-2 line-clamp-2 text-sm text-muted leading-snug">
                        {{ row.preview_text }}
                      </p>
                      <p class="mt-3 text-xs text-muted">
                        Updated {{ fmtDate(row.updated_at) }}
                      </p>
                    </div>
                  </UButton>

                  <div class="flex flex-wrap items-center justify-end gap-1 border-t border-default px-3 py-2">
                    <UButton v-if="!row.client_id && rowKind(row) !== 'draft'" label="Use template" icon="i-lucide-copy-plus" variant="ghost" color="neutral" size="xs" @click="openCopyTemplate(row)" />
                    <UButton
                      icon="i-lucide-pencil"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      label="Edit"
                      @click="openComposer(row.id)"
                    />
                    <UTooltip text="Duplicate">
                      <UButton
                        icon="i-lucide-copy"
                        variant="ghost"
                        color="neutral"
                        size="xs"
                        :loading="busyId === row.id"
                        @click="duplicate(row)"
                      />
                    </UTooltip>
                    <UTooltip text="Rename">
                      <UButton
                        icon="i-lucide-text-cursor-input"
                        variant="ghost"
                        color="neutral"
                        size="xs"
                        @click="openRename(row)"
                      />
                    </UTooltip>
                    <UTooltip text="Delete">
                      <UButton
                        icon="i-lucide-trash-2"
                        variant="ghost"
                        color="error"
                        size="xs"
                        @click="confirmDelete(row)"
                      />
                    </UTooltip>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>

    <EmailTemplateImportModal v-model:open="showImport" :initial-client-id="targetClient || null" @imported="onImported" />

    <UModal v-model:open="showCategory" title="Create category" :dismissible="!categoryBusy" :close="!categoryBusy">
      <template #content>
        <div class="space-y-4 p-5">
          <h2 class="text-lg font-semibold">Create category</h2>
          <p class="text-sm text-muted">Choose saved templates to organise into a category.</p>
          <UFormField label="Category name" required><UInput v-model="categoryName" :maxlength="120" :disabled="categoryBusy" class="w-full" /></UFormField>
          <UFormField label="Templates" required><USelectMenu v-model="categoryTemplateIds" multiple :items="categoryOptions" value-key="value" :disabled="categoryBusy" class="w-full" /></UFormField>
          <p v-if="!categoryOptions.length" class="text-sm text-muted">Save or import a template for this client first.</p>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" :disabled="categoryBusy" @click="showCategory = false" /><UButton label="Save category" :loading="categoryBusy" :disabled="!categoryName.trim() || !categoryTemplateIds.length || categoryBusy" @click="saveCategory" /></div>
        </div>
      </template>
    </UModal>
    <EmailBuilderEdmImageLibraryPicker v-if="showImageLibrary" v-model:open="showImageLibrary" @pick="selectLibraryImage" />
    <UModal v-model:open="showImageDetails" title="Image library">
      <template #content><div v-if="chosenImage" class="space-y-4 p-5"><h2 class="font-semibold">{{ chosenImage.name }}</h2><img :src="chosenImage.url" :alt="chosenImage.name" class="max-h-80 w-full object-contain" /><UFormField label="Image link"><UInput :model-value="chosenImage.url" readonly class="w-full" /></UFormField><div class="flex justify-end gap-2"><UButton label="Close" variant="ghost" color="neutral" @click="showImageDetails = false" /><UButton label="Copy link" icon="i-lucide-copy" @click="copyImageUrl" /></div></div></template>
    </UModal>

    <UModal v-model:open="showRename" title="Rename template">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm font-semibold">
            Rename template
          </p>
          <UFormField label="Name" required>
            <UInput
              v-model="renameValue"
              placeholder="Template name"
              class="w-full"
              autofocus
              @keyup.enter="doRename()"
            />
          </UFormField>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              @click="showRename = false"
            />
            <UButton
              color="primary"
              label="Save"
              :loading="busyId === renameTarget?.id"
              :disabled="!renameValue.trim()"
              @click="doRename()"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showDelete" title="Delete template" :dismissible="!deleting" :close="!deleting">
      <template #content>
        <div class="p-4 space-y-4">
          <p class="text-sm font-semibold">
            Delete “{{ deleteTarget?.name }}”?
          </p>
          <p class="text-sm text-muted">
            This permanently removes the template. Campaigns already created from it
            are unaffected. This can't be undone.
          </p>
          <div class="flex justify-end gap-2 pt-2">
            <UButton
              variant="ghost"
              color="neutral"
              label="Cancel"
              :disabled="deleting"
              @click="showDelete = false"
            />
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              label="Delete"
              :loading="deleting"
              :disabled="!deleteTarget || deleting"
              @click="doDelete()"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.email-template-nav-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.5rem;
  padding: 0.65rem 0.75rem;
  color: var(--ui-text-muted);
  font-weight: 600;
  text-align: left;
  transition: background-color 120ms ease, color 120ms ease;
}

.email-template-nav-item:hover,
.email-template-nav-item.is-active {
  background: var(--ui-bg-muted);
  color: var(--ui-text);
}

</style>
