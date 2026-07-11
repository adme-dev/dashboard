<!-- app/components/email/TemplatesPanel.vue -->
<!-- Templates manager (Phase 5). Lists saved edm_templates and offers the
     lifecycle actions around the composer: new / open / duplicate / rename /
     delete. Reuses the existing /api/email/templates CRUD — no new endpoints. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { EDM_STARTER_TEMPLATES } from '~~/app/utils/edmPresets'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

interface TemplateRow {
  id: string
  name: string
  subject: string | null
  preview_text?: string | null
  body_source?: unknown
  template_kind?: 'template' | 'draft' | null
  folder_name?: string | null
  updated_at: string
}
interface FullTemplate {
  name: string
  subject: string | null
  preview_text: string | null
  body_source: unknown
  template_kind?: 'template' | 'draft' | null
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

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{ items: TemplateRow[] }>('/api/email/templates')
  } finally {
    pending.value = false
  }
}

await refresh()

const busyId = ref<string | null>(null)
const savedRows = computed(() => data.value?.items ?? [])

function rowKind(row: TemplateRow): 'template' | 'draft' {
  return row.template_kind === 'draft' ? 'draft' : 'template'
}

function rowFolder(row: TemplateRow): string {
  return row.folder_name?.trim() || 'Unfiled'
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
  navigateTo(id ? `/agency/email/compose?id=${id}` : '/agency/email/compose')
}

