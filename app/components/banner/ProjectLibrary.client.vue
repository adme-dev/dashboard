<script setup lang="ts">
import type { BannerProject, BannerProjectSummary, BannerFolder } from '~/types/banner-studio'
import { indexBannerFolders, bannerFolderRouteId, bannerFolderRows, bannerFolderUrl, bannerProjectFolderId } from '~/utils/banner-folders'
import { apiErrorDescription, isAmbiguousApiFailure } from '~/utils/apiError'
import { bannerDimensions, bannerLibraryFacets, filterBannerProjects, sortLibrary, theBriefCreatedDate } from '~/utils/banner-library'
import { rememberFirstPoster } from '~/utils/banner-poster-preload'
import type { LibrarySort } from '~/utils/banner-library'

type CardDetails = Pick<BannerProjectSummary, 'id' | 'thumbnailUrl' | 'formats'>
type CatalogProject = Omit<BannerProjectSummary, 'formats'> & { formats?: string[] }

const props = withDefaults(defineProps<{ fullScreen?: boolean }>(), { fullScreen: false })
const editorBase = computed(() => props.fullScreen ? '/creative/banner-studio' : '/agency/banner-studio')

const router = useRouter()
const toast = useToast()

const searchQuery = ref('')
const route = useRoute()
const inFolders = computed(() => route.path === `${editorBase.value}/folders` || route.path.startsWith(`${editorBase.value}/folders/`))
const folderFilter = computed(() => inFolders.value ? bannerFolderRouteId(route.params.trail) : 'all')
const browseTab = computed<'clients' | 'folders' | 'tags'>({
  get: () => route.query.tab === 'tags' || route.query.tab === 'clients' ? route.query.tab : inFolders.value ? 'folders' : 'clients',
  set(tab) {
    const path = folderFilter.value === 'all' ? editorBase.value + (tab === 'folders' ? '/folders' : '') : route.path
    void router.push({ path, query: { ...route.query, tab: tab === 'folders' || (tab === 'clients' && path === editorBase.value) ? undefined : tab } })
  }
})
const clientSearch = ref('')
const tagSearch = ref('')
const folderEditor = ref<{ action: 'add' | 'rename' | 'move', folder?: BannerFolder } | null>(null)
const trashTarget = ref<BannerFolder | null>(null)
const trashBusy = ref(false)
const trashError = ref('')
const showBin = ref(false)
const canManageFolders = ref(false)
const pinnedIds = ref<string[]>([])
const pinBusy = ref(false)
const pinsExpanded = ref(true)
const folderSearch = ref('')
const expandedFolders = ref(new Set<string>())
const folderData = shallowRef<BannerFolder[]>([])
const folderError = ref(false)
const foldersLoaded = ref(false)
const folderIndex = computed(() => indexBannerFolders(folderData.value))
const clientFilter = computed(() => typeof route.query.client === 'string' ? route.query.client : 'all')
const tagFilter = computed(() => typeof route.query.tag === 'string' ? route.query.tag : 'all')
function selectClient(id: string) {
  const path = browseTab.value === 'folders' ? editorBase.value + '/folders' : editorBase.value
  void router.push({ path, query: { ...route.query, client: id === 'all' ? undefined : id, tag: undefined, tab: browseTab.value === 'tags' ? 'tags' : undefined } })
}
function selectTag(tag: string) {
  void router.push({ path: route.path, query: { ...route.query, tag: tag === 'all' ? undefined : tag } })
}
const savedView = useCookie<'list' | 'grid'>('banner-library-view', { default: () => 'list', sameSite: 'lax' })
const view = computed<'list' | 'grid'>({
  get: () => savedView.value === 'grid' ? 'grid' : 'list',
  set: (value) => { savedView.value = value }
})
const sort = ref<LibrarySort>('modified')
const page = ref(1)
const pageSize = 36
const showImportModal = ref(false)
const importToolsLoaded = ref(false)
watch(showImportModal, (open) => {
  if (open) importToolsLoaded.value = true
})
const statusFilter = ref<'all' | 'draft' | 'published'>('all')
const showDeleteModal = ref(false)
const deleteTarget = ref<CatalogProject | null>(null)
const moveTarget = ref<CatalogProject | null>(null)
const moveFolderId = ref('__unfiled__')
const moveBusy = ref(false)
const moveError = ref('')
const shareTarget = ref<CatalogProject | null>(null)
const downloadTarget = ref<CatalogProject | null>(null)
const renameTarget = ref<CatalogProject | null>(null)
const renameValue = ref('')
const renameBusy = ref(false)
const renameError = ref('')

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, headers?: Record<string, string>, signal?: AbortSignal }
) => Promise<T>
const duplicateIdempotencyKeys = new Map<string, string>()
const projectsData = shallowRef<CatalogProject[]>([])
const details = shallowRef(new Map<string, CardDetails>())
const dimensions = shallowRef<Map<string, string[]> | null>(null)
const detailError = ref(false)
const dimensionError = ref(false)
let catalogRequest = 0
let folderRequest = 0
const fetchStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

