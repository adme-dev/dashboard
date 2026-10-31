<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { BannerTemplateDB, CustomTemplate, BannerProject } from '~/types/banner-studio'
import { bannerDimensions, sortLibrary } from '~/utils/banner-library'
import type { LibrarySort } from '~/utils/banner-library'
import { BANNER_CATALOG_PRESETS } from '~/utils/banner-format-catalog'
import type { BannerCatalogPreset } from '~/utils/banner-format-catalog'
import { canDeleteBannerTemplate } from '~~/shared/bannerTemplatePermissions'
import { apiErrorDescription } from '~/utils/apiError'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

type LibraryTemplate = (BannerTemplateDB & { _isCustomHtml: false }) | (CustomTemplate & { _isCustomHtml: true })
const router = useRouter()
const toast = useToast()
const { user } = useAuth()
const searchQuery = ref('')
const activeTab = ref('suggested')
const activeCategory = ref('all')
const typeFilter = ref('all')
const view = useCookie<'list' | 'grid'>('banner-library-view', { default: () => 'grid', sameSite: 'lax' })
const sort = ref<LibrarySort>('modified')
const page = ref(1)
const pageSize = 36
const showDeleteModal = ref(false)
const deleteTarget = ref<LibraryTemplate | null>(null)
const deleting = ref(false)
const deleteError = ref('')
const showStartModal = ref(false)
const startPreset = ref<BannerCatalogPreset | null>(null)
const startTemplate = ref<BannerTemplateDB | null>(null)
const templates = ref<BannerTemplateDB[]>([])
const customTemplates = ref<CustomTemplate[]>([])
const status = ref<'idle' | 'pending' | 'success'>('idle')
const nativeError = ref(false)
const customError = ref(false)
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown, query?: Record<string, unknown> }) => Promise<T>

