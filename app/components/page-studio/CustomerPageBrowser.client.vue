<script setup lang="ts">
import type { PageStudioSavedPages } from '~~/shared/pageStudio/savedPages'

type SavedPage = PageStudioSavedPages['pages'][number]
const props = defineProps<{ pages: SavedPage[], updatedAt: string | null, canEdit: boolean, launching: boolean }>()
defineEmits<{ edit: [], refresh: [] }>()
const search = ref('')
const visibility = ref('all')
const pageNumber = ref(1)
const pageSize = 12
const selectedId = ref<string | null>(null)
const selected = computed(() => props.pages.find(page => page.id === selectedId.value))
const detailsOpen = computed({
  get: () => Boolean(selected.value),
  set: (value: boolean) => {
    if (!value) selectedId.value = null
  }
})
const statuses = [
  { label: 'All pages', value: 'all' },
  { label: 'Visible', value: 'public' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Draft', value: 'draft' },
  { label: 'Archived', value: 'archived' }
]
const labels = { public: 'Visible', hidden: 'Hidden', draft: 'Draft', archived: 'Archived' }
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  return props.pages.filter(page => (visibility.value === 'all' || page.visibility === visibility.value)
    && (!term || [page.title, page.route, page.seo.title ?? ''].some(value => value.toLocaleLowerCase().includes(term))))
})
const rows = computed(() => filtered.value.slice((pageNumber.value - 1) * pageSize, pageNumber.value * pageSize))
watch([search, visibility, () => props.pages], () => {
  pageNumber.value = 1
})
const columns = [
  { accessorKey: 'title', header: 'Page' },
  { accessorKey: 'visibility', header: 'Visibility' },
  { id: 'seo', header: 'SEO' },
  { id: 'forms', header: 'Forms' },
  { id: 'details', header: '' }
]
const savedAt = computed(() => {
  const date = props.updatedAt ? new Date(props.updatedAt) : null
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(date) : null
})
function resetFilters() {
  search.value = ''
  visibility.value = 'all'
}
</script>

<template>
  <section class="min-w-0 space-y-5" aria-label="Website pages">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold tracking-tight text-highlighted">
          Pages
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ pages.length }} saved pages<template v-if="savedAt">
            · Saved {{ savedAt }}
          </template>
        </p>
      </div>
      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="$emit('refresh')"
      />
    </div>
    <div class="@container rounded-lg border border-default bg-default">
      <div class="grid grid-cols-1 gap-3 border-b border-default p-4 @lg:grid-cols-[minmax(0,1fr)_160px]">
        <UFormField label="Find a page">
          <UInput
            v-model="search"
            placeholder="Search by title or URL…"
            icon="i-lucide-search"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Visibility">
          <USelect v-model="visibility" :items="statuses" class="w-full" />
        </UFormField>
      </div>
      <UTable
        :data="rows"
        :columns="columns"
        class="w-full overflow-x-auto"
        :ui="{ td: 'py-3', th: 'text-xs font-medium text-muted' }"
      >
        <template #title-cell="{ row }">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-file" class="size-4 shrink-0 text-muted" />
            <div class="min-w-0">
              <UButton
                :label="row.original.title"
                color="neutral"
                variant="link"
                class="max-w-64 p-0 text-left font-medium"
                :ui="{ label: 'truncate' }"
                @click="selectedId = row.original.id"
              />
              <p class="mt-1 max-w-64 truncate text-xs text-muted">
                {{ row.original.route }}
              </p>
            </div>
          </div>
        </template>
        <template #visibility-cell="{ row }">
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ labels[row.original.visibility] }}
          </UBadge>
        </template>
        <template #seo-cell="{ row }">
          <span class="text-xs text-muted">{{ row.original.seo.title && row.original.seo.description ? 'Set' : 'Needs details' }}</span>
        </template>
        <template #forms-cell="{ row }">
          <span class="tabular-nums text-muted">{{ row.original.forms.length }}</span>
        </template>
        <template #details-cell="{ row }">
          <UButton
            label="Details"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`View ${row.original.title} details`"
            @click="selectedId = row.original.id"
          />
        </template>
        <template #empty>
          <div class="space-y-3 py-8 text-center">
            <p class="font-medium text-highlighted">
              {{ pages.length ? 'No pages match your filters' : 'No saved pages yet' }}
            </p>
            <UButton
              v-if="search || visibility !== 'all'"
              label="Clear filters"
              color="neutral"
              variant="outline"
              @click="resetFilters"
            />
          </div>
        </template>
      </UTable>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-3">
        <p class="text-xs text-muted" role="status">
          {{ filtered.length }} {{ filtered.length === 1 ? 'page' : 'pages' }}<template v-if="filtered.length !== pages.length">
            of {{ pages.length }}
          </template>
        </p>
        <UPagination
          v-if="filtered.length > pageSize"
          v-model:page="pageNumber"
          :total="filtered.length"
          :items-per-page="pageSize"
          size="xs"
          :sibling-count="1"
        />
      </div>
    </div>
    <p class="text-xs leading-5 text-muted">
      Visibility describes your saved draft. Publishing an approved release updates the live website.
    </p>
    <USlideover v-model:open="detailsOpen" :title="selected?.title || 'Page details'" description="Review the saved URL, search details and forms for this page.">
      <template #body>
        <dl v-if="selected" class="space-y-6 text-sm">
          <div>
            <dt class="text-muted">
              Page URL
            </dt><dd class="mt-2 break-all text-highlighted">
              {{ selected.route }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Visibility
            </dt><dd class="mt-2 text-highlighted">
              {{ labels[selected.visibility] }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              SEO title
            </dt><dd class="mt-2 break-words text-highlighted">
              {{ selected.seo.title || 'Not set' }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Meta description
            </dt><dd class="mt-2 break-words leading-6 text-highlighted">
              {{ selected.seo.description || 'Not set' }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Forms on this page
            </dt><dd class="mt-2 text-highlighted">
              {{ selected.forms.length }}
            </dd>
          </div>
        </dl>
      </template>
      <template #footer>
        <div class="w-full space-y-3">
          <UButton
            label="Edit in Page Studio"
            color="neutral"
            :disabled="!canEdit"
            :loading="launching"
            class="w-full justify-center"
            @click="$emit('edit')"
          />
          <p v-if="!canEdit" class="text-xs leading-5 text-muted">
            Editing needs an available Studio connection and editing access.
          </p>
        </div>
      </template>
    </USlideover>
  </section>
</template>