async function refreshFolders() {
  const request = ++folderRequest
  try {
    const result = await apiFetch<{ folders: BannerFolder[], pinnedIds: string[], canManage: boolean }>('/api/agency/banner-studio/folders?view=library')
    if (request !== folderRequest) return false
    foldersLoaded.value = true
    folderData.value = result.folders
    pinnedIds.value = result.pinnedIds
    canManageFolders.value = result.canManage
    folderError.value = false
    return true
  } catch {
    if (request === folderRequest) folderError.value = true
    return false
  }
}

async function refresh() {
  const request = ++catalogRequest
  void refreshFolders()
  fetchStatus.value = 'pending'
  try {
    const projects = await apiFetch<CatalogProject[]>('/api/agency/banner-studio/projects?view=catalog')
    if (request !== catalogRequest) return
    details.value = new Map()
    dimensions.value = null
    projectsData.value = projects
    fetchStatus.value = 'success'
  } catch {
    if (request !== catalogRequest) return
    projectsData.value = []
    fetchStatus.value = 'error'
  }
}

onMounted(() => {
  void refresh()
})

const searching = computed(() => !!searchQuery.value.trim())
// Dimension search covers the entire catalog, including projects on other pages.
watch([projectsData, searching], async ([catalog, active], _, onCleanup) => {
  dimensionError.value = false
  if (!active || !catalog.length || dimensions.value) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const rows = await apiFetch<Pick<BannerProjectSummary, 'id' | 'formats'>[]>('/api/agency/banner-studio/projects?view=dimensions', { signal: controller.signal })
    if (!controller.signal.aborted) dimensions.value = new Map(rows.map(row => [row.id, row.formats]))
  } catch {
    if (!controller.signal.aborted) dimensionError.value = true
  }
})
const allProjects = computed(() => {
  const sizes = searching.value && dimensions.value
  return sizes ? projectsData.value.map(p => ({ ...p, formats: sizes.get(p.id) })) : projectsData.value
})

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
const folderRows = computed(() => bannerFolderRows(folderData.value, expandedFolders.value, folderSearch.value, folderIndex.value))
const selectedFolderPath = computed(() => folderIndex.value.path(folderFilter.value))
const folderOptions = computed(() => [{ label: 'Unfiled', value: '__unfiled__' }, ...folderData.value.map(folder => ({ label: folderIndex.value.path(folder.id).map(part => part.name).join(' / '), value: folder.id }))])
const childFolders = computed(() => folderIndex.value.children.get(folderFilter.value === 'all' ? null : folderFilter.value) || [])
const visiblePins = computed(() => folderData.value.filter(folder => pinnedIds.value.includes(folder.id)
  && folderIndex.value.path(folder.id).map(f => f.name).join(' / ').toLowerCase().includes(folderSearch.value.trim().toLowerCase())))

function folderLink(id: string) {
  return { path: bannerFolderUrl(editorBase.value, folderIndex.value.path(id)), query: { ...route.query, tab: undefined } }
}
function clearFolder() {
  const path = browseTab.value === 'folders' ? editorBase.value + '/folders' : editorBase.value
  void router.push({ path, query: { ...route.query, tab: browseTab.value === 'tags' ? 'tags' : undefined } })
}

