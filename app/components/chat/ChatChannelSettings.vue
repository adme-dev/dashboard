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

// Notification preferences
const notifyLevel = ref<'all' | 'mentions' | 'nothing'>('all')
const isMuted = ref(false)
const savingNotifs = ref(false)

const notifyOptions = [
  { value: 'all', label: 'All messages', description: 'Get notified for every new message', icon: 'i-lucide-bell' },
  { value: 'mentions', label: 'Mentions only', description: 'Only when you\'re @mentioned', icon: 'i-lucide-at-sign' },
  { value: 'nothing', label: 'Nothing', description: 'No notifications from this channel', icon: 'i-lucide-bell-off' }
]

const muteOptions = [
  { label: '15 minutes', value: 15 },
  { label: '1 hour', value: 60 },
  { label: '8 hours', value: 480 },
  { label: '24 hours', value: 1440 },
  { label: 'Until I turn it back on', value: 525600 } // ~1 year
]

// Fetch current preferences
async function fetchNotifPrefs() {
  try {
    const pref = await $fetch<{ notify_level: string; muted_until: string | null }>(
      `/api/chat/channels/${props.channel.id}/notifications`
    )
    notifyLevel.value = (pref.notify_level as 'all' | 'mentions' | 'nothing') || 'all'
    isMuted.value = pref.muted_until ? new Date(pref.muted_until) > new Date() : false
  } catch {
    // Default to all
  }
}

async function handleNotifyChange(level: string) {
  notifyLevel.value = level as 'all' | 'mentions' | 'nothing'
  savingNotifs.value = true
  try {
    await $fetch(`/api/chat/channels/${props.channel.id}/mute`, {
      method: 'PATCH',
      body: { notifyLevel: level, muteDuration: isMuted.value ? undefined : 0 }
    })
    toast.add({ title: 'Notification preference updated', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to update preferences', color: 'error' })
  } finally {
    savingNotifs.value = false
  }
}

async function handleMute(minutes: number) {
  savingNotifs.value = true
  isMuted.value = true
  try {
    await $fetch(`/api/chat/channels/${props.channel.id}/mute`, {
      method: 'PATCH',
      body: { muteDuration: minutes }
    })
    toast.add({ title: 'Channel muted', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to mute channel', color: 'error' })
  } finally {
    savingNotifs.value = false
  }
}

async function handleUnmute() {
  savingNotifs.value = true
  isMuted.value = false
  try {
    await $fetch(`/api/chat/channels/${props.channel.id}/mute`, {
      method: 'PATCH',
      body: { muteDuration: 0 }
    })
    toast.add({ title: 'Channel unmuted', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to unmute channel', color: 'error' })
  } finally {
    savingNotifs.value = false
  }
}

const isOwnerOrAdmin = computed(() => {
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

onMounted(fetchNotifPrefs)
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

    <!-- Notification Preferences -->
    <div class="border-t border-default pt-4">
      <p class="text-sm font-medium mb-3">Notifications</p>

      <div class="space-y-2">
        <button
          v-for="opt in notifyOptions"
          :key="opt.value"
          :class="[
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left',
            notifyLevel === opt.value
              ? 'border-primary/50 bg-primary/5'
              : 'border-default hover:bg-elevated/50'
          ]"
          @click="handleNotifyChange(opt.value)"
        >
          <UIcon :name="opt.icon" :class="['w-4 h-4 shrink-0', notifyLevel === opt.value ? 'text-primary' : 'text-muted']" />
          <div class="flex-1 min-w-0">
            <span class="text-sm font-medium">{{ opt.label }}</span>
            <p class="text-xs text-muted">{{ opt.description }}</p>
          </div>
          <UIcon
            v-if="notifyLevel === opt.value"
            name="i-lucide-check"
            class="w-4 h-4 text-primary shrink-0"
          />
        </button>
      </div>

      <!-- Mute -->
      <div class="mt-4">
        <div v-if="isMuted" class="flex items-center justify-between px-3 py-2.5 rounded-lg bg-warning/10 border border-warning/20">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-volume-x" class="w-4 h-4 text-warning" />
            <span class="text-sm font-medium">Channel is muted</span>
          </div>
          <UButton
            label="Unmute"
            size="xs"
            color="warning"
            variant="soft"
            :loading="savingNotifs"
            @click="handleUnmute"
          />
        </div>

        <UDropdownMenu
          v-else
          :items="[
            muteOptions.map(opt => ({
              label: opt.label,
              onSelect: () => handleMute(opt.value)
            }))
          ]"
        >
          <UButton
            icon="i-lucide-volume-x"
            label="Mute channel"
            variant="soft"
            color="neutral"
            size="sm"
            class="mt-2"
          />
        </UDropdownMenu>
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
    <UModal v-model:open="showLeaveConfirm" title="Leave Channel" description="Confirm leaving this channel">
      <template #content>
        <div class="p-6">
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
    <UModal v-model:open="showArchiveConfirm" :title="channel.archived_at ? 'Unarchive Channel' : 'Archive Channel'" description="Confirm channel archive status change">
      <template #content>
        <div class="p-6">
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
