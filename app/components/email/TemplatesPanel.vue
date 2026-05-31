<!-- app/components/email/TemplatesPanel.vue -->
<!-- Templates manager (Phase 5). Lists saved edm_templates and offers the
     lifecycle actions around the composer: new / open / duplicate / rename /
     delete. Reuses the existing /api/email/templates CRUD — no new endpoints. -->
<script setup lang="ts">
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
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-muted">
        {{ data?.items?.length ?? 0 }} template(s)
      </p>
      <UButton icon="i-lucide-plus" label="New template" @click="openComposer()" />
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
