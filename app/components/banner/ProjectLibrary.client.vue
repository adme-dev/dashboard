<script setup lang="ts">
import type { BannerProject, BannerFolder } from '~/types/banner-studio'
import { bannerFolderPath, bannerFolderRows, bannerProjectFolderId, bannerProjectInFolder } from '~/utils/banner-folders'
import { isAmbiguousApiFailure } from '~/utils/apiError'
import { bannerDimensions, bannerLibraryFacets, filterBannerProjects, sortLibrary } from '~/utils/banner-library'
import type { LibrarySort } from '~/utils/banner-library'

const props = withDefaults(defineProps<{ fullScreen?: boolean }>(), { fullScreen: false })
const editorBase = computed(() => props.fullScreen ? '/creative/banner-studio' : '/agency/banner-studio')

const router = useRouter()
const toast = useToast()

const searchQuery = ref('')
const clientFilter = ref('all')
const browseTab = ref<'clients' | 'folders' | 'tags'>('clients')
const clientSearch = ref('')
const tagSearch = ref('')
const folderFilter = ref('all')
const folderSearch = ref('')
const expandedFolders = ref(new Set<string>())
const folderData = ref<BannerFolder[]>([])
const folderError = ref(false)
const tagFilter = ref('all')
const savedView = useCookie<'list' | 'grid'>('banner-library-view', { default: () => 'grid', sameSite: 'lax' })
const view = computed<'list' | 'grid'>({
  get: () => savedView.value === 'list' ? 'list' : 'grid',
  set: (value) => { savedView.value = value }
})
const sort = ref<LibrarySort>('modified')
const page = ref(1)
const pageSize = 36
const showImportModal = ref(false)
const statusFilter = ref<'all' | 'draft' | 'published'>('all')
const showDeleteModal = ref(false)
const deleteTarget = ref<BannerProject | null>(null)
const moveTarget = ref<BannerProject | null>(null)
const moveFolderId = ref('__unfiled__')
const moveBusy = ref(false)
const moveError = ref('')
const shareTarget = ref<BannerProject | null>(null)
const renameTarget = ref<BannerProject | null>(null)
const renameValue = ref('')
const renameBusy = ref(false)
const renameError = ref('')

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, headers?: Record<string, string> }
) => Promise<T>
const duplicateIdempotencyKeys = new Map<string, string>()
const projectsData = ref<BannerProject[]>([])
const fetchStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refresh() {
  fetchStatus.value = 'pending'
  folderError.value = false
  try {
    const [projects, folders] = await Promise.all([
      apiFetch<BannerProject[]>('/api/agency/banner-studio/projects'),
      apiFetch<BannerFolder[]>('/api/agency/banner-studio/folders').catch(() => {
        folderError.value = true
        return []
      })
    ])
    projectsData.value = projects
    folderData.value = folders
    fetchStatus.value = 'success'
  } catch {
    projectsData.value = []
    fetchStatus.value = 'error'
  }
}

onMounted(() => {
  void refresh()
})

const allProjects = computed(() => projectsData.value || [])

