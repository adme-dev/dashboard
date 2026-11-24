<script setup lang="ts">
import type { BannerFolder, BannerProjectSummary } from '~/types/banner-studio'
import { bannerFolderPath } from '~/utils/banner-folders'
import { apiErrorDescription } from '~/utils/apiError'

interface BinnedFolder extends BannerFolder { rootId: string, expiresAt: string }
const props = defineProps<{ activeFolders: BannerFolder[] }>()
const emit = defineEmits<{ close: [], restored: [] }>()
const folders = ref<BinnedFolder[]>([])
const projects = ref<(Pick<BannerProjectSummary, 'id' | 'name' | 'clientName'> & { expiresAt: string })[]>([])
const busy = ref(false)
const loading = ref(true)
const error = ref('')
const groups = computed(() => {
  const all = [...props.activeFolders, ...folders.value]
  return folders.value.filter(f => f.id === f.rootId).map((root) => {
    const members = folders.value.filter(f => f.rootId === root.id)
    return { root, path: bannerFolderPath(all, root.id).map(f => f.name).join(' / '), subfolders: members.length - 1 }
  })
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [rows, designs] = await Promise.all([
      $fetch<BinnedFolder[]>('/api/agency/banner-studio/folders?view=bin'),
      $fetch<typeof projects.value>('/api/agency/banner-studio/projects?view=bin')
    ])
    folders.value = rows
    projects.value = designs
  } catch (cause) {
    error.value = apiErrorDescription(cause, 'Could not load the recycling bin')
  } finally { loading.value = false }
}
async function restore(id: string, kind: 'folder' | 'design') {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (kind === 'design') await $fetch(`/api/agency/banner-studio/projects/${id}/restore`, { method: 'POST' })
    else await $fetch(`/api/agency/banner-studio/folders/${id}`, { method: 'PATCH', body: { binned: false } })
    emit('restored')
    await load()
  } catch (cause) {
    error.value = apiErrorDescription(cause, 'Could not restore item')
  } finally { busy.value = false }
}
onMounted(load)
</script>

<template>
  <UModal
    :open="true"
    title="Recycling bin"
    description="Restore deleted folders and individually deleted designs within 30 days."
    @update:open="open => { if (!open) emit('close') }"
  >
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        :title="error"
        :actions="[{ label: 'Retry', onClick: load }]"
      />
      <p v-if="loading" role="status" class="text-sm text-muted">
        Loading recycling bin…
      </p>
      <p v-else-if="!groups.length && !projects.length && !error" class="text-sm text-muted">
        The recycling bin is empty.
      </p>
      <ul v-else class="divide-y divide-default">
        <li v-for="group in groups" :key="group.root.id" class="flex items-start gap-3 py-3">
          <div class="min-w-0 flex-1 space-y-1">
            <p class="break-words text-sm font-medium">
              {{ group.path }}
            </p>
            <p class="text-xs text-muted">
              Restore by {{ new Date(group.root.expiresAt).toLocaleDateString() }} · {{ group.subfolders }} subfolders
            </p>
          </div>
          <UButton
            label="Restore"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="restore(group.root.id, 'folder')"
          />
        </li>
        <li v-for="design in projects" :key="design.id" class="flex items-start gap-3 py-3">
          <div class="min-w-0 flex-1">
            <p class="break-words text-sm font-medium">
              {{ design.name }}
            </p>
            <p class="text-xs text-muted">
              Design · {{ design.clientName || 'Unassigned' }} · Restore by {{ new Date(design.expiresAt).toLocaleDateString() }}
            </p>
          </div>
          <UButton
            label="Restore"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="restore(design.id, 'design')"
          />
        </li>
      </ul>
    </template>
  </UModal>
</template>
