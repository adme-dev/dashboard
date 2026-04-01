<script setup lang="ts">
const props = defineProps<{
  memberId: string
  memberName: string
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { isManager } = useAuth()

// Fetch assigned clients
const { data: clientsData, refresh: refreshClients } = await useFetch(
  () => `/api/agency/team-members/${props.memberId}/clients`,
  { watch: [() => props.memberId] }
)
const clients = computed(() => ((clientsData.value as any) || []) as any[])

const getRoleLabel = (role: string): string => {
  switch (role) {
    case 'primary_am': return 'Primary AM'
    case 'secondary_am': return 'Secondary AM'
    case 'support': return 'Support'
    default: return role
  }
}

const getRoleBadgeColor = (role: string): 'success' | 'info' | 'neutral' => {
  switch (role) {
    case 'primary_am': return 'success'
    case 'secondary_am': return 'info'
    default: return 'neutral'
  }
}

const removeClient = async (clientId: string, clientName: string) => {
  try {
    await $fetch(`/api/agency/clients/${clientId}/team/${props.memberId}`, {
      method: 'DELETE'
    })
    toast.add({ title: `Removed from ${clientName}`, color: 'success' })
    refreshClients()
  } catch (err: any) {
    toast.add({ title: 'Failed to remove assignment', description: err.data?.message || err.message, color: 'error' })
  }
}
</script>

<template>
  <USlideover v-model:open="open">
    <template #header>
      <div>
        <h3 class="text-[16px] font-[500]">{{ memberName }}'s Clients</h3>
        <p class="text-sm text-gray-500 mt-0.5">
          {{ clients.length }} client{{ clients.length === 1 ? '' : 's' }} assigned
        </p>
      </div>
    </template>
    <template #body>
      <div class="space-y-2">
        <div
          v-for="client in clients"
          :key="client.id"
          class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="min-w-0 flex-1">
            <NuxtLink
              :to="`/agency/clients/${client.client_id}`"
              class="font-medium text-sm hover:text-primary-500 transition-colors"
              @click="open = false"
            >
              {{ client.client_name }}
            </NuxtLink>
            <div class="flex items-center gap-2 mt-1">
              <UBadge :color="getRoleBadgeColor(client.role)" variant="subtle" size="xs">
                {{ getRoleLabel(client.role) }}
              </UBadge>
              <span v-if="client.assigned_at" class="text-xs text-gray-400">
                since {{ new Date(client.assigned_at).toLocaleDateString() }}
              </span>
            </div>
          </div>
          <UButton
            v-if="isManager"
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            color="error"
            @click="removeClient(client.client_id, client.client_name)"
          />
        </div>

        <div v-if="clients.length === 0" class="text-center text-sm text-gray-500 py-8">
          No clients assigned to this member
        </div>
      </div>
    </template>
  </USlideover>
</template>
