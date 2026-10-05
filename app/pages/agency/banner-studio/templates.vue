<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { BannerTemplateDB, CustomTemplate } from '~/types/banner-studio'
import { bannerDimensions, sortLibrary } from '~/utils/banner-library'
import type { LibrarySort } from '~/utils/banner-library'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

type LibraryTemplate = (BannerTemplateDB & { _isCustomHtml: false }) | (CustomTemplate & { _isCustomHtml: true })
const router = useRouter()
const toast = useToast()
const searchQuery = ref('')
const activeCategory = ref('all')
const typeFilter = ref('all')
const view = useCookie<'list' | 'grid'>('banner-library-view', { default: () => 'list', sameSite: 'lax' })
const sort = ref<LibrarySort>('modified')
const page = ref(1)
const pageSize = 36
const showDeleteModal = ref(false)
const deleteTarget = ref<LibraryTemplate | null>(null)
const templates = ref<BannerTemplateDB[]>([])
const customTemplates = ref<CustomTemplate[]>([])
const status = ref<'idle' | 'pending' | 'success'>('idle')
const nativeError = ref(false)
const customError = ref(false)
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
) => Promise<T>

// The custom endpoint is paginated. Collect metadata pages so filtering does not silently omit templates after the first 50.
async function fetchCustomTemplates() {
  const result: CustomTemplate[] = []
  let batch: CustomTemplate[]
  do {
    batch = await apiFetch<CustomTemplate[]>('/api/agency/banner-studio/custom-templates', { query: { limit: 100, offset: result.length } })
    result.push(...batch)
  } while (batch.length === 100)
  return result
}
async function refresh() {
  status.value = 'pending'
  const [native, custom] = await Promise.allSettled([
    apiFetch<BannerTemplateDB[]>('/api/agency/banner-studio/templates'), fetchCustomTemplates()
  ])
  nativeError.value = native.status === 'rejected'
  customError.value = custom.status === 'rejected'
  templates.value = native.status === 'fulfilled' ? native.value : []
  customTemplates.value = custom.status === 'fulfilled' ? custom.value : []
  status.value = 'success'
}
onMounted(() => {
  void refresh()
})
const allTemplates = computed<LibraryTemplate[]>(() => [
  ...templates.value.map(t => ({ ...t, _isCustomHtml: false as const })),
  ...customTemplates.value.map(t => ({ ...t, _isCustomHtml: true as const }))
])
const categories = computed(() => [...new Set(allTemplates.value.map(t => t.category).filter(Boolean))].sort())
const filteredTemplates = computed(() => {
  const search = searchQuery.value.trim().toLowerCase()
  return sortLibrary(allTemplates.value.filter(t =>
    (activeCategory.value === 'all' || t.category === activeCategory.value)
    && (typeFilter.value === 'all' || (typeFilter.value === 'html' ? t._isCustomHtml : !t._isCustomHtml))
    && (!search || [t.name, t.description, t.category, ...t.tags || [], dimensions(t)].some(value => value?.toLowerCase().includes(search)))
  ), sort.value)
})
function dimensions(t: LibraryTemplate) {
  return t._isCustomHtml ? `${t.width} × ${t.height}` : bannerDimensions(t.canvasData, t.formats)
}
function itemKey(t: LibraryTemplate) {
  return `${t._isCustomHtml ? 'html' : 'native'}:${t.id}`
}
const templateById = computed(() => new Map(allTemplates.value.map(t => [itemKey(t), t])))
const libraryItems = computed(() => filteredTemplates.value.slice((page.value - 1) * pageSize, page.value * pageSize).map(t => ({
  id: itemKey(t), name: t.name, client: t.category || 'Uncategorised', category: t.isSystem ? 'System template' : undefined,
  dimensions: dimensions(t), type: t._isCustomHtml ? 'Custom HTML' : 'Native editable',
  date: t._isCustomHtml ? t.updatedAt || t.createdAt : t.createdAt,
  dateLabel: t._isCustomHtml && t.updatedAt ? '' : 'Added ', thumbnailUrl: t.thumbnailUrl,
  canvasData: t._isCustomHtml ? undefined : t.canvasData
})))
const hasActiveFilters = computed(() => Boolean(searchQuery.value || activeCategory.value !== 'all' || typeFilter.value !== 'all'))
function clearFilters() {
  searchQuery.value = ''
  activeCategory.value = 'all'
  typeFilter.value = 'all'
}
watch([searchQuery, activeCategory, typeFilter, sort], () => {
  page.value = 1
})
watch(filteredTemplates, (list) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(list.length / pageSize)))
})
const sortItems = [
  { label: 'Recently updated / added', value: 'modified' },
  { label: 'Name A–Z', value: 'name' },
  { label: 'Oldest updated / added', value: 'oldest' }
]
const typeItems = [{ label: 'All types', value: 'all' }, { label: 'Native editable', value: 'native' }, { label: 'Custom HTML', value: 'html' }]
function openTemplate(id: string) {
  const template = templateById.value.get(id)
  if (template) void useTemplate(template)
}