const clients = computed(() => {
  const records = new Map<string, { id: string, name: string, count: number }>()
  for (const project of allProjects.value) {
    const id = project.clientId || 'unassigned'
    const current = records.get(id)
    records.set(id, { id, name: project.clientId ? project.clientName || 'Unnamed client' : 'Unassigned', count: (current?.count || 0) + 1 })
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name))
})
const visibleClients = computed(() => clients.value.filter(client => client.id !== 'unassigned' && client.name.toLocaleLowerCase().includes(clientSearch.value.trim().toLocaleLowerCase())))
const unassignedCount = computed(() => clients.value.find(client => client.id === 'unassigned')?.count || 0)
const selectedClientName = computed(() => clients.value.find(client => client.id === clientFilter.value)?.name || 'Selected client')
const browseTabs = [
  { label: 'Clients', value: 'clients' },
  { label: 'Folders', value: 'folders' },
  { label: 'Tags', value: 'tags' }
]
const browseSearch = computed({
  get: () => browseTab.value === 'clients' ? clientSearch.value : browseTab.value === 'folders' ? folderSearch.value : tagSearch.value,
  set: (value: string) => {
    if (browseTab.value === 'clients') clientSearch.value = value
    else if (browseTab.value === 'folders') folderSearch.value = value
    else tagSearch.value = value
  }
})
const clientProjects = computed(() => filterBannerProjects(allProjects.value, { client: clientFilter.value, tag: 'all', status: 'all', search: '' }))
const facets = computed(() => bannerLibraryFacets(clientProjects.value))
const folderRows = computed(() => bannerFolderRows(folderData.value, expandedFolders.value, folderSearch.value))
const selectedFolderPath = computed(() => bannerFolderPath(folderData.value, folderFilter.value))
const folderOptions = computed(() => [{ label: 'Unfiled', value: '__unfiled__' }, ...folderData.value.map(folder => ({ label: bannerFolderPath(folderData.value, folder.id).map(part => part.name).join(' / '), value: folder.id }))])
const childFolders = computed(() => folderData.value.filter(f => f.parentId === (folderFilter.value === 'all' ? null : folderFilter.value)))
function toggleFolder(id: string) {
  const next = new Set(expandedFolders.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedFolders.value = next
}
const categories = computed(() => facets.value.categories)
const visibleCategories = computed(() => categories.value.filter(tag => tag.replace(/^category:/, '').toLocaleLowerCase().includes(tagSearch.value.trim().toLocaleLowerCase())))
const projects = computed(() => sortLibrary(filterBannerProjects(clientProjects.value, {
  client: 'all', tag: tagFilter.value, status: statusFilter.value, search: searchQuery.value
}).filter(p => bannerProjectInFolder(p, folderFilter.value, folderData.value)), sort.value))
const visibleProjects = computed(() => projects.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const libraryItems = computed(() => visibleProjects.value.map(p => ({
  id: p.id, name: p.name, clientId: p.clientId, client: p.clientName || (p.clientId ? 'Unnamed client' : 'Unassigned'),
  category: p.tags?.includes('import:needs-review') ? `${p.status} · Import needs review` : p.status, dimensions: bannerDimensions(p.canvasData), type: `${Object.keys(p.canvasData || {}).length} size${Object.keys(p.canvasData || {}).length === 1 ? '' : 's'} · Editable`,
  date: p.updatedAt || p.createdAt, thumbnailUrl: p.thumbnailUrl, canvasData: p.canvasData,
  to: `${editorBase.value}/${p.id}`
})))
const projectById = computed(() => new Map(allProjects.value.map(p => [p.id, p])))
watch([searchQuery, statusFilter, clientFilter, folderFilter, tagFilter, sort], () => {
  page.value = 1
})
watch(clientFilter, () => {
  folderFilter.value = 'all'
  tagFilter.value = 'all'
})
watch(projects, (list) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(list.length / pageSize)))
})
const sortItems = [
  { label: 'Recently modified', value: 'modified' },
  { label: 'Name A–Z', value: 'name' },
  { label: 'Oldest modified', value: 'oldest' }
]

function newProject() {
  router.push({ path: `${editorBase.value}/new`, query: selectedFolderPath.value.length ? { folder: folderFilter.value } : {} })
}

function editProject(p: BannerProject) {
  router.push(`${editorBase.value}/${p.id}`)
}

function moveProject(p: BannerProject) {
  moveTarget.value = p
  moveFolderId.value = bannerProjectFolderId(p, folderData.value) || '__unfiled__'
  moveError.value = ''
}

function renameProject(p: BannerProject) {
  renameTarget.value = p
  renameValue.value = p.name
  renameError.value = ''
}

