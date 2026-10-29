<script setup lang="ts">
// Category rows reuse folder_name and still emit folder:<name>.
// New category emits newFolder; root opens the category modal.
// Shared defaults emits select('shared'). Client filtering stays in root.
// /settings/members is the agency invite page ("Invite people").
// /admin/invitations is an unfinished stub and /admin/users is admin-only.
// /support is the Support Centre. Agency chat is team messaging, so this
// rail only links there. It does not send invitations or open a chat.
const props = defineProps<{
  activeView: string
  folders: string[]
}>()

const emit = defineEmits<{
  select: [view: string]
  newFolder: []
  imageLibrary: []
}>()

const views = [
  { id: 'recent', label: 'Recently viewed', icon: 'i-lucide-clock-3' },
  { id: 'drafts', label: 'Drafts', icon: 'i-lucide-file' },
  { id: 'templates', label: 'All templates', icon: 'i-lucide-gallery-horizontal-end' },
  { id: 'shared', label: 'Shared defaults', icon: 'i-lucide-library' }
] as const

function folderView(name: string) {
  return `folder:${name}`
}

function isActive(view: string) {
  return props.activeView === view
}
</script>

<template>
  <aside
    class="email-template-library-sidebar flex h-full min-h-0 w-full shrink-0 flex-col bg-elevated/20 lg:w-64"
    aria-label="Template library"
  >
    <div class="border-b border-default px-4 py-4">
      <p class="text-sm font-semibold text-default">
        Library
      </p>
      <p class="mt-1 text-xs text-muted">
        Saved and shared templates
      </p>
    </div>

    <nav class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3" aria-label="Template views">
      <div class="flex flex-col gap-1">
        <UButton
          v-for="view in views"
          :key="view.id"
          :label="view.label"
          :icon="view.icon"
          :active="isActive(view.id)"
          :color="isActive(view.id) ? 'primary' : 'neutral'"
          :variant="isActive(view.id) ? 'soft' : 'ghost'"
          :aria-current="isActive(view.id) ? 'page' : undefined"
          size="sm"
          block
          class="justify-start"
          @click="emit('select', view.id)"
        />
      </div>

      <div class="flex flex-col gap-1 border-t border-default pt-3">
        <p class="px-2.5 pb-1 text-xs font-medium text-muted">
          Categories
        </p>
        <p v-if="folders.length === 0" class="px-2.5 py-1.5 text-sm text-muted">
          No categories yet.
        </p>
        <UButton
          v-for="(folder, index) in folders"
          :key="`${index}:${folder}`"
          :label="folder"
          icon="i-lucide-folder"
          :active="isActive(folderView(folder))"
          :color="isActive(folderView(folder)) ? 'primary' : 'neutral'"
          :variant="isActive(folderView(folder)) ? 'soft' : 'ghost'"
          :aria-current="isActive(folderView(folder)) ? 'page' : undefined"
          size="sm"
          block
          class="justify-start"
          @click="emit('select', folderView(folder))"
        />
        <UButton
          label="New category"
          icon="i-lucide-folder-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="justify-start"
          @click="emit('newFolder')"
        />
      </div>

      <div class="mt-auto flex flex-col gap-1 border-t border-default pt-3">
        <UButton
          to="/settings/members"
          label="Invite a teammate"
          icon="i-lucide-user-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="justify-start"
        />
        <UButton
          label="Image library"
          icon="i-lucide-images"
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="justify-start"
          @click="emit('imageLibrary')"
        />
        <UButton
          to="/support"
          label="Help & support"
          icon="i-lucide-life-buoy"
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="justify-start"
        />
      </div>
    </nav>
  </aside>
</template>
