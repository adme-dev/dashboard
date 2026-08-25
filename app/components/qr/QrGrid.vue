<script setup lang="ts">
import type { QrCode } from '~/composables/useQrCodes'

const props = defineProps<{ clientId?: string, folderId?: string | null, search?: string, showClient?: boolean }>()
const emit = defineEmits<{ (e: 'loaded', codes: QrCode[]): void }>()
const api = useQrCodes()
const toast = useToast()
const codes = ref<QrCode[]>([])
const loading = ref(true)
const loadError = ref('')
const editing = ref<QrCode | null>(null)
const editorOpen = ref(false)
const deleting = ref<QrCode | null>(null)
const deletingBusy = ref(false)

async function refresh() {
  loading.value = true
  loadError.value = ''
  try {
    codes.value = (await api.list({ clientId: props.clientId, folderId: props.folderId ?? undefined, search: props.search })).codes
    emit('loaded', codes.value)
  } catch (e: any) {
    loadError.value = e?.data?.statusMessage ?? 'Could not load QR codes'
  } finally {
    loading.value = false
  }
}
watch(() => [props.clientId, props.folderId, props.search], refresh, { immediate: true })
function openNew() {
  editing.value = null
  editorOpen.value = true
}
defineExpose({ refresh, openNew })

const filtered = computed(() => !!(props.search?.trim() || props.folderId))

async function toggle(c: QrCode) {
  try {
    await api.update(c.id, { isActive: !c.is_active })
    toast.add({ title: c.is_active ? 'QR code deactivated' : 'QR code activated', description: c.is_active ? 'Scans now land on a "no longer active" page.' : 'Scans redirect to the destination again.', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' })
  }
}
async function confirmDelete() {
  if (!deleting.value) return
  deletingBusy.value = true
  try {
    await api.remove(deleting.value.id)
    deleting.value = null
    toast.add({ title: 'QR code deleted', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not delete', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    deletingBusy.value = false
  }
}
</script>

<template>
  <div>
    <!-- Loading: skeleton cards so the layout doesn't jump when data lands. -->
    <div v-if="loading && !codes.length" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <UCard v-for="i in 3" :key="i" :ui="{ body: 'p-4' }">
        <div class="flex gap-4">
          <USkeleton class="size-28 shrink-0 rounded-xl" />
          <div class="flex-1 space-y-2 pt-1">
            <USkeleton class="h-4 w-2/3" />
            <USkeleton class="h-3 w-1/2" />
            <USkeleton class="h-3 w-3/4" />
            <USkeleton class="mt-4 h-6 w-10" />
          </div>
        </div>
      </UCard>
    </div>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Couldn't load QR codes"
      :description="loadError"
      :actions="[{ label: 'Try again', variant: 'soft', color: 'error', onClick: refresh }]"
    />

    <div v-else-if="!codes.length" class="rounded-xl border border-dashed border-default px-6 py-16 text-center">
      <div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-elevated">
        <UIcon :name="filtered ? 'i-lucide-search-x' : 'i-lucide-qr-code'" class="size-6 text-muted" />
      </div>
      <template v-if="filtered">
        <p class="font-medium">
          No codes match
        </p>
        <p class="mx-auto mt-1 max-w-sm text-sm text-muted">
          Try a different search, or clear the folder filter.
        </p>
      </template>
      <template v-else>
        <p class="font-medium">
          {{ clientId ? 'No QR codes for this client yet' : 'No QR codes yet' }}
        </p>
        <p class="mx-auto mt-1 max-w-sm text-sm text-muted">
          Create a code once, print it anywhere, and change where it points whenever the campaign changes.
        </p>
        <UButton class="mt-5" icon="i-lucide-plus" @click="openNew">
          New QR code
        </UButton>
      </template>
    </div>

    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" :class="loading ? 'opacity-60 transition' : ''">
      <QrCard
        v-for="c in codes"
        :key="c.id"
        :code="c"
        :show-client="showClient"
        @edit="editing = c; editorOpen = true"
        @delete="deleting = c"
        @toggle="toggle(c)"
      />
    </div>

    <QrEditor
      v-model:open="editorOpen"
      :client-id="clientId"
      :folder-id="folderId"
      :code="editing"
      @saved="refresh"
    />

    <UModal :open="!!deleting" title="Delete QR code?" @update:open="v => !v && (deleting = null)">
      <template #body>
        <p class="text-sm">
          Deleting <strong>{{ deleting?.name }}</strong> permanently breaks any printed copies — scans will land on a "no longer active" page and its scan history is lost.
        </p>
        <p class="mt-2 text-sm text-muted">
          If the code might still be out in the world, deactivate it instead — you can switch it back on later.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="deleting = null">
            Cancel
          </UButton>
          <UButton
            v-if="deleting?.is_active"
            variant="soft"
            color="neutral"
            icon="i-lucide-power"
            @click="() => { const c = deleting!; deleting = null; toggle(c) }"
          >
            Deactivate instead
          </UButton>
          <UButton color="error" :loading="deletingBusy" @click="confirmDelete">
            Delete permanently
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