async function saveProjectName() {
  if (!renameTarget.value || renameBusy.value) return
  renameBusy.value = true
  renameError.value = ''
  try {
    const saved = await apiFetch<{ id: string, name: string }>(`/api/agency/banner-studio/projects/${renameTarget.value.id}/rename`, { method: 'PATCH', body: { name: renameValue.value.trim() } })
    if (saved.id !== renameTarget.value.id || saved.name !== renameValue.value.trim()) throw new Error('The new name could not be verified')
    renameTarget.value = null
    toast.add({ title: 'Banner renamed', color: 'success' })
    await refresh()
  } catch (cause) {
    renameError.value = cause instanceof Error ? cause.message : 'Could not rename banner'
  } finally {
    renameBusy.value = false
  }
}

async function saveProjectFolder() {
  if (!moveTarget.value || moveBusy.value) return
  moveBusy.value = true
  moveError.value = ''
  try {
    const folderId = moveFolderId.value === '__unfiled__' ? null : moveFolderId.value
    if (folderId && !folderData.value.some(folder => folder.id === folderId)) throw new Error('Choose an existing folder')
    const saved = await apiFetch<{ id: string, folderId: string | null }>(`/api/agency/banner-studio/projects/${moveTarget.value.id}/folder`, { method: 'PATCH', body: { folderId } })
    if (saved.id !== moveTarget.value.id || saved.folderId !== folderId) throw new Error('The folder change could not be verified')
    toast.add({ title: 'Moved banner', description: folderId ? `Saved in ${bannerFolderPath(folderData.value, folderId).map(part => part.name).join(' / ')}` : 'Saved in Unfiled', color: 'success' })
    moveTarget.value = null
    await refresh()
  } catch (cause) {
    moveError.value = cause instanceof Error ? cause.message : 'Could not move banner'
  } finally {
    moveBusy.value = false
  }
}

async function duplicateProject(p: BannerProject) {
  const idempotencyKey = duplicateIdempotencyKeys.get(p.id) || crypto.randomUUID()
  duplicateIdempotencyKeys.set(p.id, idempotencyKey)
  try {
    await apiFetch<{ project: BannerProject }>('/api/agency/banner-studio/projects', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        name: `${p.name} (copy)`,
        clientId: p.clientId,
        folderId: p.folderId,
        canvasData: p.canvasData,
        status: 'draft'
      }
    })
    duplicateIdempotencyKeys.delete(p.id)
    toast.add({ title: 'Duplicated', description: `${p.name} copied`, color: 'success' })
    await refresh()
  } catch (error) {
    if (!isAmbiguousApiFailure(error)) duplicateIdempotencyKeys.delete(p.id)
    toast.add({ title: 'Error', description: 'Failed to duplicate project', color: 'error' })
  }
}

