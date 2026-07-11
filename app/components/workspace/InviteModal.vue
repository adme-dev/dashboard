<template>
  <UModal v-model:open="isOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="p-6">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-semibold">Invite to this workspace</h2>
          <UButton variant="ghost" color="neutral" icon="i-lucide-x" size="sm" @click="isOpen = false" />
        </div>

        <!-- Search -->
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Search by name, team, or email address"
          class="w-full mb-4"
        />

        <!-- Access Info -->
        <div class="flex items-center gap-2 p-3 bg-gray-50 rounded-lg mb-4">
          <UIcon name="i-lucide-building-2" class="w-4 h-4 text-gray-500" />
          <span class="text-sm text-gray-600">
            Anyone at <strong>{{ companyName }}</strong> can access this workspace
          </span>
        </div>

        <!-- Members List -->
        <div>
          <h3 class="text-sm font-semibold mb-3">People in this workspace</h3>
          <div class="space-y-2">
            <div
              v-for="member in workspaceMembers"
              :key="member.id"
              class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
            >
              <div class="flex items-center gap-3">
                <UAvatar :src="member.avatarUrl || undefined" :alt="member.name" size="sm" />
                <div>
                  <div class="font-medium text-sm">{{ member.name }}</div>
                  <div class="text-xs text-gray-500">{{ member.title || member.email }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UIcon v-if="member.isAdmin" name="i-lucide-crown" class="w-4 h-4 text-amber-500" title="Admin" />
                <UButton 
                  v-if="!member.isAdmin && isCurrentUserAdmin"
                  variant="ghost" 
                  color="neutral" 
                  icon="i-lucide-x" 
                  size="xs"
                  @click="removeMember(member)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Add People Section -->
        <div v-if="isCurrentUserAdmin" class="mt-6 pt-4 border-t">
          <h3 class="text-sm font-semibold mb-3">Add people</h3>
          <div class="space-y-2 max-h-60 overflow-auto">
            <div
              v-for="user in availableUsers"
              :key="user.id"
              class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
            >
              <div class="flex items-center gap-3">
                <UAvatar :src="user.avatarUrl || undefined" :alt="user.name" size="sm" />
                <div>
                  <div class="font-medium text-sm">{{ user.name }}</div>
                  <div class="text-xs text-gray-500">{{ user.email }}</div>
                </div>
              </div>
              <UButton 
                variant="ghost" 
                size="xs"
                @click="addMember(user)"
              >
                Add
              </UButton>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-3 mt-6 pt-4 border-t">
          <UButton variant="ghost" color="neutral" @click="isOpen = false">
            Done
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  workspaceId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const searchQuery = ref('')
const companyName = ref('ADME Advertising Pty Ltd')
const isCurrentUserAdmin = ref(true) // TODO: Check actual permissions

// Mock data - replace with API calls
const workspaceMembers = ref([
  {
    id: '1',
    name: 'Paul Giurin',
    email: 'paul@adme.net.au',
    title: 'Creative Director',
    avatarUrl: null,
    isAdmin: true
  },
  {
    id: '2',
    name: 'Robert Giurin',
    email: 'robert@adme.net.au',
    title: 'Creative Director',
    avatarUrl: null,
    isAdmin: false
  },
  {
    id: '3',
    name: 'Clara Padalini',
    email: 'clara@adme.net.au',
    title: 'Director',
    avatarUrl: null,
    isAdmin: false
  }
])

const availableUsers = ref([
  {
    id: '4',
    name: 'Matthew Crawford',
    email: 'matthew@adme.net.au',
    avatarUrl: null
  },
  {
    id: '5',
    name: 'Kellie White',
    email: 'accounts@adme.net.au',
    avatarUrl: null
  },
  {
    id: '6',
    name: 'Alicia Karitsas',
    email: 'alicia@adme.net.au',
    avatarUrl: null
  }
])

const addMember = async (user: any) => {
  // TODO: API call to add member
  workspaceMembers.value.push({
    ...user,
    isAdmin: false
  })
  availableUsers.value = availableUsers.value.filter(u => u.id !== user.id)
}

const removeMember = async (member: any) => {
  // TODO: API call to remove member
  workspaceMembers.value = workspaceMembers.value.filter(m => m.id !== member.id)
  availableUsers.value.push(member)
}
</script>
