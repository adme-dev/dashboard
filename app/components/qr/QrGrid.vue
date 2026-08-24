<script setup lang="ts">
import type { QrCode } from '~/composables/useQrCodes'

const props = defineProps<{ clientId?: string, folderId?: string | null, search?: string }>()
const api = useQrCodes()
const toast = useToast()
const codes = ref<QrCode[]>([])
const loading = ref(false)
const editing = ref<QrCode | null>(null)
const editorOpen = ref(false)
const deleting = ref<QrCode | null>(null)

async function refresh() {
  loading.value = true
  try {
    codes.value = (await api.list({ clientId: props.clientId, folderId: props.folderId ?? undefined, search: props.search })).codes
  } finally {
    loading.value = false
  }
}
watch(() => [props.clientId, props.folderId, props.search], refresh, { immediate: true })
defineExpose({ refresh, openNew: () => { editing.value = null; editorOpen.value = true } })

async function toggle(c: QrCode) {
  await api.update(c.id, { isActive: !c.is_active })
  await refresh()
}
async function confirmDelete() {
  if (!deleting.value) return
  await api.remove(deleting.value.id)
  deleting.value = null
  toast.add({ title: 'QR code deleted', color: 'success' })
  await refresh()
}
</script>

<template>
  <div>
    <div v-if="!loading && !codes.length" class="text-center py-16 text-muted">
      <UIcon name="i-lucide-qr-code" class="w-10 h-10 mx-auto mb-3 opacity-50" />
      <p class="text-sm">No QR codes here yet.</p>
    </div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <QrCard v-for="c in codes" :key="c.id" :code="c" @edit="editing = c; editorOpen = true" @delete="deleting = c" @toggle="toggle(c)" />
    </div>
    <QrEditor v-model:open="editorOpen" :client-id="clientId" :folder-id="folderId" :code="editing" @saved="refresh" />
    <UModal :open="!!deleting" @update:open="v => !v && (deleting = null)" title="Delete QR code?">
      <template #body>
        <p class="text-sm">Deleting <strong>{{ deleting?.name }}</strong> permanently breaks any printed copies — scans will show a "no longer active" page. Consider deactivating instead.</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton variant="ghost" color="neutral" @click="deleting = null">Cancel</UButton>
          <UButton color="error" @click="confirmDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
