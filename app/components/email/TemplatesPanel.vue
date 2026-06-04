<!-- app/components/email/TemplatesPanel.vue -->
<!-- Templates manager (Phase 5). Lists saved edm_templates and offers the
     lifecycle actions around the composer: new / open / duplicate / rename /
     delete. Reuses the existing /api/email/templates CRUD — no new endpoints. -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { EDM_STARTER_TEMPLATES } from '~~/app/utils/edmPresets'

interface TemplateRow {
  id: string
  name: string
  subject: string | null
  updated_at: string
}
interface FullTemplate {
  name: string
  subject: string | null
  preview_text: string | null
  body_source: unknown
}

const toast = useToast()

const { data, refresh, pending } = await useFetch<{ items: TemplateRow[] }>(
  '/api/email/templates',
  { default: () => ({ items: [] }) }
)

const busyId = ref<string | null>(null)

function openComposer(id?: string) {
  navigateTo(id ? `/agency/email/compose?id=${id}` : '/agency/email/compose')
}

function openStarter(starterId: string) {
  navigateTo(`/agency/email/compose?starter=${starterId}`)
}

// ── Starter gallery: filters + search ────────────────────────────────────────
const usageOptions = computed(() =>
  Array.from(new Set(EDM_STARTER_TEMPLATES.map(t => t.usage)))
)
const styleOptions = computed(() =>
  Array.from(new Set(EDM_STARTER_TEMPLATES.map(t => t.style)))
)

const selectedUsages = ref<string[]>([])
const selectedStyles = ref<string[]>([])
const starterSearch = ref('')

function toggleUsage(usage: string) {
  selectedUsages.value = selectedUsages.value.includes(usage)
    ? selectedUsages.value.filter(u => u !== usage)
    : [...selectedUsages.value, usage]
}
function toggleStyle(style: string) {
  selectedStyles.value = selectedStyles.value.includes(style)
    ? selectedStyles.value.filter(s => s !== style)
    : [...selectedStyles.value, style]
}
function resetFilters() {
  selectedUsages.value = []
  selectedStyles.value = []
  starterSearch.value = ''
}

const hasActiveFilters = computed(() =>
  selectedUsages.value.length > 0
  || selectedStyles.value.length > 0
  || starterSearch.value.trim().length > 0
)

