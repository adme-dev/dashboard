<script setup lang="ts">
const config = defineModel<Record<string, any>>('config', { default: () => ({}) })

// /api/agency/team-members returns { members: [...] }
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const teamData = ref<{ members: { id: string; name: string }[] }>({ members: [] })

async function refreshTeamMembers() {
  teamData.value = await apiFetch<{ members: { id: string; name: string }[] }>('/api/agency/team-members')
}

await refreshTeamMembers()

const userOptions = computed(() =>
  ((teamData.value?.members ?? []) as { id: string; name: string }[]).map(u => ({
    value: u.id,
    label: u.name,
  })),
)
</script>

<template>
  <div class="space-y-1">
    <label class="text-xs text-muted">Assign lead to</label>
    <USelectMenu v-model="config.user_id" :items="userOptions" value-key="value" placeholder="Pick a user" />
  </div>
</template>
