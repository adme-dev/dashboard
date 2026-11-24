<script setup lang="ts">
import type { BannerFolder } from '~/types/banner-studio'
import { bannerFolderPath } from '~/utils/banner-folders'
import { apiErrorDescription } from '~/utils/apiError'

const props = defineProps<{ action: 'add' | 'rename' | 'move', folder?: BannerFolder, folders: BannerFolder[] }>()
const emit = defineEmits<{ close: [], saved: [id: string] }>()
const name = ref(props.action === 'rename' ? props.folder!.name : '')
const parent = ref(props.folder?.parentId || '__root__')
const createId = crypto.randomUUID()
const busy = ref(false)
const error = ref('')
const titles = { add: 'Add folder', rename: 'Rename folder', move: 'Move folder' }
const title = titles[props.action]
const location = props.folder ? bannerFolderPath(props.folders, props.folder.id).map(f => f.name).join(' / ') : 'All folders'
const destinations = computed(() => [
  { label: 'All folders (top level)', value: '__root__' },
  ...props.folders.flatMap(folder => {
    const path = bannerFolderPath(props.folders, folder.id)
    return path.some(f => f.id === props.folder?.id) ? [] : [{ label: path.map(f => f.name).join(' / '), value: folder.id }]
  })
])
const canSave = computed(() => props.action === 'move'
  ? parent.value !== (props.folder!.parentId || '__root__')
  : !!name.value.trim() && name.value.trim().length <= 200)

async function save() {
  if (busy.value || !canSave.value) return
  busy.value = true
  error.value = ''
  try {
    const base = '/api/agency/banner-studio/folders'
    const result = props.action === 'add'
      ? await $fetch<{ id: string }>(base, { method: 'POST', body: { id: createId, name: name.value.trim(), parentId: props.folder?.id || null } })
      : await $fetch<{ id: string }>(`${base}/${props.folder!.id}`, { method: 'PATCH', body: props.action === 'move'
          ? { parentId: parent.value === '__root__' ? null : parent.value }
          : { name: name.value.trim() } })
    emit('saved', result.id)
  } catch (cause) {
    error.value = apiErrorDescription(cause, 'Could not save folder')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal :open="true" :title="title" :description="location" :dismissible="!busy" @update:open="open => { if (!open && !busy) emit('close') }">
    <template #body>
      <UFormField v-if="action === 'move'" label="Destination folder">
        <USelectMenu v-model="parent" :items="destinations" value-key="value" class="w-full" :disabled="busy" />
      </UFormField>
      <UFormField v-else label="Folder name">
        <UInput v-model="name" autofocus :maxlength="200" class="w-full" :disabled="busy" @keydown.enter.prevent="save" />
      </UFormField>
      <UAlert v-if="error" :title="error" color="error" variant="subtle" class="mt-4" />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" :disabled="busy" @click="emit('close')" />
        <UButton :label="title" :loading="busy" :disabled="busy || !canSave" @click="save" />
      </div>
    </template>
  </UModal>
</template>
