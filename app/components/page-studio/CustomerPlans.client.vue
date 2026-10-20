<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { CustomerPlanTarget, CustomerPlanTargets } from '~~/shared/pageStudio/customerPlans'

const { user } = useAuth()
// The endpoint decides whether this candidate holds a built-in system role.
const canManage = computed(() => Boolean(user.value && ['owner', 'admin'].includes(user.value.role)))
const actorKey = computed(() => JSON.stringify(user.value))
const selected = ref<CustomerPlanTarget | null>(null)
const cursor = ref<string | undefined>()
const history = ref<Array<string | undefined>>([])
const data = ref<CustomerPlanTargets | null>(null), pending = ref(false), error = ref(false)
let generation = 0
async function reload() {
  if (!canManage.value || pending.value) return
  const current = generation
  selected.value = null
  data.value = null
  pending.value = true
  error.value = false
  try {
    const result = await $fetch<CustomerPlanTargets>('/api/agency/page-studio/customer-plans', { query: cursor.value ? { after: cursor.value } : {} })
    if (current === generation) data.value = result
  } catch {
    if (current === generation) {
      data.value = null
      selected.value = null
      error.value = true
    }
  } finally { if (current === generation) pending.value = false }
}
watch(actorKey, () => {
  generation++
  selected.value = null
  cursor.value = undefined
  history.value = []
  data.value = null
  error.value = false
  pending.value = false
  if (canManage.value) void reload()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  generation++
})
async function next() {
  if (!data.value?.nextCursor || pending.value) return
  history.value.push(cursor.value)
  cursor.value = data.value.nextCursor
  await reload()
}
async function previous() {
  if (!history.value.length || pending.value) return
  cursor.value = history.value.pop()
  await reload()
}
function choose(target: CustomerPlanTarget) {
  if (canManage.value && target.eligible && !pending.value && !error.value)
    selected.value = { ...target, limits: { ...target.limits } }
}
function expiry(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(value)) : 'No scheduled end'
}
</script>

<template>
  <UDashboardPanel id="page-studio-customer-plans">
    <template #header>
      <UDashboardNavbar title="Customer publishing plans">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Subscriptions"
            to="/agency/page-studio/subscriptions"
            color="neutral"
            variant="ghost"
          />
          <UButton
            v-if="canManage"
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="reload"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-6">
        <header class="max-w-2xl space-y-2">
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
            From preview to publishing
          </h1>
          <p class="text-muted">
            Review the agreed access for customers who signed up directly to Studio. These accounts are managed across the platform, separately from agency client subscriptions.
          </p>
        </header>
        <UAlert
          v-if="!canManage"
          color="warning"
          title="Platform administrator access required"
          description="Sign in with a built-in owner or administrator account to manage customer publishing plans."
        />
        <div v-else-if="pending" class="space-y-3" aria-busy="true">
          <USkeleton class="h-24" /><USkeleton class="h-24" />
        </div>
        <UAlert
          v-else-if="error"
          color="error"
          title="Customer plans could not be loaded"
          description="Check your access and refresh to try again."
        />
        <template v-else>
          <div v-if="!data?.targets.length" class="rounded-lg border border-default p-8">
            <h2 class="font-semibold text-highlighted">
              No customer plans on this page
            </h2>
            <p class="mt-2 text-sm text-muted">
              A customer's preview appears here after their Studio workspace and website have been created.
            </p>
          </div>
          <div v-else class="divide-y divide-default rounded-lg border border-default">
            <article v-for="target in data.targets" :key="target.workspaceId" class="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0 space-y-2">
                <h2 class="break-words text-lg font-semibold text-highlighted">
                  {{ target.workspaceName }}
                </h2>
                <p class="break-words text-sm">
                  {{ target.siteName }}
                </p>
                <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <UBadge :color="target.eligible ? 'warning' : 'neutral'" variant="subtle">
                    {{ target.eligible ? 'Preview plan' : target.status }}
                  </UBadge>
                  <span class="break-all">{{ target.planKey }}</span><span>· {{ expiry(target.effectiveUntil) }}</span>
                </div>
                <p class="text-sm text-muted">
                  {{ target.limits.pagesPerSiteLimit }} pages · {{ target.limits.domainLimit }} custom domains · {{ target.limits.buildLimit }} builds/month
                </p>
              </div>
              <UButton
                v-if="target.eligible"
                label="Set publishing plan"
                icon="i-lucide-file-check-2"
                class="shrink-0 self-start sm:self-auto"
                @click="choose(target)"
              />
              <p v-else class="max-w-64 text-sm text-muted">
                This account is outside the initial preview upgrade. Review existing plan changes separately.
              </p>
            </article>
          </div>
          <div class="flex justify-between gap-3">
            <UButton
              label="Previous"
              color="neutral"
              variant="outline"
              :disabled="pending || !history.length"
              @click="previous"
            />
            <UButton
              label="Next"
              color="neutral"
              variant="outline"
              :disabled="pending || !data?.nextCursor"
              @click="next"
            />
          </div>
        </template>
        <PageStudioCustomerPlanGrant
          v-if="selected && canManage"
          :key="`${actorKey}:${selected.workspaceId}:${selected.entitlementId}`"
          :target="selected"
          @close="selected = null"
          @granted="reload"
          @invalidated="reload"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
