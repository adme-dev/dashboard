<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'
import type { BannerVariant, BannerFeed } from '~/types/banner-studio'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const route = useRoute()
const toast = useToast()
const projectId = route.params.id as string

// Filters
const filterFeedId = ref<string>('all')
const filterFormatKey = ref<string>('all')
const search = ref('')
const page = ref(1)
const pageSize = 50

// Fetch project name
const { data: project } = useFetch<{ id: string; name: string }>(
  `/api/agency/banner-studio/projects/${projectId}`,
)

// Fetch feeds for this project (for filter dropdown)
const { data: feeds } = useFetch<BannerFeed[]>(
  '/api/agency/banner-studio/feeds',
  { params: { projectId } },
)

// Fetch variants
const offset = computed(() => (page.value - 1) * pageSize)
const fetchParams = computed(() => ({
  projectId,
  feedId: filterFeedId.value !== 'all' ? filterFeedId.value : undefined,
  formatKey: filterFormatKey.value !== 'all' ? filterFormatKey.value : undefined,
  offset: offset.value,
  limit: pageSize,
}))

const { data: variantData, refresh: refreshVariants } = useFetch<{ variants: BannerVariant[]; total: number }>(
  '/api/agency/banner-studio/variants',
  { params: fetchParams, default: () => ({ variants: [], total: 0 }) },
)

const variants = computed(() => variantData.value.variants)
const total = computed(() => variantData.value.total)
const totalPages = computed(() => Math.ceil(total.value / pageSize))

// Search filter (client-side on current page)
const filteredVariants = computed(() => {
  if (!search.value.trim()) return variants.value
  const q = search.value.toLowerCase()
  return variants.value.filter((v) => {
    const rowVals = Object.values(v.rowData || {}).join(' ').toLowerCase()
    return rowVals.includes(q) || v.formatKey.includes(q)
  })
})

// Unique format keys from variants for filter
const formatKeys = computed(() => {
  const keys = new Set<string>()
  variants.value.forEach(v => keys.add(v.formatKey))
  return [...keys].sort()
})

// USelect items for filters
const feedFilterItems = computed(() => [
  { label: 'All Feeds', value: 'all' },
  ...(feeds.value || []).map(f => ({ label: f.name, value: f.id })),
])
const formatFilterItems = computed(() => [
  { label: 'All Formats', value: 'all' },
  ...formatKeys.value.map(key => ({
    label: `${FORMATS[key]?.name || key} (${FORMATS[key]?.w}x${FORMATS[key]?.h})`,
    value: key,
  })),
])

// Stats
const stats = computed(() => ({
  total: total.value,
  formats: new Set(variants.value.map(v => v.formatKey)).size,
}))

// Tags modal
const showTags = ref(false)
const tagsVariant = ref<BannerVariant | null>(null)
const adTags = ref<Array<{ type: string; code: string; label: string }>>([])
const copiedTag = ref<string | null>(null)

async function viewTags(variant: BannerVariant) {
  try {
    const result = await $fetch<{ tags: Array<{ type: string; code: string; label: string }> }>(
      `/api/agency/banner-studio/variants/${variant.id}/tags`,
    )
    adTags.value = result.tags
    tagsVariant.value = variant
    showTags.value = true
  } catch {
    toast.add({ title: 'Error', description: 'Failed to load ad tags', color: 'error' })
  }
}

async function copyTag(code: string, type: string) {
  await navigator.clipboard.writeText(code)
  copiedTag.value = type
  setTimeout(() => { copiedTag.value = null }, 2000)
  toast.add({ title: 'Copied', description: `${type} tag copied`, color: 'success' })
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url)
  toast.add({ title: 'Copied', description: 'URL copied', color: 'success' })
}

