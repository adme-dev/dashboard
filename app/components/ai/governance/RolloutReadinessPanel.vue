<script setup lang="ts">
import type { AiCompanyRolloutReadiness } from '~/types/aiGovernance'

defineProps<{ data: AiCompanyRolloutReadiness | null, pending: boolean, error: string | null }>()
const emit = defineEmits<{ refresh: [] }>()

function reasonLabel(reason: string) {
  return reason.replace(/^no_/, 'No ').replace(/_/g, ' ')
}

function activeOwnerLabel(count: number) {
  return `${count} active owner${count === 1 ? '' : 's'}`
}
</script>

<template>
  <section aria-labelledby="rollout-readiness-title" class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="rollout-readiness-title" class="text-base font-semibold text-highlighted">
          AI access coverage
        </h2><p class="mt-1 text-sm text-muted">
          Owner God mode is reported separately from governed employee rollout readiness.
        </p>
      </div><UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="soft"
        :loading="pending"
        @click="emit('refresh')"
      >
        Refresh readiness
      </UButton>
    </div>
    <div
      v-if="pending && !data"
      class="space-y-3"
      aria-busy="true"
      aria-label="Loading company rollout readiness"
    >
      <USkeleton class="h-24 w-full" /><USkeleton class="h-36 w-full" />
    </div>
    <UAlert
      v-else-if="error && !data"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Rollout readiness unavailable"
      :description="error"
    >
      <template #actions>
        <UButton color="error" variant="soft" @click="emit('refresh')">
          Try again
        </UButton>
      </template>
    </UAlert>
    <template v-else-if="data">
      <UAlert
        v-if="error"
        color="warning"
        variant="soft"
        icon="i-lucide-clock-alert"
        title="Rollout readiness may be stale"
        :description="error"
      >
        <template #actions>
          <UButton color="warning" variant="soft" @click="emit('refresh')">
            Retry readiness
          </UButton>
        </template>
      </UAlert>
      <UCard :ui="{ body: 'p-4' }">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              Owner God mode coverage
            </h3>
            <p class="mt-1 text-xs text-muted">
              <template v-if="data.godMode.emergencyDisabled">
                {{ activeOwnerLabel(data.godMode.activeOwnerCount) }} are eligible for God mode but follow governed access while the emergency disable is active.
              </template>
              <template v-else>
                {{ activeOwnerLabel(data.godMode.activeOwnerCount) }} receive all registered capabilities.
              </template>
              Identity, isolation, audit and infrastructure boundaries remain enforced.
            </p>
          </div>
          <UBadge :color="data.godMode.emergencyDisabled ? 'error' : 'success'" variant="soft">
            {{ data.godMode.emergencyDisabled ? 'Emergency disabled' : 'God mode active' }}
          </UBadge>
        </div>
      </UCard>
      <div>
        <h3 class="text-sm font-semibold text-highlighted">
          Employee rollout readiness
        </h3>
        <p class="mt-1 text-xs text-muted">
          Ordinary employees remain governed by department packs, evaluations, pilot membership and release state.
        </p>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4" role="status" aria-live="polite">
        <UCard :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">
            Active employees
          </p><p class="mt-1 text-xl font-semibold text-highlighted">
            {{ data.activeEmployeeCount }}
          </p>
        </UCard><UCard :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">
            Covered employees
          </p><p class="mt-1 text-xl font-semibold text-highlighted">
            {{ data.coveredEmployeeCount }}
          </p>
        </UCard><UCard :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">
            Pilot ready
          </p><p class="mt-1 text-sm font-semibold text-highlighted">
            {{ data.readyForPilot ? 'Ready' : 'Blocked' }}
          </p>
        </UCard><UCard :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">
            Enforcement ready
          </p><p class="mt-1 text-sm font-semibold text-highlighted">
            {{ data.readyForEnforcement ? 'Ready' : 'Blocked' }}
          </p>
        </UCard>
      </div>
      <UAlert
        v-if="data.blockers.length"
        color="warning"
        variant="soft"
        icon="i-lucide-shield-alert"
        title="Rollout blockers"
        :description="data.blockers.join(' · ')"
      />
      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <UCard :ui="{ body: 'p-4' }">
          <h3 class="text-sm font-semibold text-highlighted">
            Uncovered employees
          </h3><p class="mt-1 text-xs text-muted">
            Names are shown for authorized administrators only; no contact, activity, or performance data is included.
          </p><ul v-if="data.uncoveredEmployees.length" class="mt-3 divide-y divide-default">
            <li v-for="employee in data.uncoveredEmployees" :key="employee.userId" class="py-2">
              <p class="text-sm font-medium text-default">
                {{ employee.name }}
              </p><p class="text-xs text-muted">
                {{ employee.reasons.map(reasonLabel).join(' · ') }}
              </p>
            </li>
          </ul><p v-else class="mt-3 text-sm text-muted">
            Every active employee has eligible coverage.
          </p>
        </UCard>
        <UCard :ui="{ body: 'p-4' }">
          <h3 class="text-sm font-semibold text-highlighted">
            Department coverage
          </h3><ul class="mt-3 divide-y divide-default">
            <li v-for="department in data.departmentCoverage" :key="department.departmentId" class="flex items-center justify-between gap-3 py-2">
              <div>
                <p class="text-sm font-medium text-default">
                  {{ department.name }}
                </p><p class="text-xs text-muted">
                  {{ department.activeEmployeeCount }} employees · {{ department.ownerReady ? 'Owner ready' : 'Owner blocked' }}
                </p>
              </div><UBadge :color="department.latestGatePassed && department.releaseState === 'active' ? 'success' : 'warning'" variant="soft">
                {{ department.releaseState }} · {{ department.latestGatePassed ? 'Gate passed' : 'Gate blocked' }}
              </UBadge>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </section>
</template>
