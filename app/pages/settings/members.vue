<script setup lang="ts">
const toast = useToast()
const { isAdmin } = useAuth()

// Fetch team members
const { data: members, pending: loading, refresh } = await useFetch('/api/auth/users', {
  default: () => []
})

// Fetch pending invitations
const { data: invitations, refresh: refreshInvitations } = await useFetch('/api/auth/invitations', {
  default: () => []
})

const pendingInvitations = computed(() => (invitations.value as any[])?.filter((i: any) => i.status === 'pending') || [])

const q = ref('')

const filteredMembers = computed(() => {
  if (!members.value) return []
  return members.value.filter((member: any) => {
    const searchTerm = q.value.toLowerCase()
    return member.name?.toLowerCase().includes(searchTerm) ||
           member.email?.toLowerCase().includes(searchTerm) ||
           member.jobRole?.toLowerCase().includes(searchTerm)
  })
})

// Invite modal
const isInviteModalOpen = ref(false)
const inviteForm = ref({
  email: '',
  role: 'member',
  departmentId: '',
  message: ''
})
const inviteLoading = ref(false)

async function sendInvite() {
  if (!inviteForm.value.email) {
    toast.add({ title: 'Please enter an email address', color: 'error' })
    return
  }

  inviteLoading.value = true
  try {
    await $fetch('/api/auth/invitations', {
      method: 'POST',
      body: {
        email: inviteForm.value.email,
        role: inviteForm.value.role,
        departmentId: inviteForm.value.departmentId || undefined,
        message: inviteForm.value.message || undefined
      }
    })

    toast.add({ title: 'Invitation sent!', color: 'success' })
    isInviteModalOpen.value = false
    inviteForm.value = { email: '', role: 'member', departmentId: '', message: '' }
    await refreshInvitations()
  } catch (error: any) {
    toast.add({
      title: 'Failed to send invitation',
      description: error.data?.statusMessage || 'Please try again',
      color: 'error'
    })
  } finally {
    inviteLoading.value = false
  }
}

// Role options
const roleOptions = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'guest', label: 'Guest' }
]

// Resend invitation
async function resendInvitation(inviteId: string) {
  try {
    await $fetch('/api/auth/invitations/resend', { method: 'POST', body: { invitationId: inviteId } })
    toast.add({ title: 'Invitation resent!', color: 'success' })
  } catch (e) {
    toast.add({ title: 'Failed to resend', color: 'error' })
  }
}

// Revoke invitation
async function revokeInvitation(inviteId: string) {
  try {
    await $fetch(`/api/auth/invitations/${inviteId}`, { method: 'DELETE' })
    toast.add({ title: 'Invitation revoked', color: 'success' })
    await refreshInvitations()
  } catch (e) {
    toast.add({ title: 'Failed to revoke', color: 'error' })
  }
}
</script>

<template>
  <div>
    <UPageCard
      title="Team Members"
      description="Manage your team members and their roles."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        v-if="isAdmin"
        label="Invite people"
        icon="i-lucide-user-plus"
        color="neutral"
        class="w-fit lg:ms-auto"
        @click="isInviteModalOpen = true"
      />
    </UPageCard>

    <!-- Pending Invitations -->
    <UCard v-if="pendingInvitations.length > 0" class="mb-4">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-mail" class="h-5 w-5 text-amber-500" />
          <h3 class="font-semibold">Pending Invitations ({{ pendingInvitations.length }})</h3>
        </div>
      </template>
      <ul class="divide-y divide-default">
        <li
          v-for="invite in pendingInvitations"
          :key="invite.id"
          class="flex items-center justify-between gap-3 py-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <UIcon name="i-lucide-mail" class="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div class="text-sm min-w-0">
              <p class="text-highlighted font-medium truncate">{{ invite.email }}</p>
              <p class="text-muted text-xs">
                Invited as {{ invite.role }} - Expires {{ new Date(invite.expiresAt).toLocaleDateString() }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              color="neutral"
              variant="soft"
              label="Resend"
              @click="resendInvitation(invite.id)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-x"
              @click="revokeInvitation(invite.id)"
            />
          </div>
        </li>
      </ul>
    </UCard>

    <!-- Members List -->
    <UPageCard variant="subtle" :ui="{ container: 'p-0 sm:p-0 gap-y-0', wrapper: 'items-stretch', header: 'p-4 mb-0 border-b border-default' }">
      <template #header>
        <UInput
          v-model="q"
          icon="i-lucide-search"
          placeholder="Search members..."
          autofocus
          class="w-full"
        />
      </template>

      <template v-if="loading">
        <div class="p-4 space-y-3">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3">
            <USkeleton class="h-10 w-10 rounded-full" />
            <div class="flex-1 space-y-2">
              <USkeleton class="h-4 w-32" />
              <USkeleton class="h-3 w-24" />
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <SettingsMembersList :members="filteredMembers as any[]" @refresh="refresh" />
      </template>
    </UPageCard>

    <!-- Invite Modal -->
    <UModal v-model:open="isInviteModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-lg">Invite Team Member</h3>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                @click="isInviteModalOpen = false"
              />
            </div>
          </template>

          <form @submit.prevent="sendInvite" class="space-y-4">
            <UFormField label="Email Address" required>
              <UInput
                v-model="inviteForm.email"
                type="email"
                placeholder="colleague@example.com"
                icon="i-lucide-mail"
              />
            </UFormField>

            <UFormField label="Role">
              <USelect
                v-model="inviteForm.role"
                :items="roleOptions"
                value-key="value"
                option-key="value"
              />
            </UFormField>

            <UFormField label="Personal Message (Optional)">
              <UTextarea
                v-model="inviteForm.message"
                placeholder="Add a personal note to the invitation..."
                :rows="3"
              />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
              <UButton
                color="neutral"
                variant="ghost"
                label="Cancel"
                @click="isInviteModalOpen = false"
              />
              <UButton
                type="submit"
                color="primary"
                label="Send Invitation"
                :loading="inviteLoading"
              />
            </div>
          </form>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
