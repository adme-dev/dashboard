<script setup lang="ts">
import type { ChatChannel } from '~/types'

const emit = defineEmits<{
  'close': []
  'created': [channel: ChatChannel]
}>()

const toast = useToast()
const { user } = useAuth()

const search = ref('')
const selectedIds = ref<string[]>([])
const creating = ref(false)
const groupName = ref('')

const { data: teamMembersData } = useFetch('/api/agency/team-members')
const teamMembers = computed(() =>
  (((teamMembersData.value as any)?.members as any[]) || []).filter((m: any) => m.id !== user.value?.id)
)

const filteredMembers = computed(() => {
  if (!search.value) return teamMembers.value
  const q = search.value.toLowerCase()
  return teamMembers.value.filter((m: any) =>
    m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  )
})

const selectedMembers = computed(() =>
  teamMembers.value.filter((m: any) => selectedIds.value.includes(m.id))
)

const isGroupDM = computed(() => selectedIds.value.length > 1)

const autoGroupName = computed(() => {
  if (selectedMembers.value.length === 0) return ''
  return selectedMembers.value.map((m: any) => m.name?.split(' ')[0] || m.name).join(', ')
})

function toggleMember(memberId: string) {
  const idx = selectedIds.value.indexOf(memberId)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(memberId)
  }
}

function removeMember(memberId: string) {
  selectedIds.value = selectedIds.value.filter(id => id !== memberId)
}

async function handleCreate() {
  if (selectedIds.value.length === 0) return
  creating.value = true
  try {
    let channel: ChatChannel

    if (selectedIds.value.length === 1) {
      // Standard DM
      channel = await $fetch<ChatChannel>('/api/chat/dm', {
        method: 'POST',
        body: { userId: selectedIds.value[0] }
      })
    } else {
      // Group DM
      const name = groupName.value.trim() || autoGroupName.value
      channel = await $fetch<ChatChannel>('/api/chat/channels', {
        method: 'POST',
        body: {
          name,
          type: 'group_dm',
          isPrivate: true,
          memberIds: selectedIds.value
        }
      })
    }

    emit('created', channel)
    toast.add({
      title: isGroupDM.value ? 'Group conversation created' : 'Conversation started',
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Failed to create conversation', color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <h3 class="text-lg font-semibold mb-1">New Message</h3>
    <p class="text-sm text-muted mb-4">
      Select one person for a DM, or multiple for a group conversation.
    </p>

    <!-- Selected members chips -->
    <div v-if="selectedIds.length > 0" class="flex flex-wrap gap-1.5 mb-3">
      <span
        v-for="member in selectedMembers"
        :key="member.id"
        class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
      >
        <UAvatar :src="member.avatarUrl || member.avatar_url" :alt="member.name" size="3xs" />
        {{ member.name?.split(' ')[0] }}
        <button class="hover:text-primary/70" @click="removeMember(member.id)">
          <UIcon name="i-lucide-x" class="w-3 h-3" />
        </button>
      </span>
    </div>

    <!-- Search -->
    <UInput
      v-model="search"
      placeholder="Search team members..."
      icon="i-lucide-search"
      class="mb-3"
    />

    <!-- Group name (shown for 2+ members) -->
    <div v-if="isGroupDM" class="mb-3">
      <UInput
        v-model="groupName"
        :placeholder="autoGroupName"
        icon="i-lucide-users"
        size="sm"
      >
        <template #leading>
          <span class="text-xs text-muted px-1">Name:</span>
        </template>
      </UInput>
    </div>

    <!-- Member list -->
    <div class="max-h-56 overflow-y-auto space-y-0.5">
      <button
        v-for="member in filteredMembers"
        :key="member.id"
        :class="[
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
          selectedIds.includes(member.id)
            ? 'bg-primary/10'
            : 'hover:bg-elevated/80'
        ]"
        @click="toggleMember(member.id)"
      >
        <UAvatar :src="member.avatarUrl || member.avatar_url" :alt="member.name" size="sm" />
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">{{ member.name }}</div>
          <div class="text-xs text-muted truncate">{{ member.email }}</div>
        </div>
        <UIcon
          v-if="selectedIds.includes(member.id)"
          name="i-lucide-check-circle"
          class="w-4.5 h-4.5 text-primary shrink-0"
        />
      </button>

      <div v-if="filteredMembers.length === 0" class="text-center text-sm text-muted py-4">
        No matching team members
      </div>
    </div>

    <!-- Footer -->
    <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-default">
      <UButton variant="ghost" color="neutral" @click="emit('close')">
        Cancel
      </UButton>
      <UButton
        :label="isGroupDM ? 'Create Group' : 'Start Conversation'"
        color="primary"
        :loading="creating"
        :disabled="selectedIds.length === 0"
        @click="handleCreate"
      />
    </div>
  </div>
</template>
