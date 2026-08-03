<script setup lang="ts">
import type { AiCompanyRolloutReadiness } from '~/types/aiGovernance'

defineProps<{ data: AiCompanyRolloutReadiness | null, pending: boolean, error: string | null }>()
const emit = defineEmits<{ refresh: [] }>()

function reasonLabel(reason: string) {
  return reason.replace(/^no_/, 'No ').replace(/_/g, ' ')
}
</script>

<template>
  <section aria-labelledby="rollout-readiness-title" class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="rollout-readiness-title" class="text-base font-semibold text-highlighted">Company rollout readiness</h2><p class="mt-1 text-sm text-muted">Coverage is grouped by employee, department owner, evaluation gate, and release state.</p></div><UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" :loading="pending" @click="emit('refresh')">Refresh readiness</UButton></div>
    <div v-if="pending && !data" class="space-y-3" aria-busy="true" aria-label="Loading company rollout readiness"><USkeleton class="h-24 w-full" /><USkeleton class="h-36 w-full" /></div>
    <UAlert v-else-if="error && !data" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Rollout readiness unavailable" :description="error"><template #actions><UButton color="error" variant="soft" @click="emit('refresh')">Try again</UButton></template></UAlert>
    <template v-else-if="data">
      <UAlert v-if="error" color="warning" variant="soft" icon="i-lucide-clock-alert" title="Rollout readiness may be stale" :description="error"><template #actions><UButton color="warning" variant="soft" @click="emit('refresh')">Retry readiness</UButton></template></UAlert>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4" role="status" aria-live="polite"><UCard :ui="{ body: 'p-3' }"><p class="text-xs text-muted">Active employees</p><p class="mt-1 text-xl font-semibold text-highlighted">{{ data.activeEmployeeCount }}</p></UCard><UCard :ui="{ body: 'p-3' }"><p class="text-xs text-muted">Covered employees</p><p class="mt-1 text-xl font-semibold text-highlighted">{{ data.coveredEmployeeCount }}</p></UCard><UCard :ui="{ body: 'p-3' }"><p class="text-xs text-muted">Pilot ready</p><p class="mt-1 text-sm font-semibold text-highlighted">{{ data.readyForPilot ? 'Ready' : 'Blocked' }}</p></UCard><UCard :ui="{ body: 'p-3' }"><p class="text-xs text-muted">Enforcement ready</p><p class="mt-1 text-sm font-semibold text-highlighted">{{ data.readyForEnforcement ? 'Ready' : 'Blocked' }}</p></UCard></div>
      <UAlert v-if="data.blockers.length" color="warning" variant="soft" icon="i-lucide-shield-alert" title="Rollout blockers" :description="data.blockers.join(' · ')" />
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <UCard :ui="{ body: 'p-4' }"><h3 class="text-sm font-semibold text-highlighted">Uncovered employees</h3><p class="mt-1 text-xs text-muted">Names are shown for authorized administrators only; no contact, activity, or performance data is included.</p><ul v-if="data.uncoveredEmployees.length" class="mt-3 divide-y divide-default"><li v-for="employee in data.uncoveredEmployees" :key="employee.userId" class="py-2"><p class="text-sm font-medium text-default">{{ employee.name }}</p><p class="text-xs text-muted">{{ employee.reasons.map(reasonLabel).join(' · ') }}</p></li></ul><p v-else class="mt-3 text-sm text-muted">Every active employee has eligible coverage.</p></UCard>
        <UCard :ui="{ body: 'p-4' }"><h3 class="text-sm font-semibold text-highlighted">Department coverage</h3><ul class="mt-3 divide-y divide-default"><li v-for="department in data.departmentCoverage" :key="department.departmentId" class="flex items-center justify-between gap-3 py-2"><div><p class="text-sm font-medium text-default">{{ department.name }}</p><p class="text-xs text-muted">{{ department.activeEmployeeCount }} employees · {{ department.ownerReady ? 'Owner ready' : 'Owner blocked' }}</p></div><UBadge :color="department.latestGatePassed && department.releaseState === 'active' ? 'success' : 'warning'" variant="soft">{{ department.releaseState }} · {{ department.latestGatePassed ? 'Gate passed' : 'Gate blocked' }}</UBadge></li></ul></UCard>
      </div>
    </template>
  </section>
</template>