watch([() => route.path, selectedFolderPath], ([, path]) => {
  if (!path.length || !inFolders.value) return
  for (const folder of path.slice(0, -1)) expandedFolders.value.add(folder.id)
  const canonical = bannerFolderUrl(editorBase.value, path)
  if (route.path !== canonical) void router.replace({ path: canonical, query: route.query })
})

async function folderSaved(id: string) {
  const action = folderEditor.value?.action
  folderEditor.value = null
  toast.add({ title: action === 'move' ? 'Folder moved' : action === 'rename' ? 'Folder renamed' : 'Folder added', color: 'success' })
  if (await refreshFolders()) {
    folderSearch.value = ''
    await router.push(folderLink(id))
  }
}

async function setPinned(folder: BannerFolder, pinned: boolean) {
  if (pinBusy.value) return
  pinBusy.value = true
  try {
    await apiFetch(`/api/agency/banner-studio/folders/${folder.id}/pin`, { method: 'PUT', body: { pinned } })
    pinnedIds.value = [...pinnedIds.value.filter(id => id !== folder.id), ...(pinned ? [folder.id] : [])]
    if (pinned) pinsExpanded.value = true
  } catch (cause) {
    toast.add({ title: 'Could not update pinned folders', description: apiErrorDescription(cause), color: 'error' })
  } finally {
    pinBusy.value = false
  }
}

const trashSubfolders = computed(() => trashTarget.value ? Math.max(0, folderIndex.value.subtree(trashTarget.value.id).size - 1) : 0)

async function trashFolder() {
  if (!trashTarget.value || trashBusy.value) return
  trashBusy.value = true
  trashError.value = ''
  try {
    const id = trashTarget.value.id
    await apiFetch(`/api/agency/banner-studio/folders/${id}`, { method: 'PATCH', body: { binned: true } })
    if (selectedFolderPath.value.some(f => f.id === id)) await router.replace(folderLink('all'))
    trashTarget.value = null
    await refresh()
    toast.add({ title: 'Folder moved to recycling bin', color: 'success' })
  } catch (cause) {
    trashError.value = apiErrorDescription(cause, 'Could not move folder to recycling bin')
  } finally { trashBusy.value = false }
}

function folderMenu(folder: BannerFolder) {
  const pinned = pinnedIds.value.includes(folder.id)
  return [
    ...(canManageFolders.value ? [
      { label: 'Add folder', icon: 'i-lucide-folder-plus', onSelect: () => { folderEditor.value = { action: 'add', folder } } },
      { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => { folderEditor.value = { action: 'rename', folder } } },
      { label: 'Move folder', icon: 'i-lucide-folder-input', onSelect: () => { folderEditor.value = { action: 'move', folder } } }
    ] : []),
    { label: pinned ? 'Unpin folder' : 'Pin folder', icon: pinned ? 'i-lucide-pin-off' : 'i-lucide-pin', disabled: pinBusy.value, onSelect: () => setPinned(folder, !pinned) },
    ...(canManageFolders.value
      ? [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const,
          onSelect: () => { trashError.value = ''; trashTarget.value = folder } }]
      : [])
  ]
}

