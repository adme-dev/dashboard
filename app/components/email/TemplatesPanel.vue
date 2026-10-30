<!-- app/components/email/TemplatesPanel.vue -->
<!-- Templates manager (Phase 5). Lists saved edm_templates and offers the
     lifecycle actions around the composer: new / open / duplicate / rename /
     delete. Reuses the existing /api/email/templates CRUD — no new endpoints. -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import TemplateLibrarySidebar from './TemplateLibrarySidebar.vue'
import { templateSourceDetails, buildTemplateExport, isTemplateClientCopy, templateCopyName, markTemplateClientCopy, templateCopyCategory } from '~~/app/utils/edmTemplateProvenance'
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
const libraryError = ref('')
let refreshGeneration = 0
let mutationGeneration = 0
// Keep confirmed deletions out of any older list response still in flight.
const deletedTemplateIds = new Set<string>()

async function refresh() {
  const generation = ++refreshGeneration
  const mutation = mutationGeneration
  pending.value = true
  libraryError.value = ''
  try {
    const result = await apiFetch<{ items: TemplateRow[] }>('/api/email/templates')
    if (generation === refreshGeneration && mutation === mutationGeneration) data.value = { items: result.items.filter(row => !deletedTemplateIds.has(row.id)) }
  } catch {
    if (generation === refreshGeneration) libraryError.value = 'Templates could not be loaded. Your saved templates have not been changed.'
  } finally {
    if (generation === refreshGeneration) pending.value = false
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
const savedRows = computed(() => filterTemplateLibrary(allSavedRows.value, { view: libraryView.value, client: selectedClient.value, search: starterSearch.value, recentIds: recentSavedIds.value, make: selectedMake.value }))
const categoryNames = computed(() => Array.from(new Set(filterTemplateLibrary(allSavedRows.value, { view: 'templates', client: selectedClient.value }).map(row => row.folder_name?.trim()).filter((name): name is string => Boolean(name)))).sort())
const showStarters = computed(() => ['templates', 'shared', 'recent'].includes(libraryView.value))
const libraryTitle = computed(() => ({ templates: 'All templates', shared: 'Shared defaults', drafts: 'Drafts', recent: 'Recently viewed' }[libraryView.value] || libraryView.value.slice(7)))
function selectLibraryView(view: string) { libraryView.value = view }
function mergeSavedTemplate(template: TemplateRow) {
  mutationGeneration++
  data.value = { items: [template, ...data.value.items.filter(row => row.id !== template.id)] }
}
function openCopyTemplate(row: TemplateRow) {
  rememberTemplate(row.id)
  const query = new URLSearchParams({ copy: row.id })
  const clientId = targetClient.value || (clientChoices.value.clients.some(client => client.id === row.client_id) ? row.client_id : '')
  if (clientId) query.set('client', clientId)
  navigateTo(`/agency/email/compose?${query}`)
}

const detailsTarget = ref<TemplateRow | null>(null)
const sourceDetails = computed(() => templateSourceDetails(detailsTarget.value?.body_source))
const showDetails = ref(false)
function openDetails(row: TemplateRow) { detailsTarget.value = row; showDetails.value = true }
function usesClientCopy(row: TemplateRow) { return !row.client_id || (!!templateSourceDetails(row.body_source) && !isTemplateClientCopy(row.body_source)) }
async function exportTemplate(row: TemplateRow) {
  busyId.value = row.id
  try {
    const { template } = await apiFetch<{ template: FullTemplate }>(`/api/email/templates/${row.id}`)
    const file = buildTemplateExport(template.name, template.body_source, template)
    const url = URL.createObjectURL(new Blob([file.content], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = file.filename
    document.body.appendChild(link); link.click(); link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.add({ title: 'Template exported', description: 'Import this JSON backup to restore the design and template settings. Choose the client during import.', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Export failed', description: error instanceof Error ? error.message : 'Try again.', color: 'error' })
  } finally { busyId.value = null }
}

function rowKind(row: TemplateRow): 'template' | 'draft' {
  return row.template_kind === 'draft' ? 'draft' : 'template'
}

function rowFolder(row: TemplateRow): string {
  return row.folder_name?.trim() || 'No category'
}

const savedTemplateGroups = computed<TemplateGroup[]>(() => {
  const groups: TemplateGroup[] = []
  const byFolder = new Map<string, TemplateRow[]>()
  for (const row of savedRows.value) {
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

const selectedMake = ref('all')
watch(selectedClient, () => { selectedMake.value = 'all' })
const makeOptions = computed(() => [{ label: 'All makes', value: 'all' }, ...Array.from(new Set(filterTemplateLibrary(allSavedRows.value, { view: 'templates', client: selectedClient.value }).map(row => templateSourceDetails(row.body_source)?.make).filter((make): make is string => !!make))).sort().map(make => ({ label: make, value: make }))])
const selectedIndustry = ref('all')
const selectedUsage = ref('all')
const selectedStyle = ref('all')
const starterSearch = ref('')

function resetFilters() {
  selectedMake.value = 'all'
  selectedIndustry.value = 'all'
  selectedUsage.value = 'all'
  selectedStyle.value = 'all'
  starterSearch.value = ''
}

const hasActiveFilters = computed(() =>
  selectedMake.value !== 'all' || selectedIndustry.value !== 'all'
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
        name: templateCopyName(template.name),
        subject: template.subject,
        preview_text: template.preview_text,
        body_source: markTemplateClientCopy(template.body_source, row.id),
        template_kind: template.template_kind === 'draft' ? 'draft' : 'template',
        folder_name: templateCopyCategory(template.body_source, template.folder_name),
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
      <div class="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-3 sm:px-6">
        <p class="text-sm font-semibold">
          {{ libraryTitle }}
        </p>
        <div class="flex items-center gap-2">
          <UButton
            v-if="hasActiveFilters"
            variant="ghost"
            color="neutral"
            size="xs"
            icon="i-lucide-x"
            label="Clear filters"
            @click="resetFilters()"
          />
          <UButton label="Import template" icon="i-lucide-upload" variant="outline" @click="showImport = true" />
        </div>
      </div>

      <div class="space-y-6 p-4 sm:p-6">
        <UAlert v-if="libraryError" color="error" :title="libraryError" :actions="[{ label: 'Retry', onClick: refresh }]" />
        <UAlert v-if="clientsError" color="warning" :title="clientsError" :actions="[{ label: 'Retry', onClick: refreshClients }]" />
        <section aria-label="Template filters" class="@container border-b border-default pb-5">
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-5">
            <UFormField label="Client">
              <USelect v-model="selectedClient" :items="clientOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField v-if="makeOptions.length > 1" label="OEM make">
              <USelect v-model="selectedMake" :items="makeOptions" value-key="value" class="w-full" />
            </UFormField>
            <template v-if="showStarters && selectedMake === 'all'">
              <UFormField label="Industry">
                <USelect value-key="value" v-model="selectedIndustry" :items="[{ label: 'All industries', value: 'all' }, ...industryOptions.map(value => ({ label: value, value }))]" class="w-full" />
              </UFormField>
              <UFormField label="Email type">
                <USelect value-key="value" v-model="selectedUsage" :items="[{ label: 'All types', value: 'all' }, ...usageOptions.map(value => ({ label: value, value }))]" class="w-full" />
              </UFormField>
              <UFormField label="Design style">
                <USelect value-key="value" v-model="selectedStyle" :items="[{ label: 'All styles', value: 'all' }, ...styleOptions.map(value => ({ label: value, value }))]" class="w-full" />
              </UFormField>
            </template>
          </div>
          <p class="mt-3 text-xs text-muted">Choose a client to browse its templates or create a copy of a shared default.</p>
        </section>
        <section v-if="showStarters && selectedMake === 'all'" class="space-y-4">
          <h2 class="text-sm font-semibold">XeroFlow defaults</h2>

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
              :aria-label="`Use ${starter.name} template`"
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
          <div v-else-if="!libraryError && !savedRows.length" class="text-sm text-muted py-8 text-center">
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
                    :aria-label="`${usesClientCopy(row) ? 'Create client copy of' : 'Edit'} ${row.name}`"
                    class="flex w-full flex-1 flex-col rounded-none p-0 text-left cursor-pointer whitespace-normal hover:bg-transparent"
                    @click="usesClientCopy(row) ? openCopyTemplate(row) : openComposer(row.id)"
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
                          v-if="row.folder_name?.trim()"
                          variant="subtle"
                          color="neutral"
                          size="xs"
                          :label="rowFolder(row)"
                        />
                      </div>
                      <UBadge v-if="templateSourceDetails(row.body_source)" :label="`${templateSourceDetails(row.body_source)?.make || 'Imported'} · ${isTemplateClientCopy(row.body_source) ? 'Client copy' : 'OEM source'} · Review required`" color="warning" variant="subtle" size="xs" class="mb-2" />
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
                    <UButton v-if="usesClientCopy(row)" :label="templateSourceDetails(row.body_source) ? 'Create client copy' : 'Use template'" icon="i-lucide-copy-plus" variant="ghost" color="neutral" size="xs" @click="openCopyTemplate(row)" />
                    <UButton
                      icon="i-lucide-pencil"
                      variant="ghost"
                      color="neutral"
                      size="xs"
                      :label="usesClientCopy(row) ? 'Edit original' : 'Edit'"
                      @click="openComposer(row.id)"
                    />
                    <UTooltip text="Template details"><UButton icon="i-lucide-info" aria-label="Template details" variant="ghost" color="neutral" size="xs" @click="openDetails(row)" /></UTooltip>
                    <UTooltip text="Export JSON"><UButton icon="i-lucide-download" aria-label="Export template JSON" variant="ghost" color="neutral" size="xs" :loading="busyId === row.id" @click="exportTemplate(row)" /></UTooltip>
                    <UTooltip text="Duplicate">
                      <UButton
                        icon="i-lucide-copy"
                        aria-label="Duplicate template"
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
                        aria-label="Rename template"
                        variant="ghost"
                        color="neutral"
                        size="xs"
                        @click="openRename(row)"
                      />
                    </UTooltip>
                    <UTooltip text="Delete">
                      <UButton
                        icon="i-lucide-trash-2"
                        aria-label="Delete template"
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

    <UModal v-model:open="showDetails" title="Template details" :ui="{ content: 'sm:max-w-2xl' }">
      <template #content>
        <div v-if="detailsTarget" class="max-h-[85svh] space-y-5 overflow-y-auto p-6">
          <div><h2 class="text-lg font-semibold">{{ detailsTarget.name }}</h2><p class="mt-1 text-sm text-muted">{{ detailsTarget.client_id ? clientName(detailsTarget.client_id) : 'Shared default' }} · {{ rowFolder(detailsTarget) }}</p></div>
          <template v-if="sourceDetails">
            <UAlert color="warning" title="Review before use" :description="usesClientCopy(detailsTarget) ? 'Recorded OEM source information is not a current campaign approval. Create a client copy, then check offers, dates, links and dealership details.' : 'This client copy retains its source information. Review offers, dates, links and dealership details before use.'" />
            <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
              <div><dt class="text-muted">Source</dt><dd>{{ sourceDetails.provider }} / {{ sourceDetails.make }}</dd></div>
              <div><dt class="text-muted">Imported</dt><dd>{{ sourceDetails.retrievedAt || 'Not recorded' }}</dd></div>
              <div><dt class="text-muted">Format</dt><dd>{{ sourceDetails.formatLabel }}</dd></div>
              <div><dt class="text-muted">Source asset</dt><dd class="break-all">{{ sourceDetails.assetId || 'Not recorded' }}</dd></div>
              <div v-if="sourceDetails.originalSha256" class="sm:col-span-2"><dt class="text-muted">Original file SHA-256</dt><dd class="break-all font-mono text-xs">{{ sourceDetails.originalSha256 }}</dd></div>
            </dl>
            <p v-if="sourceDetails.notes" class="text-sm leading-relaxed text-muted">{{ sourceDetails.notes }}</p>
            <p class="text-sm text-muted">HTML imports preserve the email design as an editable HTML block. The original portal's native editing fields are not included.</p>
            <UButton v-if="sourceDetails.sourceUrl" :to="sourceDetails.sourceUrl" target="_blank" rel="noopener noreferrer" label="Open source portal" icon="i-lucide-external-link" variant="outline" color="neutral" />
          </template>
          <p v-else class="text-sm text-muted">Export a portable JSON backup or create an independent client copy. The original is preserved when you create a copy.</p>
          <div class="flex flex-wrap justify-end gap-2 border-t border-default pt-4">
            <UButton label="Close" variant="ghost" color="neutral" @click="showDetails = false" />
            <UButton label="Export JSON" icon="i-lucide-download" variant="outline" :loading="busyId === detailsTarget.id" @click="exportTemplate(detailsTarget)" />
            <UButton :label="usesClientCopy(detailsTarget) ? 'Create client copy' : 'Edit template'" icon="i-lucide-copy-plus" @click="usesClientCopy(detailsTarget) ? openCopyTemplate(detailsTarget) : openComposer(detailsTarget.id)" />
          </div>
        </div>
      </template>
    </UModal>
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