const filteredStarters = computed(() => {
  const q = starterSearch.value.trim().toLowerCase()
  return EDM_STARTER_TEMPLATES.filter((t) => {
    const usageOk = selectedUsages.value.length === 0 || selectedUsages.value.includes(t.usage)
    const styleOk = selectedStyles.value.length === 0 || selectedStyles.value.includes(t.style)
    const searchOk = !q
      || t.name.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
    return usageOk && styleOk && searchOk
  })
})

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
    await $fetch(`/api/email/templates/${row.id}`, {
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
    const { template } = await $fetch<{ template: FullTemplate }>(`/api/email/templates/${row.id}`)
    await $fetch('/api/email/templates', {
      method: 'POST',
      body: {
        name: `${template.name} (copy)`,
        subject: template.subject,
        preview_text: template.preview_text,
        body_source: template.body_source
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
    await $fetch(`/api/email/templates/${row.id}`, { method: 'DELETE' })
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
</script>

<template>
  <div class="space-y-8">
    <div class="flex justify-between items-center">
      <div>
        <p class="text-sm font-medium">
          Templates
        </p>
        <p class="text-sm text-muted">
          Start blank, use a starter layout, or reopen a saved template.
        </p>
      </div>
      <UButton icon="i-lucide-plus" label="Blank template" @click="openComposer()" />
    </div>

    <section class="space-y-4">
      <div class="flex items-center justify-between gap-4">
        <p class="text-xs font-semibold uppercase text-muted">
          Starter templates
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

      <!-- Filters -->
      <div class="space-y-3 rounded-lg border border-default bg-elevated/30 p-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span class="w-16 shrink-0 text-xs font-semibold uppercase text-muted">Usage</span>
          <div class="flex flex-wrap gap-2">
            <UButton
              size="xs"
              :variant="selectedUsages.length === 0 ? 'solid' : 'outline'"
              :color="selectedUsages.length === 0 ? 'primary' : 'neutral'"
              label="All"
              @click="selectedUsages = []"
            />
            <UButton
              v-for="usage in usageOptions"
              :key="usage"
              size="xs"
              :variant="selectedUsages.includes(usage) ? 'solid' : 'outline'"
              :color="selectedUsages.includes(usage) ? 'primary' : 'neutral'"
              :label="usage"
              @click="toggleUsage(usage)"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span class="w-16 shrink-0 text-xs font-semibold uppercase text-muted">Style</span>
          <div class="flex flex-wrap gap-2">
            <UButton
              size="xs"
              :variant="selectedStyles.length === 0 ? 'solid' : 'outline'"
              :color="selectedStyles.length === 0 ? 'primary' : 'neutral'"
              label="All"
              @click="selectedStyles = []"
            />
            <UButton
              v-for="style in styleOptions"
              :key="style"
              size="xs"
              :variant="selectedStyles.includes(style) ? 'solid' : 'outline'"
              :color="selectedStyles.includes(style) ? 'primary' : 'neutral'"
              :label="style"
              @click="toggleStyle(style)"
            />
          </div>
        </div>

        <UInput
          v-model="starterSearch"
          icon="i-lucide-search"
          placeholder="Search templates by name or description…"
          class="w-full"
        />
      </div>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          class="flex min-h-72 flex-col rounded-lg border border-dashed border-default bg-elevated/40 p-4 text-center hover:border-primary hover:bg-primary/5"
          @click="openComposer()"
        >
          <div class="flex flex-1 items-center justify-center rounded-md bg-default">
            <UIcon name="i-lucide-plus" class="h-8 w-8 text-muted" />
          </div>
          <p class="mt-4 font-semibold">
            Create blank template
          </p>
          <p class="mt-1 text-sm text-muted">
            Start from Basic blocks and build manually.
          </p>
        </button>

        <button
          v-for="starter in filteredStarters"
          :key="starter.id"
          type="button"
          class="group flex flex-col overflow-hidden rounded-lg border border-default bg-default text-left hover:border-primary hover:shadow-sm"
          @click="openStarter(starter.id)"
        >
          <div class="flex items-start justify-center overflow-hidden bg-elevated/40 p-3" style="height: 220px">
            <EmailBuilderEdmTemplateThumbnail
              :template-id="starter.id"
              :width="300"
              :max-height="196"
            />
          </div>
          <div class="border-t border-default p-4">
            <div class="flex items-center gap-2">
              <UBadge
                v-if="starter.isNew"
                color="success"
                size="xs"
                label="NEW"
              />
              <p class="font-semibold group-hover:text-primary">
                {{ starter.name }}
              </p>
            </div>
            <p class="mt-2 text-sm text-muted leading-snug">
              {{ starter.description }}
            </p>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <UBadge
                variant="subtle"
                color="neutral"
                size="xs"
                :label="starter.usage"
              />
              <UBadge
                variant="subtle"
                color="neutral"
                size="xs"
                :label="starter.style"
              />
            </div>
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
          {{ data?.items?.length ?? 0 }} template(s)
        </p>
      </div>

      <div v-if="pending" class="text-sm text-muted">
        Loading…
      </div>
      <div v-else-if="!data?.items?.length" class="text-sm text-muted py-8 text-center">
        No templates yet. Build one in the composer and save it to reuse across campaigns.
      </div>

      <div v-else class="border border-default rounded-lg divide-y divide-default">
        <div
          v-for="row in data.items"
          :key="row.id"
          class="flex items-center justify-between gap-4 px-4 py-3"
        >
          <button
            type="button"
            class="min-w-0 text-left cursor-pointer group"
            @click="openComposer(row.id)"
          >
            <p class="font-medium truncate group-hover:text-primary">
              {{ row.name }}
            </p>
            <p class="text-sm text-muted truncate">
              {{ row.subject || 'No subject' }} · Updated {{ fmtDate(row.updated_at) }}
            </p>
          </button>

          <div class="flex items-center gap-1 shrink-0">
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
