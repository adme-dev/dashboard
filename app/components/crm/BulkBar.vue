<script setup lang="ts">
// F9 — bulk action bar. Visible while rows are selected; runs one client-scoped
// mutation via the /bulk endpoint, then asks the parent to clear + refresh.
import type { CrmEntity } from '~/types/crm'
import { fieldDef } from '~/utils/crmFilterFields'

const props = defineProps<{ entity: CrmEntity, clientId: string, selectedIds: string[] }>()
const emit = defineEmits<{ done: [] }>()

const base = inject<string>('crmApiBase', '/api/crm')
const toast = useToast()
const busy = ref(false)

const tagOpen = ref(false)
const tagValues = ref<string[]>([])
const deleteOpen = ref(false)

// Status options depend on entity (opps use status; contacts use lifecycle).
const statusField = computed(() => props.entity === 'opportunities' ? 'status' : 'lifecycle_stage')
const statusOptions = computed(() => fieldDef(props.entity, statusField.value)?.options ?? [])
const canTag = computed(() => props.entity !== 'opportunities')

async function run(action: string, payload: Record<string, unknown>) {
  busy.value = true
  try {
    const res = await $fetch<{ updated: number }>(`${base}/bulk`, {
      method: 'POST',
      body: { client_id: props.clientId, entity: props.entity, action, ids: props.selectedIds, payload },
    })
    toast.add({ title: `${res.updated} ${props.entity} updated`, color: 'success' })
    emit('done')
  } catch (e: any) {
    toast.add({ title: 'Bulk action failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    busy.value = false
  }
}

async function applyTags() {
  if (!tagValues.value.length) return
  await run('tag', { tags: tagValues.value })
  tagValues.value = []
  tagOpen.value = false
}
async function setStatus(value: string) { await run('status', { value }) }
async function confirmDelete() { await run('delete', {}); deleteOpen.value = false }
</script>

<template>
  <div class="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
    <span class="text-sm font-medium">{{ selectedIds.length }} selected</span>
    <div class="h-4 w-px bg-default" />

    <!-- Tag (contacts only) -->
    <UPopover v-if="canTag" v-model:open="tagOpen">
      <UButton icon="i-lucide-tag" size="xs" variant="ghost" color="neutral" :disabled="busy">Tag</UButton>
      <template #content>
        <div class="w-64 p-3 space-y-2">
          <UFormField label="Add tags">
            <UInputTags v-model="tagValues" placeholder="Add tag, Enter" />
          </UFormField>
          <div class="flex justify-end">
            <UButton size="xs" color="primary" :disabled="!tagValues.length" :loading="busy" @click="applyTags">Apply</UButton>
          </div>
        </div>
      </template>
    </UPopover>

    <!-- Set status / lifecycle -->
    <UDropdownMenu
      :items="[statusOptions.map(o => ({ label: o.label, onSelect: () => setStatus(o.value) }))]"
    >
      <UButton icon="i-lucide-flag" size="xs" variant="ghost" color="neutral" :disabled="busy">
        {{ entity === 'opportunities' ? 'Set status' : 'Set lifecycle' }}
      </UButton>
    </UDropdownMenu>

    <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" :disabled="busy" @click="deleteOpen = true">
      Delete
    </UButton>

    <div class="flex-1" />
    <UButton icon="i-lucide-x" size="xs" variant="ghost" color="neutral" @click="emit('done')">Clear</UButton>

    <UModal v-model:open="deleteOpen">
      <template #content>
        <div class="p-4 space-y-4">
          <div>
            <h3 class="text-sm font-semibold">Delete {{ selectedIds.length }} {{ entity }}?</h3>
            <p class="text-xs text-muted mt-1">They’ll be removed from this CRM. This can’t be undone here.</p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="deleteOpen = false">Cancel</UButton>
            <UButton color="error" :loading="busy" @click="confirmDelete">Delete</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