// Delete single
async function deleteVariant(variant: BannerVariant) {
  try {
    await $fetch(`/api/agency/banner-studio/variants/${variant.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', color: 'success' })
    await refreshVariants()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete variant', color: 'error' })
  }
}

// Bulk delete
const isDeleting = ref(false)
async function bulkDelete() {
  isDeleting.value = true
  try {
    const params: any = { projectId }
    if (filterFeedId.value !== 'all') params.feedId = filterFeedId.value
    if (filterFormatKey.value !== 'all') params.formatKey = filterFormatKey.value

    const result = await $fetch<{ deleted: number }>('/api/agency/banner-studio/variants/bulk-delete', {
      method: 'POST',
      body: params,
    })
    toast.add({ title: 'Deleted', description: `${result.deleted} variants removed`, color: 'success' })
    page.value = 1
    await refreshVariants()
  } catch {
    toast.add({ title: 'Error', description: 'Bulk delete failed', color: 'error' })
  } finally {
    isDeleting.value = false
  }
}

// Export CSV
function exportCsv() {
  const params = new URLSearchParams({ projectId })
  if (filterFeedId.value !== 'all') params.set('feedId', filterFeedId.value)
  window.open(`/api/agency/banner-studio/variants/export-urls?${params}`, '_blank')
}

// Get first text value from rowData for display
function getRowPreviewText(rowData: Record<string, string>): string {
  const vals = Object.values(rowData || {})
  const textVal = vals.find(v => v && v.length > 2 && !/^(https?:|#[0-9a-f])/i.test(v))
  return textVal ? (textVal.length > 40 ? textVal.slice(0, 40) + '...' : textVal) : ''
}

// Dropdown menu items for variant cards
function getVariantMenuItems(variant: BannerVariant) {
  return [[
    { label: 'Copy URL', icon: 'i-lucide-link', onSelect: () => copyUrl(variant.url) },
    { label: 'Ad Tags', icon: 'i-lucide-code', onSelect: () => viewTags(variant) },
  ], [
    { label: 'Delete', icon: 'i-lucide-trash-2', onSelect: () => deleteVariant(variant) },
  ]]
}

// Reset page when filters change
watch([filterFeedId, filterFormatKey], () => { page.value = 1 })
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          size="sm"
          :to="`/agency/banner-studio/${projectId}`"
        />
        <BrandCube color="red" :size="32" :animated="false" />
        <div>
          <h1 class="text-xl font-bold">DCO Variants</h1>
          <p class="text-sm text-(--ui-text-muted)">{{ project?.name || 'Loading...' }}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <UButton
          label="Export CSV"
          icon="i-lucide-download"
          variant="soft"
          size="sm"
          :disabled="total === 0"
          @click="exportCsv"
        />
        <UButton
          label="Delete All"
          icon="i-lucide-trash-2"
          variant="soft"
          color="error"
          size="sm"
          :disabled="total === 0"
          :loading="isDeleting"
          @click="bulkDelete"
        />
        <UButton
          label="Back to Editor"
          icon="i-lucide-edit"
          size="sm"
          :to="`/agency/banner-studio/${projectId}`"
        />
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <NbCard hoverable body-class="!p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(255, 107, 107, 0.1);">
            <UIcon name="i-lucide-layers" class="w-5 h-5" style="color: var(--nb-accent-red);" />
          </div>
          <div>
            <p class="text-2xl font-bold">{{ total }}</p>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">Total Variants</p>
          </div>
        </div>
      </NbCard>
      <NbCard hoverable body-class="!p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(78, 205, 196, 0.1);">
            <UIcon name="i-lucide-layout-grid" class="w-5 h-5" style="color: var(--nb-accent-teal);" />
          </div>
          <div>
            <p class="text-2xl font-bold">{{ stats.formats }}</p>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">Formats</p>
          </div>
        </div>
      </NbCard>
      <NbCard hoverable body-class="!p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg flex items-center justify-center" style="background: rgba(255, 230, 109, 0.1);">
            <UIcon name="i-lucide-database" class="w-5 h-5" style="color: var(--nb-accent-yellow);" />
          </div>
          <div>
            <p class="text-2xl font-bold">{{ feeds?.length || 0 }}</p>
            <p class="text-[11px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">Feeds</p>
          </div>
        </div>
      </NbCard>
    </div>

    <!-- Filters -->
    <div class="flex items-center gap-3 mb-4 bg-(--ui-bg-elevated)/50 rounded-lg px-4 py-3 border border-(--ui-border)">
      <USelect
        v-model="filterFeedId"
        :items="feedFilterItems"
        size="sm"
        class="w-40"
      />

      <USelect
        v-model="filterFormatKey"
        :items="formatFilterItems"
        size="sm"
        class="w-52"
      />

      <UInput
        v-model="search"
        placeholder="Search row data..."
        icon="i-lucide-search"
        size="sm"
        class="w-64"
      />

      <span class="text-xs text-(--ui-text-muted) ml-auto">
        Showing {{ filteredVariants.length }} of {{ total }}
      </span>
    </div>

    <!-- Empty state -->
    <div v-if="total === 0" class="text-center py-16">
      <div class="flex justify-center mb-4">
        <BrandCube color="yellow" :size="48" />
      </div>
      <p class="text-sm font-medium mb-1">No variants generated yet</p>
      <p class="text-xs text-(--ui-text-muted) mb-5">Use the DCO Generate tool in the editor to create pre-baked banner variants.</p>
      <NbButton variant="primary" icon="i-lucide-edit" :to="`/agency/banner-studio/${projectId}`">
        Go to Editor
      </NbButton>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <NbCard
        v-for="variant in filteredVariants"
        :key="variant.id"
        hoverable
        body-class="!p-0"
        class="group overflow-hidden"
      >
        <!-- Preview iframe -->
        <div class="relative bg-black" :style="{ paddingBottom: `${(variant.height / variant.width) * 100}%` }">
          <iframe
            :src="variant.url"
            :width="variant.width"
            :height="variant.height"
            class="absolute inset-0 w-full h-full border-0"
            style="transform-origin: top left;"
            :style="{
              transform: `scale(${Math.min(1, 200 / variant.width)})`,
              width: `${variant.width}px`,
              height: `${variant.height}px`,
            }"
            loading="lazy"
            sandbox="allow-scripts"
          />
          <!-- Hover overlay -->
          <div class="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
            <UButton
              icon="i-lucide-external-link"
              label="Open"
              size="xs"
              class="pointer-events-auto"
              :to="variant.url"
              target="_blank"
            />
          </div>
        </div>

        <!-- Info -->
        <div class="p-2.5">
          <div class="flex items-center gap-1.5 mb-1">
            <NbBadge variant="primary">
              {{ FORMATS[variant.formatKey]?.name || variant.formatKey }}
            </NbBadge>
            <span class="text-[10px] font-mono text-(--ui-text-muted)">
              {{ variant.width }}x{{ variant.height }}
            </span>
            <NbBadge variant="secondary">
              Row {{ variant.rowIndex }}
            </NbBadge>
          </div>

          <p v-if="getRowPreviewText(variant.rowData)" class="text-[11px] text-(--ui-text-muted) truncate mb-1.5">
            {{ getRowPreviewText(variant.rowData) }}
          </p>

          <!-- Actions: primary open + dropdown -->
          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-external-link"
              variant="ghost"
              size="xs"
              title="Open"
              :to="variant.url"
              target="_blank"
            />
            <div class="ml-auto">
              <UDropdownMenu :items="getVariantMenuItems(variant)">
                <UButton
                  icon="i-lucide-more-horizontal"
                  variant="ghost"
                  size="xs"
                />
              </UDropdownMenu>
            </div>
          </div>
        </div>
      </NbCard>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex justify-center mt-6">
      <UPagination
        v-model="page"
        :total="total"
        :items-per-page="pageSize"
      />
    </div>

    <!-- Ad Tags Modal -->
    <UModal :open="showTags" @update:open="showTags = $event" :ui="{ width: 'max-w-xl' }">
      <template #content>
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <div>
              <h3 class="text-lg font-semibold">Ad Tags</h3>
              <p class="text-xs text-(--ui-text-muted)">
                {{ FORMATS[tagsVariant?.formatKey || '']?.name }} — Row {{ tagsVariant?.rowIndex }}
                — {{ tagsVariant?.width }}x{{ tagsVariant?.height }}
              </p>
            </div>
            <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="showTags = false" />
          </div>

          <div class="space-y-4">
            <NbCard
              v-for="tag in adTags"
              :key="tag.type"
              body-class="!p-0"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="text-xs font-semibold">{{ tag.label }}</span>
                  <UButton
                    :icon="copiedTag === tag.type ? 'i-lucide-check' : 'i-lucide-copy'"
                    :label="copiedTag === tag.type ? 'Copied' : 'Copy'"
                    variant="soft"
                    size="xs"
                    @click="copyTag(tag.code, tag.type)"
                  />
                </div>
              </template>
              <pre class="p-3 text-[11px] leading-relaxed font-mono text-(--ui-text-muted) overflow-x-auto max-h-[120px]">{{ tag.code }}</pre>
            </NbCard>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