function openStarter(starterId: string) {
  navigateTo(`/agency/email/compose?starter=${starterId}`)
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
const seasonOptions = ['Spring', 'Summer', 'Autumn', 'Winter']

const selectedIndustry = ref('')
const selectedUsage = ref('')
const selectedStyle = ref('')
const selectedSeason = ref('')
const starterSearch = ref('')

function resetFilters() {
  selectedIndustry.value = ''
  selectedUsage.value = ''
  selectedStyle.value = ''
  selectedSeason.value = ''
  starterSearch.value = ''
}

const hasActiveFilters = computed(() =>
  selectedIndustry.value.length > 0
  || selectedUsage.value.length > 0
  || selectedStyle.value.length > 0
  || selectedSeason.value.length > 0
  || starterSearch.value.trim().length > 0
)

const filteredStarters = computed(() => {
  const q = starterSearch.value.trim().toLowerCase()
  return EDM_STARTER_TEMPLATES.filter((t) => {
    const industryOk = !selectedIndustry.value || (t.industry || 'General') === selectedIndustry.value
    const usageOk = !selectedUsage.value || t.usage === selectedUsage.value
    const styleOk = !selectedStyle.value || t.style === selectedStyle.value
    const searchOk = !q
      || t.name.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
    return industryOk && usageOk && styleOk && searchOk
  })
})

function starterPreviewImageUrl(starterId: string): string {
  return `/email/template-previews/${starterId}.jpeg`
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
    await apiFetch(`/api/email/templates/${row.id}`, {
      method: 'PATCH',
      body: { name: renameValue.value.trim() }
    })
    toast.add({ title: 'Template renamed', color: 'success' })
    showRename.value = false
    refresh()
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
    await apiFetch('/api/email/templates', {
      method: 'POST',
      body: {
        name: `${template.name} (copy)`,
        subject: template.subject,
        preview_text: template.preview_text,
        body_source: template.body_source,
        template_kind: template.template_kind === 'draft' ? 'draft' : 'template',
        folder_name: template.folder_name || null
      }
    })
    toast.add({ title: 'Template duplicated', color: 'success' })
    refresh()
  } catch {
    toast.add({ title: 'Duplicate failed', color: 'error' })
  } finally {
    busyId.value = null
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────
const showDelete = ref(false)
const deleteTarget = ref<TemplateRow | null>(null)

function confirmDelete(row: TemplateRow) {
  deleteTarget.value = row
  showDelete.value = true
}

async function doDelete() {
  const row = deleteTarget.value
  if (!row) return
  busyId.value = row.id
  try {
    await apiFetch(`/api/email/templates/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'Template deleted', color: 'success' })
    showDelete.value = false
    refresh()
  } catch {
    toast.add({ title: 'Delete failed', color: 'error' })
  } finally {
    busyId.value = null
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
        <UInput
          v-model="starterSearch"
          icon="i-lucide-search"
          placeholder="Search"
          class="w-full"
        />
      </div>
      <nav class="space-y-1 p-3 text-sm">
        <button type="button" class="email-template-nav-item">
          <UIcon name="i-lucide-clock-3" class="size-4" />
          <span>Recently Viewed</span>
        </button>
        <button type="button" class="email-template-nav-item">
          <UIcon name="i-lucide-file" class="size-4" />
          <span>Drafts</span>
        </button>
        <button type="button" class="email-template-nav-item is-active">
          <UIcon name="i-lucide-gallery-horizontal-end" class="size-4" />
          <span>Templates</span>
        </button>
        <button type="button" class="email-template-nav-item">
          <UIcon name="i-lucide-folder-plus" class="size-4" />
          <span>New Folder...</span>
        </button>
        <div class="my-3 border-t border-default" />
        <button type="button" class="email-template-nav-item">
          <UIcon name="i-lucide-user-plus" class="size-4" />
          <span>Invite a Teammate</span>
        </button>
        <button type="button" class="email-template-nav-item">
          <UIcon name="i-lucide-images" class="size-4" />
          <span>Image Library</span>
          <span class="rounded bg-success px-1.5 py-0.5 text-[10px] font-bold text-white">NEW</span>
        </button>
        <button type="button" class="email-template-nav-item">
          <UIcon name="i-lucide-message-circle" class="size-4" />
          <span>Chat with Us</span>
        </button>
      </nav>
    </aside>

    <main class="min-w-0 flex-1 bg-default">
      <div class="flex h-16 items-center justify-between border-b border-default px-6">
        <p class="text-sm font-semibold">
          Templates
        </p>
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
        <section class="space-y-5">
          <div class="flex flex-wrap items-center gap-4 text-sm text-muted">
            <label class="email-template-filter">
              <span>Industry</span>
              <select v-model="selectedIndustry">
                <option value="">
                  All industries
                </option>
                <option v-for="industry in industryOptions" :key="industry" :value="industry">
                  {{ industry }}
                </option>
              </select>
            </label>
            <label class="email-template-filter">
              <span>Usage</span>
              <select v-model="selectedUsage">
                <option value="">
                  All usage
                </option>
                <option v-for="usage in usageOptions" :key="usage" :value="usage">
                  {{ usage }}
                </option>
              </select>
            </label>
            <label class="email-template-filter">
              <span>Season</span>
              <select v-model="selectedSeason">
                <option value="">
                  All seasons
                </option>
                <option v-for="season in seasonOptions" :key="season" :value="season">
                  {{ season }}
                </option>
              </select>
            </label>
            <label class="email-template-filter">
              <span>Brand</span>
              <select v-model="selectedStyle">
                <option value="">
                  All brands
                </option>
                <option v-for="style in styleOptions" :key="style" :value="style">
                  {{ style }}
                </option>
              </select>
            </label>
            <UIcon name="i-lucide-search" class="size-5 text-muted" />
          </div>

          <div class="email-starter-gallery-grid grid gap-x-5 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            <button
              type="button"
              class="email-starter-blank-card flex min-h-[430px] flex-col items-center justify-center rounded-lg border border-default bg-elevated/30 text-center transition hover:border-primary hover:bg-primary/5"
              @click="openComposer()"
            >
              <UIcon name="i-lucide-plus" class="size-10 text-muted" />
              <p class="mt-5 text-sm font-semibold text-muted">
                Create Blank Template
              </p>
            </button>

            <button
              v-for="starter in filteredStarters"
              :key="starter.id"
              type="button"
              class="email-starter-card group min-w-0 text-left"
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
            </button>
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
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-default">
                  {{ group.title }}
                </h3>
                <span class="text-xs text-muted">{{ group.rows.length }} template(s)</span>
              </div>

              <div class="saved-template-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div
                  v-for="row in group.rows"
                  :key="row.id"
                  class="saved-template-card group flex min-h-80 flex-col overflow-hidden rounded-lg border border-default bg-default hover:border-primary hover:shadow-sm"
                >
                  <button
                    type="button"
                    class="flex flex-1 flex-col text-left cursor-pointer"
                    @click="openComposer(row.id)"
                  >
                    <div class="flex h-52 items-start justify-center overflow-hidden bg-elevated/40 p-3">
                      <EmailBuilderEdmDocumentThumbnail
                        :document="templateDocument(row)"
                        :width="300"
                        :max-height="184"
                      />
                    </div>
                    <div class="flex-1 border-t border-default p-4">
                      <div class="mb-2 flex flex-wrap gap-1.5">
                        <UBadge
                          v-if="rowKind(row) === 'draft'"
                          variant="subtle"
                          color="warning"
                          size="xs"
                          label="Draft"
                        />
                        <UBadge
                          v-else
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
                  </button>

                  <div class="flex items-center justify-end gap-1 border-t border-default px-3 py-2">
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

    <UModal v-model:open="showDelete" title="Delete template">
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
              @click="showDelete = false"
            />
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              label="Delete"
              :loading="busyId === deleteTarget?.id"
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

.email-template-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.email-template-filter span {
  color: var(--ui-text);
  font-weight: 500;
}

.email-template-filter select {
  max-width: 11rem;
  border: 0;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 0.875rem;
  outline: none;
}
</style>