function toggleFolder(id: string) {
  const next = new Set(expandedFolders.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedFolders.value = next
}
const categories = computed(() => facets.value.categories)
const visibleCategories = computed(() => categories.value.filter(tag => tag.replace(/^category:/, '').toLocaleLowerCase().includes(tagSearch.value.trim().toLocaleLowerCase())))
const selectedFolderIds = computed(() => folderIndex.value.subtree(folderFilter.value))
const projects = computed(() => {
  const filtered = filterBannerProjects(clientProjects.value, {
    client: 'all', tag: tagFilter.value, status: statusFilter.value, search: searchQuery.value, includeDimensions: !!dimensions.value
  })
  if (folderFilter.value === 'all') return sortLibrary(filtered, sort.value)
  const inFolder = filtered.filter(p => folderFilter.value === 'unfiled' ? !p.folderId : !!p.folderId && selectedFolderIds.value.has(p.folderId))
  return sortLibrary(inFolder, sort.value)
})
const visibleProjects = computed(() => projects.value.slice((page.value - 1) * pageSize, page.value * pageSize))
watch(visibleProjects, async (visible, _, onCleanup) => {
  detailError.value = false
  const missing = visible.filter(p => !details.value.has(p.id))
  if (!missing.length) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const ids = missing.map(p => p.id).join(',')
    const rows = await apiFetch<CardDetails[]>(`/api/agency/banner-studio/projects?view=cards&ids=${ids}`, { signal: controller.signal })
    if (controller.signal.aborted) return
    const updated = new Map(details.value)
    for (const row of rows) updated.set(row.id, row)
    details.value = updated
  } catch {
    if (!controller.signal.aborted) detailError.value = true
  }
})
const libraryItems = computed(() => visibleProjects.value.map((p) => {
  const detail = details.value.get(p.id)
  const formats = detail?.formats || p.formats
  return {
    id: p.id, name: p.name, clientId: p.clientId, client: p.clientName || (p.clientId ? 'Unnamed client' : 'Unassigned'),
    category: p.tags?.includes('import:needs-review') ? `${p.status} · Import needs review` : p.status,
    dimensions: formats ? bannerDimensions(undefined, formats) : '',
    type: formats ? `${formats.length} size${formats.length === 1 ? '' : 's'} · Editable` : 'Editable',
    date: p.updatedAt || p.createdAt, thumbnailUrl: detail?.thumbnailUrl, projectId: p.id, previewVersion: p.updatedAt, hasLayouts: formats ? formats.length > 0 : true,
    sourceCreatedDate: p.tags?.includes('source:thebrief') ? theBriefCreatedDate(p.tags) : undefined,
    to: `${editorBase.value}/${p.id}`
  }
}))
watch([() => libraryItems.value[0], view], ([first, layout]) => {
  if (inFolders.value && first?.hasLayouts) {
    rememberFirstPoster(location.pathname + location.search, layout, first.id, first.previewVersion)
  }
})
const projectById = computed(() => new Map(visibleProjects.value.map(p => [p.id, p])))
watch([searchQuery, statusFilter, clientFilter, folderFilter, tagFilter, sort], () => {
  page.value = 1
})
watch(projects, (list) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(list.length / pageSize)))
})
const loadingProjects = computed(() => {
  if (fetchStatus.value !== 'success') return fetchStatus.value !== 'error'
  if (folderFilter.value !== 'all' && !foldersLoaded.value && !folderError.value) return true
  return searching.value && !dimensions.value && !dimensionError.value && !projects.value.length && allProjects.value.length > 0
})
const sortItems = [
  { label: 'Recently modified', value: 'modified' },
  { label: 'Oldest created', value: 'created' },
  { label: 'Name A–Z', value: 'name' },
  { label: 'Oldest modified', value: 'oldest' }
]

function newProject() {
  router.push({ path: `${editorBase.value}/new`, query: selectedFolderPath.value.length ? { folder: folderFilter.value } : {} })
}

function editProject(p: CatalogProject) {
  router.push(`${editorBase.value}/${p.id}`)
}

function moveProject(p: CatalogProject) {
  moveTarget.value = p
  moveFolderId.value = bannerProjectFolderId(p, folderData.value) || '__unfiled__'
  moveError.value = ''
}

function renameProject(p: CatalogProject) {
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
    toast.add({ title: 'Moved banner', description: folderId ? `Saved in ${folderIndex.value.path(folderId).map(part => part.name).join(' / ')}` : 'Saved in Unfiled', color: 'success' })
    moveTarget.value = null
    await refresh()
  } catch (cause) {
    moveError.value = cause instanceof Error ? cause.message : 'Could not move banner'
  } finally {
    moveBusy.value = false
  }
}

