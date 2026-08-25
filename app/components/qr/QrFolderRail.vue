<script setup lang="ts">
import type { QrFolder } from '~/composables/useQrCodes'

const props = defineProps<{ clientId: string, totalCount?: number }>()
const folderId = defineModel<string | null>('folderId', { default: null })
const api = useQrCodes()
const toast = useToast()
const folders = ref<QrFolder[]>([])

const newOpen = ref(false)
const newName = ref('')
const renaming = ref<QrFolder | null>(null)
const renameName = ref('')
const removing = ref<QrFolder | null>(null)
const busy = ref(false)

async function refresh() {
  folders.value = props.clientId ? (await api.folders(props.clientId)).folders : []
}
watch(() => props.clientId, refresh, { immediate: true })
defineExpose({ refresh })

async function create() {
  if (!newName.value.trim()) return
  busy.value = true
  try {
    const { folder } = await api.createFolder({ clientId: props.clientId, name: newName.value.trim() })
    newName.value = ''
    newOpen.value = false
    await refresh()
    folderId.value = folder.id
  } catch (e: any) {
    toast.add({ title: 'Could not create folder', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    busy.value = false
  }
}
function startRename(f: QrFolder) {
  renaming.value = f
  renameName.value = f.name
}
async function rename() {
  if (!renaming.value || !renameName.value.trim()) return
  busy.value = true
  try {
    await api.renameFolder(renaming.value.id, renameName.value.trim())
    renaming.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not rename folder', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    busy.value = false
  }
}
async function remove() {
  if (!removing.value) return
  busy.value = true
  try {
    await api.deleteFolder(removing.value.id)
    if (folderId.value === removing.value.id) folderId.value = null
    removing.value = null
    toast.add({ title: 'Folder deleted', description: 'Its codes are still here under All codes.', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not delete folder', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    busy.value = false
  }
}
const itemClass = (active: boolean) => [
  'group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition',
  active ? 'bg-elevated font-medium text-highlighted' : 'text-default hover:bg-elevated/60'
]
</script>

<template>
  <nav class="space-y-4" aria-label="Folders">
    <div class="space-y-0.5">
      <button type="button" :class="itemClass(folderId === null)" @click="() => { folderId = null }">
        <UIcon name="i-lucide-layers" class="size-4 shrink-0 text-muted" />
        <span class="flex-1 truncate">All codes</span>
        <span v-if="totalCount != null" class="text-xs tabular-nums text-muted">{{ totalCount }}</span>
      </button>
      <div v-for="f in folders" :key="f.id" class="group/f relative">
        <button type="button" :class="itemClass(folderId === f.id)" @click="() => { folderId = f.id }">
          <UIcon :name="folderId === f.id ? 'i-lucide-folder-open' : 'i-lucide-folder'" class="size-4 shrink-0 text-muted" />
          <span class="flex-1 truncate">{{ f.name }}</span>
          <span class="text-xs tabular-nums text-muted group-hover/f:invisible">{{ f.code_count }}</span>
        </button>
        <UDropdownMenu
          :items="[[
            { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startRename(f) },
            { label: 'Delete folder', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { removing = f } }
          ]]"
        >
          <UButton
            icon="i-lucide-ellipsis"
            variant="ghost"
            color="neutral"
            size="xs"
            class="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition focus-visible:opacity-100 group-hover/f:opacity-100 data-[state=open]:opacity-100"
            :aria-label="`Folder actions for ${f.name}`"
          />
        </UDropdownMenu>
      </div>
    </div>

    <UButton
      block
      variant="ghost"
      color="neutral"
      size="sm"
      icon="i-lucide-folder-plus"
      class="justify-start"
      @click="() => { newOpen = true }"
    >
      New folder
    </UButton>

    <UModal v-model:open="newOpen" title="New folder" description="Group codes by campaign, location, or print run.">
      <template #body>
        <UFormField label="Folder name">
          <UInput
            v-model="newName"
            autofocus
            placeholder="Spring catalogue"
            class="w-full"
            @keydown.enter="create"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { newOpen = false }">
            Cancel
          </UButton>
          <UButton :disabled="!newName.trim()" :loading="busy" @click="create">
            Create folder
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!renaming" title="Rename folder" @update:open="v => !v && (renaming = null)">
      <template #body>
        <UFormField label="Folder name">
          <UInput
            v-model="renameName"
            autofocus
            class="w-full"
            @keydown.enter="rename"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { renaming = null }">
            Cancel
          </UButton>
          <UButton :disabled="!renameName.trim()" :loading="busy" @click="rename">
            Save
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal :open="!!removing" title="Delete folder?" @update:open="v => !v && (removing = null)">
      <template #body>
        <p class="text-sm">
          <strong>{{ removing?.name }}</strong> will be removed. Its {{ removing?.code_count ?? 0 }} {{ removing?.code_count === 1 ? 'code stays' : 'codes stay' }} live and move to All codes — nothing printed is affected.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { removing = null }">
            Cancel
          </UButton>
          <UButton color="error" :loading="busy" @click="remove">
            Delete folder
          </UButton>
        </div>
      </template>
    </UModal>
  </nav>
</template>