async function useTemplate(tpl: LibraryTemplate) {
  if (tpl._isCustomHtml) {
    // Create a new instance from the custom HTML template
    try {
      // Increment usage count
      apiFetch(`/api/agency/banner-studio/custom-templates/${tpl.id}/use`, { method: 'POST' }).catch(() => {})
      // Create instance
      const inst = await apiFetch<{ id: string }>('/api/agency/banner-studio/custom-instances', {
        method: 'POST',
        body: { templateId: tpl.id }
      })
      router.push(`/agency/banner-studio/custom/${inst.id}`)
    } catch (error) {
      toast.add({ title: 'Error', description: (error as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Failed to create instance', color: 'error' })
    }
    return
  }
  apiFetch(`/api/agency/banner-studio/templates/${tpl.id}/use`, { method: 'POST' }).catch(() => {})
  router.push({ path: '/agency/banner-studio/new', query: { template: tpl.id } })
}

function confirmDelete(tpl: LibraryTemplate) {
  deleteTarget.value = tpl
  showDeleteModal.value = true
}

async function doDelete() {
  if (!deleteTarget.value) return
  const tpl = deleteTarget.value
  const endpoint = tpl._isCustomHtml
    ? `/api/agency/banner-studio/custom-templates/${tpl.id}`
    : `/api/agency/banner-studio/templates/${tpl.id}`
  try {
    await apiFetch(endpoint, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `"${tpl.name}" has been removed`, color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch (error) {
    toast.add({ title: 'Error', description: (error as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Failed to delete template', color: 'error' })
  }
}

const dropdownItems = (tpl: LibraryTemplate) => {
  const items: DropdownMenuItem[][] = [
    [{ label: 'Use Template', icon: 'i-lucide-play', onSelect: () => useTemplate(tpl) }]
  ]
  if (!tpl.isSystem) {
    items.push([
      { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => confirmDelete(tpl) }
    ])
  }
  return items
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-default">
    <header class="flex shrink-0 flex-wrap items-center gap-3 border-b border-default px-4 py-4 sm:px-6">
      <UButton
        to="/agency/banner-studio"
        icon="i-lucide-arrow-left"
        aria-label="Back to Banner Studio"
        variant="ghost"
        color="neutral"
        size="sm"
      />
      <div class="min-w-0 flex-1">
        <h1 class="text-xl font-semibold">
          Template Gallery
        </h1>
        <p class="mt-0.5 text-xs text-muted">
          Find a starting point for your next banner
        </p>
      </div>
      <UButton
        to="/agency/banner-studio"
        icon="i-lucide-folders"
        label="Client banners"
        variant="outline"
        color="neutral"
        size="sm"
      />
      <UButton
        to="/agency/banner-studio/custom-templates"
        icon="i-lucide-code"
        label="Manage HTML templates"
        variant="ghost"
        color="neutral"
        size="sm"
      />
    </header>
    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside class="max-h-40 shrink-0 overflow-y-auto border-b border-default bg-elevated/30 p-3 md:max-h-none md:w-56 md:border-r md:border-b-0" aria-label="Template categories">
        <UButton
          to="/agency/banner-studio"
          icon="i-lucide-users"
          label="Browse by client"
          variant="ghost"
          color="neutral"
          class="w-full justify-start"
        />
        <p class="px-2 pt-1 pb-5 text-xs text-muted">
          Client projects and source folders live in your banner library.
        </p>
        <h2 class="px-2 pb-2 text-xs font-semibold text-muted">
          Template categories
        </h2>
        <UButton
          label="All templates"
          icon="i-lucide-layout-template"
          :variant="activeCategory === 'all' ? 'soft' : 'ghost'"
          :aria-pressed="activeCategory === 'all'"
          color="neutral"
          class="w-full justify-start"
          @click="activeCategory = 'all'"
        >
          <template #trailing>
            <span class="ml-auto text-xs text-muted">{{ allTemplates.length }}</span>
          </template>
        </UButton>
        <UButton
          v-for="category in categories"
          :key="category"
          :label="category"
          :title="category"
          :variant="activeCategory === category ? 'soft' : 'ghost'"
          :aria-pressed="activeCategory === category"
          color="neutral"
          class="w-full justify-start capitalize"
          :ui="{ label: 'truncate' }"
          @click="activeCategory = category"
        />
      </aside>
      <main class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex shrink-0 flex-wrap items-end gap-3 border-b border-default p-4">
          <UFormField label="Search templates" class="min-w-40 flex-1">
            <UInput
              v-model="searchQuery"
              icon="i-lucide-search"
              placeholder="Name, category or dimensions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Type">
            <USelect v-model="typeFilter" :items="typeItems" class="w-40" />
          </UFormField>
          <UFormField label="Sort">
            <USelect v-model="sort" :items="sortItems" class="w-52" />
          </UFormField>
          <div class="flex gap-1" role="group" aria-label="Gallery view">
            <UButton
              icon="i-lucide-list"
              aria-label="List view"
              :aria-pressed="view === 'list'"
              :variant="view === 'list' ? 'soft' : 'ghost'"
              color="neutral"
              @click="view = 'list'"
            />
            <UButton
              icon="i-lucide-layout-grid"
              aria-label="Grid view"
              :aria-pressed="view === 'grid'"
              :variant="view === 'grid' ? 'soft' : 'ghost'"
              color="neutral"
              @click="view = 'grid'"
            />
          </div>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div class="mb-4 flex items-center justify-between gap-2">
            <p class="text-xs text-muted" role="status">
              {{ filteredTemplates.length }} template{{ filteredTemplates.length === 1 ? '' : 's' }}
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
            v-if="status === 'pending'"
            class="space-y-3"
            aria-label="Loading templates"
            aria-busy="true"
          >
            <USkeleton v-for="n in 6" :key="n" class="h-20 w-full" />
          </div>
          <template v-else>
            <UAlert
              v-if="nativeError || customError"
              class="mb-4"
              color="error"
              icon="i-lucide-circle-alert"
              title="Some templates could not be loaded"
              :description="[nativeError ? 'Native templates are unavailable.' : '', customError ? 'Custom HTML templates are unavailable.' : ''].filter(Boolean).join(' ')"
              :actions="[{ label: 'Retry', onClick: refresh }]"
            />
            <BannerLibraryItems
              v-if="filteredTemplates.length"
              :items="libraryItems"
              :view="view"
              context-label="Category"
              @open="openTemplate"
            >
              <template #actions="{ id }">
                <UDropdownMenu :items="dropdownItems(templateById.get(id)!)">
                  <UButton
                    icon="i-lucide-more-horizontal"
                    :aria-label="`Actions for ${templateById.get(id)?.name}`"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                  />
                </UDropdownMenu>
              </template>
            </BannerLibraryItems>
            <div v-else-if="!nativeError && !customError" class="py-16 text-center">
              <UIcon name="i-lucide-layout-template" class="mb-3 size-8 text-muted" />
              <h2 class="font-semibold">
                No templates found
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ hasActiveFilters ? 'Try another search, category or type.' : 'Save a banner project as a template to get started.' }}
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
            </div>
            <UPagination
              v-if="filteredTemplates.length > pageSize"
              v-model:page="page"
              :items-per-page="pageSize"
              :total="filteredTemplates.length"
              class="mt-6 flex justify-center"
            />
          </template>
        </div>
      </main>
    </div>
    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-5">
          <h3 class="text-lg font-semibold mb-2">
            Delete Template
          </h3>
          <p class="text-sm text-muted mb-5">
            Are you sure you want to delete "{{ deleteTarget?.name }}"? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              variant="outline"
              size="sm"
              @click="showDeleteModal = false"
            />
            <UButton
              label="Delete"
              color="error"
              size="sm"
              @click="doDelete"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