const tabs = [
  { label: 'Suggested', value: 'suggested' }, { label: 'Saved', value: 'saved' },
  { label: 'Display', value: 'display' }, { label: 'Social', value: 'social' },
  { label: 'Print', value: 'print' }, { label: 'Digital', value: 'digital' },
  { label: 'Sets', value: 'sets' }, { label: 'Video', value: 'video' }
]
const suggestedIds = ['display-set', 'performance-max-set', 'social-campaign-set', 'social-posts-set', 'video-set', 'digital-presentation']
const visiblePresets = computed(() => {
  const search = searchQuery.value.trim().toLowerCase()
  return BANNER_CATALOG_PRESETS.filter(p =>
    (activeTab.value === 'suggested'
      ? suggestedIds.includes(p.id)
      : activeTab.value === 'sets'
        ? p.formats.length > 1
        : p.category === activeTab.value || (activeTab.value === 'social' && ['video-set', 'video-video-story'].includes(p.id)))
      && (!search || [p.name, p.description, ...p.formats.map(f => f.name + ' ' + f.w + 'x' + f.h + ' ' + f.w + ' × ' + f.h)].some(v => v?.toLowerCase().includes(search)))
  )
})

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
const categoryOptions = computed(() => [
  { label: 'All categories', value: 'all' },
  ...[...new Set(allTemplates.value.map(t => t.category).filter(Boolean))].sort().map(value => ({ label: value, value }))
])
function layoutCount(t: LibraryTemplate) {
  return t._isCustomHtml ? 1 : Object.keys(t.canvasData || {}).length
}
const filteredTemplates = computed(() => {
  const search = searchQuery.value.trim().toLowerCase()
  return sortLibrary(allTemplates.value.filter(t =>
    (activeCategory.value === 'all' || t.category === activeCategory.value)
    && (activeTab.value !== 'sets' || layoutCount(t) > 1)
    && (typeFilter.value === 'all' || (typeFilter.value === 'html' ? t._isCustomHtml : !t._isCustomHtml))
    && (!search || [t.name, t.description, t.category, ...t.tags || [], dimensions(t)].some(value => value?.toLowerCase().includes(search)))
  ), sort.value)
})
function dimensions(t: LibraryTemplate) {
  return t._isCustomHtml === true ? t.width + ' × ' + t.height : bannerDimensions(t.canvasData, t.formats)
}
function itemKey(t: LibraryTemplate) {
  return (t._isCustomHtml ? 'html:' : 'native:') + t.id
}
const templateById = computed(() => new Map(allTemplates.value.map(t => [itemKey(t), t])))
const libraryItems = computed(() => filteredTemplates.value.slice((page.value - 1) * pageSize, page.value * pageSize).map(t => ({
  id: itemKey(t), name: t.name, client: t.category || 'Uncategorised', category: t.isSystem ? 'System template' : undefined,
  dimensions: dimensions(t), type: t._isCustomHtml ? 'Custom HTML' : layoutCount(t) + (layoutCount(t) === 1 ? ' layout · Editable' : ' layouts · Editable set'),
  date: t._isCustomHtml ? t.updatedAt || t.createdAt : t.createdAt,
  dateLabel: t._isCustomHtml && t.updatedAt ? '' : 'Added ', thumbnailUrl: t.thumbnailUrl,
  canvasData: t._isCustomHtml === true ? undefined : t.canvasData
})))
const hasActiveFilters = computed(() => Boolean(searchQuery.value || activeCategory.value !== 'all' || typeFilter.value !== 'all'))
function clearFilters() {
  searchQuery.value = ''
  activeCategory.value = 'all'
  typeFilter.value = 'all'
}
watch([searchQuery, activeCategory, activeTab, typeFilter, sort], () => {
  page.value = 1
})
watch(filteredTemplates, (list) => {
  page.value = Math.min(page.value, Math.max(1, Math.ceil(list.length / pageSize)))
})
const sortItems = [
  { label: 'Recently added', value: 'modified' }, { label: 'Name A–Z', value: 'name' }, { label: 'Oldest first', value: 'oldest' }
]
const typeItems = [{ label: 'All types', value: 'all' }, { label: 'Native editable', value: 'native' }, { label: 'Custom HTML', value: 'html' }]
function startFromPreset(preset: BannerCatalogPreset) {
  startPreset.value = preset
  startTemplate.value = null
  showStartModal.value = true
}
function openTemplate(id: string) {
  const template = templateById.value.get(id)
  if (template) void useTemplate(template)
}
async function useTemplate(tpl: LibraryTemplate) {
  if (!tpl._isCustomHtml) {
    startPreset.value = null
    startTemplate.value = tpl
    showStartModal.value = true
    return
  }
  try {
    const instance = await apiFetch<{ id: string }>('/api/agency/banner-studio/custom-instances', { method: 'POST', body: { templateId: tpl.id } })
    void apiFetch('/api/agency/banner-studio/custom-templates/' + tpl.id + '/use', { method: 'POST' }).catch(() => {})
    await router.push('/agency/banner-studio/custom/' + instance.id)
  } catch (cause) {
    toast.add({ title: 'Could not use template', description: apiErrorDescription(cause, 'Try again'), color: 'error' })
  }
}
async function openCreatedProject(project: BannerProject) {
  toast.add({ title: 'Draft created', description: project.name, color: 'success' })
  await router.push('/agency/banner-studio/' + project.id)
}
function canDelete(tpl: LibraryTemplate) {
  return canDeleteBannerTemplate(user.value, tpl)
}
function confirmDelete(tpl: LibraryTemplate) {
  if (!canDelete(tpl)) return
  deleteTarget.value = tpl
  deleteError.value = ''
  showDeleteModal.value = true
}
async function doDelete() {
  if (!deleteTarget.value || deleting.value) return
  const tpl = deleteTarget.value
  deleting.value = true
  deleteError.value = ''
  try {
    await apiFetch('/api/agency/banner-studio/' + (tpl._isCustomHtml ? 'custom-templates/' : 'templates/') + tpl.id, { method: 'DELETE' })
    toast.add({ title: 'Template deleted', description: tpl.name + ' removed from the gallery', color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch (cause) {
    deleteError.value = apiErrorDescription(cause, 'Could not delete this template')
  } finally { deleting.value = false }
}
const dropdownItems = (tpl: LibraryTemplate): DropdownMenuItem[][] => [
  [{ label: 'Use template', icon: 'i-lucide-play', onSelect: () => useTemplate(tpl) }],
  ...(canDelete(tpl) ? [[{ label: 'Delete template', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => confirmDelete(tpl) }]] : [])
]
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
          Template gallery
        </h1>
        <p class="mt-1 text-sm text-muted">
          Start with a format, a complete design set, or your saved artwork.
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
    <main class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
        <UTabs
          v-model="activeTab"
          :items="tabs"
          :content="false"
          variant="link"
          class="max-w-full overflow-x-auto"
          :ui="{ root: 'items-start', list: 'w-max min-w-full', trigger: 'shrink-0' }"
          aria-label="Template library sections"
        />
        <UFormField label="Search formats and templates" class="w-full sm:w-72">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Try social, story or 1200x1200"
            class="w-full"
          />
        </UFormField>
      </div>
      <section v-if="activeTab !== 'saved'" class="mb-8" aria-label="Starting formats and design sets">
        <div class="mb-4 flex items-baseline justify-between gap-3">
          <h2 class="text-base font-semibold">
            {{ activeTab === 'sets' ? 'Design sets' : 'Choose a starting format' }}
          </h2>
          <span class="text-xs text-muted">Choose sizes before creating</span>
        </div>
        <div v-if="visiblePresets.length" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
          <BannerFormatPresetCard
            v-for="preset in visiblePresets"
            :key="preset.id"
            :preset="preset"
            @select="startFromPreset(preset)"
          />
        </div>
        <p v-else class="rounded-lg border border-dashed border-default p-6 text-sm text-muted">
          No starting formats match this search.
        </p>
      </section>
      <section aria-label="Saved templates">
        <div class="mb-4 flex flex-wrap items-end gap-3 border-t border-default pt-5">
          <div class="mr-auto">
            <h2 class="text-base font-semibold">
              {{ activeTab === 'sets' ? 'Saved design sets' : 'Saved templates' }}
            </h2>
            <p class="mt-1 text-xs text-muted" role="status">
              {{ filteredTemplates.length }} template{{ filteredTemplates.length === 1 ? '' : 's' }}
            </p>
          </div>
          <UFormField label="Category">
            <USelect v-model="activeCategory" :items="categoryOptions" class="w-40" />
          </UFormField>
          <UFormField label="Type">
            <USelect v-model="typeFilter" :items="typeItems" class="w-40" />
          </UFormField>
          <UFormField label="Sort">
            <USelect v-model="sort" :items="sortItems" class="w-44" />
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
          <USkeleton v-for="n in 3" :key="n" class="h-20 w-full" />
        </div>
        <template v-else>
          <UAlert
            v-if="nativeError || customError"
            class="mb-4"
            color="error"
            title="Some templates could not be loaded"
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
              <div class="flex items-center gap-1">
                <UTooltip v-if="canDelete(templateById.get(id)!)" text="Delete template">
                  <UButton
                    icon="i-lucide-trash-2"
                    :aria-label="'Delete template ' + templateById.get(id)?.name"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click="confirmDelete(templateById.get(id)!)"
                  />
                </UTooltip>
                <UDropdownMenu :items="dropdownItems(templateById.get(id)!)">
                  <UButton
                    icon="i-lucide-more-horizontal"
                    :aria-label="'Actions for ' + templateById.get(id)?.name"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                  />
                </UDropdownMenu>
              </div>
            </template>
          </BannerLibraryItems>
          <div v-else-if="!nativeError && !customError" class="rounded-lg border border-dashed border-default px-5 py-10 text-center">
            <UIcon name="i-lucide-layout-template" class="mb-2 size-7 text-muted" />
            <h3 class="font-medium">
              {{ hasActiveFilters ? 'No matching saved templates' : activeTab === 'sets' ? 'Save your first design set' : 'Save your first template' }}
            </h3>
            <p class="mx-auto mt-2 max-w-lg text-sm text-muted">
              Choose a starting format from the tabs, design your layouts, then use Actions → Save as template in the editor. Every saved layout stays together.
            </p>
          </div>
          <UPagination
            v-if="filteredTemplates.length > pageSize"
            v-model:page="page"
            :items-per-page="pageSize"
            :total="filteredTemplates.length"
            class="mt-6 flex justify-center"
          />
        </template>
      </section>
    </main>
    <BannerTemplateStartModal
      v-model:open="showStartModal"
      :preset="startPreset"
      :template="startTemplate"
      @created="openCreatedProject"
    />
    <UModal
      v-model:open="showDeleteModal"
      title="Delete template"
      :description="deleteTarget?.name"
      :dismissible="!deleting"
      :close="!deleting"
    >
      <template #body>
        <p class="text-sm text-muted">
          Remove this template from the shared gallery? This cannot be undone.
        </p>
        <p class="mt-3 text-sm text-muted">
          {{ deleteTarget?._isCustomHtml ? 'HTML templates used by existing banners cannot be deleted.' : 'Projects already created from this template keep their artwork.' }}
        </p>
        <UAlert
          v-if="deleteError"
          class="mt-4"
          color="error"
          :title="deleteError"
        />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            variant="outline"
            color="neutral"
            :disabled="deleting"
            @click="showDeleteModal = false"
          />
          <UButton
            label="Delete template"
            color="error"
            :loading="deleting"
            @click="doDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