function confirmDelete(p: BannerProject) {
  deleteTarget.value = p
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await apiFetch(`/api/agency/banner-studio/projects/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `${deleteTarget.value.name} removed`, color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete project', color: 'error' })
  }
}

const statusItems = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' }
]

const dropdownItems = (p: BannerProject) => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => editProject(p) },
    { label: 'Share', icon: 'i-lucide-share-2', onSelect: () => { shareTarget.value = p } },
    { label: 'Move to folder', icon: 'i-lucide-folder-input', onSelect: () => moveProject(p) },
    { label: 'Rename', icon: 'i-lucide-pencil-line', onSelect: () => renameProject(p) },
    { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => duplicateProject(p) }
  ],
  [
    { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(p) }
  ]
]

const hasActiveFilters = computed(() => statusFilter.value !== 'all' || searchQuery.value.length > 0 || clientFilter.value !== 'all' || folderFilter.value !== 'all' || tagFilter.value !== 'all')

function clearFilters() {
  searchQuery.value = ''
  folderSearch.value = ''
  clientSearch.value = ''
  tagSearch.value = ''
  statusFilter.value = 'all'
  clientFilter.value = 'all'
  folderFilter.value = 'all'
  tagFilter.value = 'all'
}
</script>

<template>
  <div class="flex min-h-0 w-full flex-col bg-default text-default" :class="fullScreen ? 'h-dvh' : 'h-full'">
    <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-default px-4 py-4 sm:px-6">
      <div class="flex items-center gap-3">
        <UButton
          v-if="fullScreen"
          to="https://creative.xeroflow.io/"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="ghost"
          aria-label="Back to Creative Suite"
        />
        <div>
          <h1 class="text-xl font-semibold">
            Banner Studio
          </h1>
          <p class="mt-0.5 text-xs text-muted">
            Your client banner library
          </p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <BannerThemeToggle />
        <UButton
          to="/agency/banner-studio/custom-templates"
          color="neutral"
          variant="ghost"
          icon="i-lucide-code"
          size="sm"
        >
          Custom HTML
        </UButton>
        <UButton
          to="/agency/banner-studio/templates"
          color="neutral"
          variant="outline"
          icon="i-lucide-layout-template"
          size="sm"
        >
          Templates
        </UButton>
        <UButton
          to="/agency/banner-studio/brand-kits"
          color="neutral"
          variant="ghost"
          icon="i-lucide-palette"
          size="sm"
        >
          Brand Kits
        </UButton>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          size="sm"
          @click="() => { showImportModal = true }"
        >
          Import from TheBrief
        </UButton>
        <UButton
          v-if="!fullScreen"
          to="/creative/banner-studio"
          color="neutral"
          variant="outline"
          icon="i-lucide-expand"
          size="sm"
        >
          Open full screen
        </UButton>
        <UButton icon="i-lucide-plus" size="sm" @click="newProject">
          New Project
        </UButton>
      </div>
    </header>

    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside class="flex h-64 min-h-0 shrink-0 flex-col border-b border-default bg-elevated/30 md:h-auto md:w-64 md:border-r md:border-b-0" aria-label="Banner library filters">
        <div class="shrink-0 space-y-3 border-b border-default p-3">
          <UTabs
            v-model="browseTab"
            :items="browseTabs"
            :content="false"
            size="sm"
            aria-label="Browse library by"
            :ui="{ list: 'w-full', trigger: 'flex-1 gap-1 px-2 text-xs' }"
          />
          <UFormField :label="`Search ${browseTab}`" :ui="{ label: 'sr-only' }">
            <UInput
              v-model="browseSearch"
              :placeholder="`Search ${browseTab}`"
              icon="i-lucide-search"
              size="sm"
              class="w-full"
            >
              <template v-if="browseSearch" #trailing>
                <UButton
                  icon="i-lucide-x"
                  :aria-label="`Clear ${browseTab} search`"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  @click="browseSearch = ''"
                />
              </template>
            </UInput>
          </UFormField>
          <div v-if="browseTab === 'clients'" class="space-y-0.5">
            <UButton
              label="All clients"
              icon="i-lucide-users"
              :aria-pressed="clientFilter === 'all'"
              :variant="clientFilter === 'all' ? 'soft' : 'ghost'"
              color="neutral"
              class="w-full justify-start"
              @click="clientFilter = 'all'"
            >
              <template #trailing>
                <span class="ml-auto shrink-0 text-xs tabular-nums text-muted">{{ allProjects.length }}</span>
              </template>
            </UButton>
            <UButton
              v-if="unassignedCount"
              label="Unassigned"
              icon="i-lucide-inbox"
              :aria-pressed="clientFilter === 'unassigned'"
              :variant="clientFilter === 'unassigned' ? 'soft' : 'ghost'"
              color="neutral"
              class="w-full justify-start"
              @click="clientFilter = 'unassigned'"
            >
              <template #trailing>
                <span class="ml-auto shrink-0 text-xs tabular-nums text-muted">{{ unassignedCount }}</span>
              </template>
            </UButton>
          </div>
          <UButton
            v-else-if="browseTab === 'folders'"
            label="All folders"
            icon="i-lucide-folders"
            :aria-pressed="folderFilter === 'all'"
            :variant="folderFilter === 'all' ? 'soft' : 'ghost'"
            color="neutral"
            class="w-full justify-start"
            @click="folderFilter = 'all'"
          />
          <UButton
            v-else
            label="All tags"
            icon="i-lucide-tags"
            :aria-pressed="tagFilter === 'all'"
            :variant="tagFilter === 'all' ? 'soft' : 'ghost'"
            color="neutral"
            class="w-full justify-start"
            @click="tagFilter = 'all'"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" :aria-label="`${browseTab} list`">
          <template v-if="browseTab === 'clients'">
            <UButton
              v-for="client in visibleClients"
              :key="client.id"
              :label="client.name"
              :title="client.name"
              :variant="clientFilter === client.id ? 'soft' : 'ghost'"
              :aria-pressed="clientFilter === client.id"
              color="neutral"
              class="min-h-9 w-full items-start justify-start px-2.5 py-2 text-left text-[13px]"
              :ui="{ label: 'min-w-0 whitespace-normal break-words leading-5' }"
              @click="clientFilter = client.id"
            >
              <template #trailing>
                <span class="ml-auto shrink-0 pl-2 text-xs leading-5 tabular-nums text-muted">{{ client.count }}</span>
              </template>
            </UButton>
            <p v-if="fetchStatus === 'success' && !visibleClients.length" class="px-2.5 py-4 text-sm text-muted">
              {{ clientSearch.trim() ? 'No matching clients. Try another name.' : 'Client projects will appear here.' }}
            </p>
          </template>

          <template v-else-if="browseTab === 'folders'">
            <UAlert
              v-if="folderError"
              title="Folders unavailable"
              description="Try loading the folders again."
              color="warning"
              variant="subtle"
              :actions="[{ label: 'Retry', onClick: refresh }]"
              class="mb-2"
            />
            <div
              v-for="row in folderRows"
              :key="row.folder.id"
              class="flex min-w-0 items-start"
              :style="{ paddingLeft: `${row.depth * 12}px` }"
            >
              <UButton
                v-if="row.hasChildren"
                :icon="expandedFolders.has(row.folder.id) || folderSearch.trim() ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                :aria-label="`${expandedFolders.has(row.folder.id) || folderSearch.trim() ? 'Collapse' : 'Expand'} ${row.folder.name}`"
                :aria-expanded="!!folderSearch.trim() || expandedFolders.has(row.folder.id)"
                :disabled="!!folderSearch.trim()"
                color="neutral"
                variant="ghost"
                size="xs"
                class="mt-1.5 shrink-0"
                @click="toggleFolder(row.folder.id)"
              />
              <span v-else class="w-6 shrink-0" />
              <UButton
                :label="row.folder.name"
                :title="row.folder.name"
                icon="i-lucide-folder"
                :aria-pressed="folderFilter === row.folder.id"
                :variant="folderFilter === row.folder.id ? 'soft' : 'ghost'"
                color="neutral"
                class="min-h-9 min-w-0 flex-1 items-start justify-start py-2 text-left text-[13px]"
                :ui="{ label: 'min-w-0 whitespace-normal break-words leading-5', leadingIcon: 'mt-0.5 shrink-0' }"
                @click="folderFilter = row.folder.id"
              />
            </div>
            <p v-if="!folderError && fetchStatus === 'success' && !folderRows.length" class="px-2.5 py-4 text-sm text-muted">
              {{ folderSearch.trim() ? 'No matching folders. Try another name.' : 'No folders yet.' }}
            </p>
          </template>

          <template v-else>
            <UButton
              v-for="tag in visibleCategories"
              :key="tag"
              :label="tag.replace(/^category:/, '')"
              :title="tag.replace(/^category:/, '')"
              :variant="tagFilter === tag ? 'soft' : 'ghost'"
              :aria-pressed="tagFilter === tag"
              color="neutral"
              class="min-h-9 w-full justify-start py-2 text-left text-[13px]"
              :ui="{ label: 'min-w-0 whitespace-normal break-words leading-5' }"
              @click="tagFilter = tag"
            />
            <p v-if="!visibleCategories.length" class="px-2.5 py-4 text-sm text-muted">
              {{ tagSearch.trim() ? 'No matching tags. Try another name.' : 'No tags for this client.' }}
            </p>
          </template>
        </div>
      </aside>

      <main class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex shrink-0 flex-wrap items-end gap-3 border-b border-default p-4">
          <UFormField label="Search banners" class="min-w-40 flex-1">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Name, client, tag or dimensions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="statusFilter" :items="statusItems" class="w-32" />
          </UFormField>
          <UFormField label="Sort">
            <USelect v-model="sort" :items="sortItems" class="w-44" />
          </UFormField>
          <div class="flex gap-1" role="group" aria-label="Library view">
            <UButton
              icon="i-lucide-list"
              aria-label="List view"
              :aria-pressed="view === 'list'"
              :variant="view === 'list' ? 'soft' : 'ghost'"
              color="neutral"
              @click="() => { view = 'list' }"
            />
            <UButton
              icon="i-lucide-layout-grid"
              aria-label="Grid view"
              :aria-pressed="view === 'grid'"
              :variant="view === 'grid' ? 'soft' : 'ghost'"
              color="neutral"
              @click="() => { view = 'grid' }"
            />
          </div>
        </div>
        <div v-if="clientFilter !== 'all' || folderFilter !== 'all' || tagFilter !== 'all'" class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default px-4 py-2" aria-label="Active library filters">
          <UButton
            v-if="clientFilter !== 'all'"
            :label="selectedClientName"
            :aria-label="`Clear client filter: ${selectedClientName}`"
            icon="i-lucide-users"
            trailing-icon="i-lucide-x"
            color="neutral"
            variant="soft"
            size="xs"
            @click="clientFilter = 'all'"
          />
          <UButton
            v-if="folderFilter !== 'all'"
            :label="selectedFolderPath.at(-1)?.name || 'Selected folder'"
            :aria-label="`Clear folder filter: ${selectedFolderPath.at(-1)?.name || 'Selected folder'}`"
            icon="i-lucide-folder"
            trailing-icon="i-lucide-x"
            color="neutral"
            variant="soft"
            size="xs"
            @click="folderFilter = 'all'"
          />
          <UButton
            v-if="tagFilter !== 'all'"
            :label="tagFilter.replace(/^category:/, '')"
            :aria-label="`Clear tag filter: ${tagFilter.replace(/^category:/, '')}`"
            icon="i-lucide-tag"
            trailing-icon="i-lucide-x"
            color="neutral"
            variant="soft"
            size="xs"
            @click="tagFilter = 'all'"
          />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <nav v-if="selectedFolderPath.length" aria-label="Folder breadcrumb" class="mb-4 flex flex-wrap items-center gap-1">
            <UButton
              label="All folders"
              variant="link"
              color="neutral"
              size="xs"
              @click="folderFilter = 'all'"
            />
            <template v-for="folder in selectedFolderPath" :key="folder.id">
              <UIcon name="i-lucide-chevron-right" class="size-3 text-muted" />
              <UButton
                :label="folder.name"
                variant="link"
                color="neutral"
                size="xs"
                @click="folderFilter = folder.id"
              />
            </template>
          </nav>
          <div v-if="selectedFolderPath.length && childFolders.length && !searchQuery" class="mb-5 grid grid-cols-1 gap-2 @container">
            <UButton
              v-for="folder in childFolders"
              :key="folder.id"
              :label="folder.name"
              icon="i-lucide-folder"
              color="neutral"
              variant="outline"
              class="justify-start"
              @click="folderFilter = folder.id"
            />
          </div>
          <div class="mb-4 flex items-center justify-between gap-2">
            <p class="text-xs text-muted" role="status">
              {{ projects.length }} project{{ projects.length === 1 ? '' : 's' }}
            </p>
            <UButton
              v-if="hasActiveFilters"
              label="Clear filters"
              variant="ghost"
              color="neutral"
              size="xs"
              icon="i-lucide-x"
              @click="clearFilters"
            />
          </div>
          <div
            v-if="fetchStatus === 'pending'"
            class="space-y-3"
            aria-label="Loading projects"
            aria-busy="true"
          >
            <USkeleton v-for="n in 6" :key="n" class="h-20 w-full" />
          </div>
          <UAlert
            v-else-if="fetchStatus === 'error'"
            title="Could not load your banners"
            description="Try loading the library again."
            color="error"
            icon="i-lucide-circle-alert"
            :actions="[{ label: 'Retry', onClick: refresh }]"
          />
          <BannerLibraryItems
            v-else-if="projects.length"
            :items="libraryItems"
            :view="view"
            context-label="Client"
          >
            <template #actions="{ id }">
              <UDropdownMenu :items="dropdownItems(projectById.get(id)!)">
                <UButton
                  icon="i-lucide-more-horizontal"
                  :aria-label="`Actions for ${projectById.get(id)?.name}`"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                />
              </UDropdownMenu>
            </template>
          </BannerLibraryItems>
          <div v-else class="py-16 text-center">
            <UIcon name="i-lucide-images" class="mb-3 size-8 text-muted" />
            <h2 class="font-semibold">
              {{ selectedFolderPath.length && !searchQuery ? 'No banners in this folder yet' : hasActiveFilters ? 'No matching banners' : 'Your banner library starts here' }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ selectedFolderPath.length && !searchQuery ? 'The folder is ready. Create a banner here or import its designs from TheBrief.' : hasActiveFilters ? 'Try a different client, folder or search.' : 'Create a project or import a design from TheBrief.' }}
            </p>
            <UButton
              v-if="hasActiveFilters"
              class="mt-4"
              variant="outline"
              color="neutral"
              @click="clearFilters"
            >
              Clear filters
            </UButton>
            <UButton
              v-else
              class="mt-4"
              icon="i-lucide-plus"
              @click="newProject"
            >
              New Project
            </UButton>
          </div>
          <UPagination
            v-if="projects.length > pageSize"
            v-model:page="page"
            :items-per-page="pageSize"
            :total="projects.length"
            class="mt-6 flex justify-center"
          />
        </div>
      </main>
    </div>
    <BannerTheBriefImportModal v-model:open="showImportModal" @imported="refresh" />
    <BannerProjectShareModal :open="!!shareTarget" :project="shareTarget" @update:open="value => { if (!value) shareTarget = null }" />
    <UModal
      :open="!!renameTarget"
      title="Rename banner"
      :description="renameTarget?.name"
      @update:open="value => { if (!value && !renameBusy) renameTarget = null }"
    >
      <template #body>
        <UFormField label="Banner name">
          <UInput
            v-model="renameValue"
            class="w-full"
            :disabled="renameBusy"
            @keydown.enter="saveProjectName"
          />
        </UFormField>
        <UAlert
          v-if="renameError"
          color="error"
          variant="subtle"
          title="Could not rename banner"
          :description="renameError"
          class="mt-3"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="renameBusy"
            @click="renameTarget = null"
          >
            Cancel
          </UButton>
          <UButton :loading="renameBusy" :disabled="renameBusy || !renameValue.trim() || renameValue.trim().length > 200" @click="saveProjectName">
            Save name
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal
      :open="!!moveTarget"
      title="Move banner"
      :description="moveTarget?.name"
      @update:open="value => { if (!value && !moveBusy) moveTarget = null }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Folder" help="Moving changes where the banner appears. Its client and artwork stay with the project.">
            <USelectMenu
              v-model="moveFolderId"
              :items="folderOptions"
              value-key="value"
              class="w-full"
              :disabled="moveBusy"
            />
          </UFormField>
          <UAlert
            v-if="moveError"
            color="error"
            variant="subtle"
            title="Could not move banner"
            :description="moveError"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="moveBusy"
            @click="moveTarget = null"
          >
            Cancel
          </UButton>
          <UButton :loading="moveBusy" :disabled="moveBusy" @click="saveProjectFolder">
            Move banner
          </UButton>
        </div>
      </template>
    </UModal>
    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)] mb-2">
            Delete Project
          </h3>
          <p class="text-sm text-[var(--ui-text-muted)] mb-6">
            Are you sure you want to delete <span class="font-medium text-[var(--ui-text)]">"{{ deleteTarget?.name }}"</span>? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              variant="outline"
              color="neutral"
              @click="() => { showDeleteModal = false }"
            />
            <UButton label="Delete" color="error" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
