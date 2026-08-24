<script setup lang="ts">
import type { QrFolder } from '~/composables/useQrCodes'

const props = defineProps<{ clientId: string }>()
const folderId = defineModel<string | null>('folderId', { default: null })
const api = useQrCodes()
const toast = useToast()
const folders = ref<QrFolder[]>([])
const newOpen = ref(false)
const newName = ref('')

async function refresh() {
  folders.value = props.clientId ? (await api.folders(props.clientId)).folders : []
}
watch(() => props.clientId, refresh, { immediate: true })
defineExpose({ refresh })

async function create() {
  try {
    await api.createFolder({ clientId: props.clientId, name: newName.value })
    newName.value = ''
    newOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not create folder', description: e?.data?.statusMessage, color: 'error' })
  }
}
async function remove(f: QrFolder) {
  await api.deleteFolder(f.id)
  if (folderId.value === f.id) folderId.value = null
  await refresh()
}
</script>

<template>
  <nav class="space-y-1">
    <UButton block variant="ghost" color="neutral" :class="folderId === null ? 'bg-elevated' : ''" icon="i-lucide-layers" class="justify-start" @click="() => { folderId = null }">All codes</UButton>
    <div v-for="f in folders" :key="f.id" class="group flex items-center">
      <UButton block variant="ghost" color="neutral" :class="folderId === f.id ? 'bg-elevated' : ''" icon="i-lucide-folder" class="justify-start flex-1" @click="() => { folderId = f.id }">
        <span class="truncate">{{ f.name }}</span><span class="ml-auto text-xs text-muted tabular-nums">{{ f.code_count }}</span>
      </UButton>
      <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" class="opacity-0 group-hover:opacity-100" @click="remove(f)" />
    </div>
    <UButton block variant="soft" size="sm" icon="i-lucide-folder-plus" class="mt-2" @click="() => { newOpen = true }">New folder</UButton>
    <UModal v-model:open="newOpen" title="New folder">
      <template #body><UFormField label="Folder name"><UInput v-model="newName" autofocus @keydown.enter="create" /></UFormField></template>
      <template #footer><div class="flex justify-end gap-2 w-full"><UButton variant="ghost" color="neutral" @click="() => { newOpen = false }">Cancel</UButton><UButton :disabled="!newName.trim()" @click="create">Create</UButton></div></template>
    </UModal>
  </nav>
</template>