async function duplicateProject(p: CatalogProject) {
  const idempotencyKey = duplicateIdempotencyKeys.get(p.id) || crypto.randomUUID()
  duplicateIdempotencyKeys.set(p.id, idempotencyKey)
  try {
    const source = await apiFetch<BannerProject>(`/api/agency/banner-studio/projects/${p.id}`)
    await apiFetch<{ project: BannerProject }>('/api/agency/banner-studio/projects', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: {
        name: `${p.name} (copy)`,
        clientId: p.clientId,
        folderId: p.folderId,
        canvasData: source.canvasData,
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

function confirmDelete(p: CatalogProject) {
  deleteTarget.value = p
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await apiFetch(`/api/agency/banner-studio/projects/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Design moved to recycling bin', description: deleteTarget.value.name, color: 'success' })
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

const dropdownItems = (p: CatalogProject) => [
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
  selectClient('all')
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
          Import creative packages
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
                  @click="() => { browseSearch = '' }"
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
              @click="selectClient('all')"
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
              @click="selectClient('unassigned')"
            >
              <template #trailing>
                <span class="ml-auto shrink-0 text-xs tabular-nums text-muted">{{ unassignedCount }}</span>
              </template>
            </UButton>
          </div>
          <div v-else-if="browseTab === 'folders'" class="flex items-center gap-1">
            <UButton
              label="All folders"
              icon="i-lucide-folders"
              :aria-pressed="folderFilter === 'all'"
              :variant="folderFilter === 'all' ? 'soft' : 'ghost'"
              color="neutral"
              class="min-w-0 flex-1 justify-start"
              prefetch-on="interaction"
              :to="folderLink('all')"
            />
            <UButton v-if="canManageFolders" icon="i-lucide-folder-plus" aria-label="Add top-level folder" title="Add folder" color="neutral" variant="ghost" @click="() => { folderEditor = { action: 'add' } }" />
          </div>
          <UButton
            v-else
            label="All tags"
            icon="i-lucide-tags"
            :aria-pressed="tagFilter === 'all'"
            :variant="tagFilter === 'all' ? 'soft' : 'ghost'"
            color="neutral"
            class="w-full justify-start"
            @click="selectTag('all')"
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
              @click="selectClient(client.id)"
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
              :actions="[{ label: 'Retry', onClick: async () => { await refreshFolders() } }]"
              class="mb-2"
            />
            <UButton
              label="Recycling bin"
              icon="i-lucide-trash-2"
              size="sm"
              color="neutral"
              variant="ghost"
              class="mb-2 w-full justify-start"
              @click="() => { showBin = true }"
            />
            <div v-if="visiblePins.length" class="mb-2 border-b border-default pb-2">
              <UButton label="Pinned folders" icon="i-lucide-pin" :trailing-icon="pinsExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" :aria-expanded="pinsExpanded" size="sm" variant="ghost" color="neutral" @click="() => { pinsExpanded = !pinsExpanded }" />
              <template v-if="pinsExpanded">
                <div v-for="folder in visiblePins" :key="folder.id" class="flex items-center pl-4">
                  <UButton
                    :label="folder.name"
                    :title="folderIndex.path(folder.id).map(f => f.name).join(' / ')"
                    prefetch-on="interaction"
                    :to="folderLink(folder.id)"
                    icon="i-lucide-folder"
                    :variant="folderFilter === folder.id ? 'soft' : 'ghost'"
                    color="neutral"
                    class="min-w-0 flex-1"
                    :ui="{ label: 'truncate' }"
                  />
                  <UButton icon="i-lucide-pin-off" :aria-label="`Unpin ${folder.name}`" :disabled="pinBusy" size="xs" variant="ghost" color="neutral" @click="setPinned(folder, false)" />
                </div>
              </template>
            </div>
            <div
              v-for="row in folderRows"
              :key="row.folder.id"
              class="flex min-w-0 items-start"
              :style="{ paddingLeft: `${Math.min(row.depth, 6) * 12}px` }"
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
                prefetch-on="interaction"
                :to="folderLink(row.folder.id)"
              />
              <UDropdownMenu :items="folderMenu(row.folder)">
                <UButton icon="i-lucide-ellipsis-vertical" :aria-label="`Actions for ${row.folder.name}`" size="xs" color="neutral" variant="ghost" class="mt-1 shrink-0" />
              </UDropdownMenu>
            </div>
            <p v-if="!folderError && foldersLoaded && !folderRows.length" class="px-2.5 py-4 text-sm text-muted">
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
              @click="selectTag(tag)"
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
            @click="selectClient('all')"
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
            @click="clearFolder"
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
            @click="selectTag('all')"
          />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <UAlert v-if="!folderError && foldersLoaded && folderFilter !== 'all' && !selectedFolderPath.length" title="Folder not found" color="warning" class="mb-4" :actions="[{ label: 'All folders', to: folderLink('all') }]" />
          <nav v-if="selectedFolderPath.length" aria-label="Folder breadcrumb" class="mb-4 flex flex-wrap items-center gap-1">
            <UButton
              label="All folders"
              variant="link"
              color="neutral"
              size="xs"
              prefetch-on="interaction"
              :to="folderLink('all')"
            />
            <template v-for="folder in selectedFolderPath" :key="folder.id">
              <UIcon name="i-lucide-chevron-right" class="size-3 text-muted" />
              <UButton
                :label="folder.name"
                :aria-current="folder.id === folderFilter ? 'page' : undefined"
                variant="link"
                color="neutral"
                size="xs"
                prefetch-on="interaction"
                :to="folderLink(folder.id)"
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
              prefetch-on="interaction"
              :to="folderLink(folder.id)"
            />
          </div>
          <UAlert
            v-if="detailError || dimensionError"
            :title="dimensionError ? 'Could not search all banner sizes' : 'Could not load banner sizes and previews'"
            color="warning"
            class="mb-4"
            :actions="[{ label: 'Retry', onClick: refresh }]"
          />
          <div class="mb-4 flex items-center justify-between gap-2">
            <p class="text-xs text-muted" role="status">
              <template v-if="loadingProjects">
                Loading projects…
              </template>
              <template v-else>
                {{ projects.length }} project{{ projects.length === 1 ? '' : 's' }}
              </template>
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
            v-if="loadingProjects"
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
              <UButton
                icon="i-lucide-download"
                :aria-label="`MP4 downloads for ${projectById.get(id)?.name}`"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="() => { downloadTarget = projectById.get(id) || null }"
              />
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
    <LazyBannerTheBriefImportModal v-if="importToolsLoaded" v-model:open="showImportModal" @imported="refresh" />
    <LazyBannerProjectShareModal
      v-if="shareTarget"
      :open="!!shareTarget"
      :project="shareTarget"
      @update:open="value => { if (!value) shareTarget = null }"
    />
    <LazyBannerVideoDownloads
      v-if="downloadTarget"
      :open="!!downloadTarget"
      :project-id="downloadTarget.id"
      :project-name="downloadTarget.name"
      :client-id="downloadTarget.clientId"
      :editor-url="`${editorBase}/${downloadTarget.id}`"
      @update:open="value => { if (!value) downloadTarget = null }"
    />
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
    <BannerFolderBin
      v-if="showBin"
      :active-folders="folderData"
      @close="showBin = false"
      @restored="refresh"
    />
    <UModal
      :open="!!trashTarget"
      title="Move folder to recycling bin?"
      :description="trashTarget?.name"
      :dismissible="!trashBusy"
      @update:open="open => { if (!open && !trashBusy) trashTarget = null }"
    >
      <template #body>
        <p class="text-sm">
          This folder<span v-if="trashSubfolders"> and its {{ trashSubfolders }} {{ trashSubfolders === 1 ? 'subfolder' : 'subfolders' }}</span> will move to the recycling bin for 30 days. All designs stay in their current client libraries. Restoring the folder restores the filing of designs still assigned to it.
        </p>
        <UAlert
          v-if="trashError"
          :title="trashError"
          color="error"
          class="mt-3"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="trashBusy"
            @click="trashTarget = null"
          />
          <UButton
            label="Move to bin"
            color="error"
            :loading="trashBusy"
            @click="trashFolder"
          />
        </div>
      </template>
    </UModal>
    <BannerFolderEditModal v-if="folderEditor" :action="folderEditor.action" :folder="folderEditor.folder" :folders="folderData" @close="folderEditor = null" @saved="folderSaved" />
    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)] mb-2">
            Delete design?
          </h3>
          <p class="text-sm text-[var(--ui-text-muted)] mb-6">
            Move <span class="font-medium text-[var(--ui-text)]">"{{ deleteTarget?.name }}"</span> to the recycling bin? You can restore this design for 30 days.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              variant="outline"
              color="neutral"
              @click="() => { showDeleteModal = false }"
            />
            <UButton label="Move to bin" color="error" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
