<script setup lang="ts">
import type { ChatChannel } from '~/types'

const props = defineProps<{
  channel: ChatChannel
}>()

const emit = defineEmits<{
  'close': []
  'updated': [channel: ChatChannel]
  'left': []
  'archived': []
}>()

const toast = useToast()

// Form state
const name = ref(props.channel.name)
const description = ref(props.channel.description || '')
const saving = ref(false)
const leaving = ref(false)
const showLeaveConfirm = ref(false)
const showArchiveConfirm = ref(false)
const archiving = ref(false)

const isOwnerOrAdmin = computed(() => {
  // This would need to be passed in or fetched — for now default to true for simplicity
  return true
})

const isDM = computed(() => props.channel.type === 'dm')

async function handleSave() {
  if (!name.value.trim()) return
  saving.value = true
  try {
    const updated = await $fetch(`/api/chat/channels/${props.channel.id}`, {
      method: 'PATCH',
      body: { name: name.value.trim(), description: description.value.trim() || null }
    })
    emit('updated', updated as ChatChannel)
    toast.add({ title: 'Channel updated', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to update channel', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function handleLeave() {
  leaving.value = true
  try {
    await $fetch(`/api/chat/channels/${props.channel.id}/leave`, { method: 'POST' })
    emit('left')
    toast.add({ title: 'Left channel', color: 'success' })
  } catch (err: any) {
    toast.add({
      title: 'Cannot leave',
      description: err?.data?.statusMessage || 'Failed to leave channel',
      color: 'error'
    })
  } finally {
    leaving.value = false
    showLeaveConfirm.value = false
  }
}

async function handleArchive() {
  archiving.value = true
  try {
    await $fetch(`/api/chat/channels/${props.channel.id}`, {
      method: 'PATCH',
      body: { archive: !props.channel.archived_at }
    })
    emit('archived')
    toast.add({
      title: props.channel.archived_at ? 'Channel unarchived' : 'Channel archived',
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Failed to archive channel', color: 'error' })
  } finally {
    archiving.value = false
    showArchiveConfirm.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <h3 class="text-lg font-semibold">Channel Settings</h3>

    <!-- Name & Description -->
    <div v-if="!isDM && isOwnerOrAdmin" class="space-y-4">
      <div>
        <label class="text-sm font-medium mb-1 block">Channel name</label>
        <UInput v-model="name" icon="i-lucide-hash" />
      </div>

      <div>
        <label class="text-sm font-medium mb-1 block">Description</label>
        <UTextarea
          v-model="description"
          placeholder="What is this channel about?"
          :rows="2"
          autoresize
          :maxrows="4"
        />
      </div>

      <UButton
        label="Save Changes"
        color="primary"
        :loading="saving"
        :disabled="!name.trim() || (name === channel.name && description === (channel.description || ''))"
        @click="handleSave"
      />
    </div>

    <!-- Read-only info for DMs or non-admins -->
    <div v-else class="space-y-2">
      <div class="text-sm">
        <span class="font-medium text-muted">Channel:</span>
        <span class="ml-2">{{ channel.name }}</span>
      </div>
      <div v-if="channel.description" class="text-sm">
        <span class="font-medium text-muted">Description:</span>
        <span class="ml-2">{{ channel.description }}</span>
      </div>
      <div class="text-sm">
        <span class="font-medium text-muted">Type:</span>
        <span class="ml-2 capitalize">{{ channel.type === 'dm' ? 'Direct Message' : channel.type }}</span>
      </div>
      <div class="text-sm">
        <span class="font-medium text-muted">Created:</span>
        <span class="ml-2">{{ new Date(channel.created_at).toLocaleDateString() }}</span>
      </div>
    </div>

    <!-- Danger Zone -->
    <div v-if="!isDM" class="border-t border-default pt-4 space-y-3">
      <p class="text-sm font-medium text-muted">Actions</p>

      <!-- Archive -->
      <div v-if="isOwnerOrAdmin" class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">{{ channel.archived_at ? 'Unarchive' : 'Archive' }} channel</p>
          <p class="text-xs text-muted">{{ channel.archived_at ? 'Restore this channel' : 'Hide channel from sidebar' }}</p>
        </div>
        <UButton
          :label="channel.archived_at ? 'Unarchive' : 'Archive'"
          variant="soft"
          color="warning"
          size="sm"
          @click="showArchiveConfirm = true"
        />
      </div>

      <!-- Leave -->
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">Leave channel</p>
          <p class="text-xs text-muted">You won't receive messages from this channel</p>
        </div>
        <UButton
          label="Leave"
          variant="soft"
          color="error"
          size="sm"
          @click="showLeaveConfirm = true"
        />
      </div>
    </div>

    <!-- Leave Confirmation -->
    <UModal v-model:open="showLeaveConfirm">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-2">Leave Channel</h3>
          <p class="text-sm text-muted mb-4">
            Are you sure you want to leave <strong>#{{ channel.name }}</strong>? You can rejoin later if the channel is public.
          </p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="showLeaveConfirm = false">Cancel</UButton>
            <UButton color="error" :loading="leaving" @click="handleLeave">Leave Channel</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Archive Confirmation -->
    <UModal v-model:open="showArchiveConfirm">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-2">{{ channel.archived_at ? 'Unarchive' : 'Archive' }} Channel</h3>
          <p class="text-sm text-muted mb-4">
            {{ channel.archived_at
              ? `Unarchive #${channel.name}? It will appear in the sidebar again.`
              : `Archive #${channel.name}? Members can still view history but won't be able to send messages.`
            }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="showArchiveConfirm = false">Cancel</UButton>
            <UButton color="warning" :loading="archiving" @click="handleArchive">
              {{ channel.archived_at ? 'Unarchive' : 'Archive' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
