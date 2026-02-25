<script setup lang="ts">
const { data, status } = await useFetch('/api/agency/team-members')

const members = computed(() => {
  const raw = (data.value as any)?.members || []
  return raw.slice(0, 12).map((m: any) => ({
    ...m,
    capacityStatus: getCapacityStatus(m),
  }))
})

function getCapacityStatus(member: any) {
  const util = member.utilizationPercent || member.utilization || 0
  const tasks = member.taskCount || member.activeTasks || 0
  if (util > 100 || tasks > 10) return 'overbooked'
  if (util > 80 || tasks > 7) return 'busy'
  if (util > 50 || tasks > 4) return 'limited'
  return 'available'
}

const statusRing: Record<string, string> = {
  available: 'ring-emerald-500',
  limited: 'ring-amber-500',
  busy: 'ring-red-500',
  overbooked: 'ring-neutral-400',
}

const statusCounts = computed(() => {
  const counts = { available: 0, limited: 0, busy: 0, overbooked: 0 }
  for (const m of members.value) {
    const s = m.capacityStatus as keyof typeof counts
    if (s in counts) counts[s]++
  }
  return counts
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-users-round" class="w-4 h-4 text-[var(--ui-text-muted)]" />
          <h3 class="font-semibold text-[var(--ui-text-highlighted)]">Team Capacity</h3>
        </div>
        <UButton to="/agency/capacity" variant="link" color="neutral" size="xs" trailing-icon="i-lucide-arrow-right">
          Details
        </UButton>
      </div>
    </template>

    <div v-if="status === 'pending'" class="space-y-3">
      <div class="flex gap-3 flex-wrap">
        <USkeleton v-for="i in 8" :key="i" class="w-10 h-10 rounded-full" />
      </div>
    </div>
    <div v-else-if="!members.length" class="text-center py-6 text-[var(--ui-text-muted)]">
      <UIcon name="i-lucide-users" class="w-8 h-8 mx-auto mb-2 opacity-40" />
      <p class="text-sm">No team data available</p>
    </div>
    <div v-else>
      <!-- Avatar grid -->
      <div class="flex gap-2 flex-wrap mb-4">
        <UTooltip v-for="member in members" :key="member.id" :text="`${member.name} — ${member.capacityStatus}`">
          <UAvatar
            :alt="member.name"
            :src="member.avatar || member.avatarUrl"
            size="sm"
            class="ring-2"
            :class="statusRing[member.capacityStatus]"
          />
        </UTooltip>
      </div>

      <!-- Summary bar -->
      <div class="flex items-center gap-4 text-xs text-[var(--ui-text-muted)] pt-3 border-t border-[var(--ui-border)]">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-500" />
          {{ statusCounts.available }} available
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-red-500" />
          {{ statusCounts.busy }} busy
        </span>
        <span v-if="statusCounts.overbooked" class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-neutral-400" />
          {{ statusCounts.overbooked }} overbooked
        </span>
      </div>
    </div>
  </UCard>
</template>
