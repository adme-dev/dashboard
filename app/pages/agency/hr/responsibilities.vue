<script setup lang="ts">
definePageMeta({ title: 'Responsibility Map', middleware: ['auth'] })

type Owner = { memberId: string; memberName: string; roleVersionId: string; roleTitle: string }
type Entry = {
  responsibility: string
  classification: 'single_owner' | 'shared' | 'unowned'
  owners: Owner[]
  sourceRoles: Array<{ roleVersionId: string; roleTitle: string }>
  requiresHumanConfirmation: boolean
}
type ResponsibilityMap = {
  summary: { total: number; singleOwner: number; shared: number; unowned: number }
  groups: { singleOwner: Entry[]; shared: Entry[]; unowned: Entry[] }
  limitations: string[]
}

const data = ref<ResponsibilityMap | null>(null)
const pending = ref(true)
const loadError = ref('')
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>

onMounted(async () => {
  try {
    data.value = await apiFetch<ResponsibilityMap>('/api/agency/hr/responsibilities')
  } catch (error: any) {
    loadError.value = error?.data?.statusMessage || 'The responsibility map could not be loaded.'
  } finally {
    pending.value = false
  }
})

const lanes = computed(() => data.value ? [
  { key: 'singleOwner' as const, title: 'Single owner', detail: 'One active team member currently carries this responsibility.', icon: 'i-lucide-user-check', color: 'success' as const },
  { key: 'shared' as const, title: 'Shared or duplicated', detail: 'Matching wording appears across multiple active owners. Confirm whether this is intentional.', icon: 'i-lucide-users-round', color: 'warning' as const },
  { key: 'unowned' as const, title: 'No active owner', detail: 'The responsibility exists in a published role but has no active assignment.', icon: 'i-lucide-circle-dashed', color: 'error' as const },
] : [])
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl border-l-4 border-primary pl-5">
            <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Role architecture ledger</p>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Responsibility map</h1>
            <p class="mt-3 text-sm leading-6 text-muted">See where published responsibilities have one owner, overlap across people, or lack an active owner. Overlaps are suggestions for human review—not performance findings.</p>
          </div>
          <div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-badge-check" label="Role library" to="/agency/hr/roles" /><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" /></div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">
      <div v-if="pending" class="flex min-h-72 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
      <UAlert v-else-if="loadError" color="error" variant="soft" icon="i-lucide-shield-alert" title="Responsibility map unavailable" :description="loadError" />
      <template v-else-if="data">
        <section class="grid overflow-hidden rounded-xl border border-default bg-default sm:grid-cols-4">
          <div v-for="item in [{ label: 'Published responsibilities', value: data.summary.total }, { label: 'Single owner', value: data.summary.singleOwner }, { label: 'Shared', value: data.summary.shared }, { label: 'Unowned', value: data.summary.unowned }]" :key="item.label" class="border-b border-default p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ item.label }}</p><p class="mt-2 font-mono text-3xl font-semibold tabular-nums text-highlighted">{{ item.value }}</p>
          </div>
        </section>

        <UAlert color="info" variant="soft" icon="i-lucide-scale" title="Accountability architecture only" :description="data.limitations.join(' ')" />

        <section class="grid min-h-0 gap-5 xl:grid-cols-3">
          <article v-for="lane in lanes" :key="lane.key" class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-default bg-default">
            <header class="border-b border-default bg-elevated/30 p-5"><div class="flex items-start gap-3"><div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated"><UIcon :name="lane.icon" class="size-4" /></div><div><div class="flex flex-wrap items-center gap-2"><h2 class="font-semibold text-highlighted">{{ lane.title }}</h2><UBadge :color="lane.color" variant="subtle" :label="String(data.groups[lane.key].length)" /></div><p class="mt-1 text-sm leading-5 text-muted">{{ lane.detail }}</p></div></div></header>
            <div class="max-h-[34rem] flex-1 overflow-y-auto overscroll-contain">
              <div v-if="data.groups[lane.key].length" class="divide-y divide-default">
                <div v-for="entry in data.groups[lane.key]" :key="entry.responsibility" class="p-5">
                  <p class="text-sm font-medium leading-6 text-highlighted">{{ entry.responsibility }}</p>
                  <div v-if="entry.owners.length" class="mt-3 space-y-2"><div v-for="owner in entry.owners" :key="owner.memberId" class="flex items-center justify-between gap-3 text-sm"><span class="truncate text-highlighted">{{ owner.memberName }}</span><span class="truncate text-xs text-muted">{{ owner.roleTitle }}</span></div></div>
                  <p v-else class="mt-3 text-xs text-error">No current team member is assigned to this published role version.</p>
                  <div class="mt-3 flex flex-wrap gap-1.5"><UBadge v-for="role in entry.sourceRoles" :key="role.roleVersionId" color="neutral" variant="outline" :label="role.roleTitle" /></div>
                  <p v-if="entry.requiresHumanConfirmation" class="mt-3 flex gap-2 text-xs leading-5 text-warning"><UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />Confirm whether ownership is intentionally shared before changing any role.</p>
                </div>
              </div>
              <div v-else class="px-5 py-10 text-center text-sm text-muted">No responsibilities in this lane.</div>
            </div>
          </article>
        </section>
      </template>
    </main>
  </div>
</template>
