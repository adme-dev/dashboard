<script setup lang="ts">
definePageMeta({
  title: 'HR Business Review',
  middleware: ['auth'],
})

type Assignment = {
  id: string
  cycle_name: string
  questionnaire_name: string
  role_title?: string | null
  status: string
  opens_at: string
  due_at: string
}

type HrOverview = {
  access: 'hr_admin' | 'participant'
  onboarding?: { status: string; currentStep: number }
  summary?: {
    activeCycles: number
    peopleInReview: number
    awaitingResponse: number
    overdue: number
    rolesPublished: number
  }
  recentCycles?: Array<{
    id: string
    name: string
    status: string
    closure_note: string | null
    closure_acknowledged_at: string | null
    due_at: string
    participant_count: number | string
  }>
  myAssignments: Assignment[]
  myFollowUps: Array<{
    id: string
    action_type: string
    title: string
    description: string
    due_at: string
    status: string
    owner_name: string
    cycle_name: string
    participant_user_id: string
  }>
}

const data = ref<HrOverview | null>(null)
const { user } = useAuth()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const pending = ref(true)
const loadError = ref('')

async function refresh() {
  pending.value = true
  loadError.value = ''
  try {
    data.value = await apiFetch<HrOverview>('/api/agency/hr')
  } catch (error: any) {
    loadError.value = error?.data?.statusMessage || 'The private review workspace could not be loaded.'
  } finally {
    pending.value = false
  }
}

onMounted(() => void refresh())

const isHrAdmin = computed(() => data.value?.access === 'hr_admin')
const onboardingComplete = computed(() => data.value?.onboarding?.status === 'completed')
const formatDate = (value: string) => new Intl.DateTimeFormat('en-AU', {
  day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date(value))

const statusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  if (['submitted', 'reviewed', 'completed', 'closed'].includes(status)) return 'success'
  if (status === 'overdue') return 'error'
  if (['open', 'in_progress'].includes(status)) return 'info'
  if (status === 'scheduled') return 'warning'
  return 'neutral'
}

async function acknowledgeFollowUp(followUpId: string) {
  await apiFetch(`/api/agency/hr/follow-ups/${followUpId}`, { method: 'PATCH', body: { status: 'acknowledged' } })
  await refresh()
}

async function acknowledgeClosure(followUpId: string) {
  await apiFetch(`/api/agency/hr/follow-ups/${followUpId}`, { method: 'PATCH', body: { status: 'closure_acknowledged' } })
  await refresh()
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl border-l-4 border-primary pl-5">
            <p class="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Confidential people operations
            </p>
            <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
              {{ isHrAdmin ? 'Business review control room' : 'My review workspace' }}
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-muted">
              {{ isHrAdmin
                ? 'Build role clarity first, then run neutral questionnaires with evidence-aware scoring and human review.'
                : 'Only review activities assigned to you appear here. Your responses remain inside the restricted HR workspace.' }}
            </p>
          </div>
          <div v-if="isHrAdmin" class="flex flex-wrap gap-2">
            <UButton color="neutral" variant="outline" label="Launch governance" icon="i-lucide-shield-check" to="/agency/hr/governance" />
            <UButton color="neutral" variant="outline" label="Knowledge base" icon="i-lucide-book-lock" to="/agency/hr/knowledge" />
            <UButton color="neutral" variant="outline" label="Responsibility map" icon="i-lucide-waypoints" to="/agency/hr/responsibilities" />
            <UButton color="neutral" variant="outline" label="Department goals" icon="i-lucide-goal" to="/agency/hr/goals" />
            <UButton color="neutral" variant="outline" label="Contract vault" icon="i-lucide-file-lock-2" to="/agency/hr/contracts" />
            <UButton color="neutral" variant="outline" label="Review cycles" icon="i-lucide-calendar-range" to="/agency/hr/reviews" />
            <UButton color="neutral" variant="outline" label="Role library" icon="i-lucide-badge-check" to="/agency/hr/roles" />
            <UButton
              :label="onboardingComplete ? 'Review owner profile' : 'Start private onboarding'"
              :icon="onboardingComplete ? 'i-lucide-file-lock-2' : 'i-lucide-arrow-right'"
              to="/agency/hr/onboarding"
            />
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl space-y-8 px-5 py-8 sm:px-8">
      <div v-if="pending" class="flex min-h-64 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
      </div>

      <UAlert
        v-else-if="loadError"
        color="error"
        variant="soft"
        icon="i-lucide-shield-alert"
        title="Private workspace unavailable"
        :description="loadError"
      />

      <template v-else-if="data">
        <section v-if="isHrAdmin" aria-labelledby="review-readiness">
          <div class="mb-4 flex items-center justify-between gap-4">
            <div>
              <p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Live register</p>
              <h2 id="review-readiness" class="mt-1 text-xl font-semibold text-highlighted">Review readiness</h2>
            </div>
            <UBadge color="neutral" variant="subtle" label="Human decision required" />
          </div>

          <div class="grid overflow-hidden rounded-xl border border-default bg-default sm:grid-cols-2 xl:grid-cols-5">
            <div
              v-for="item in [
                { label: 'Active cycles', value: data.summary?.activeCycles ?? 0 },
                { label: 'People in review', value: data.summary?.peopleInReview ?? 0 },
                { label: 'Awaiting response', value: data.summary?.awaitingResponse ?? 0 },
                { label: 'Overdue', value: data.summary?.overdue ?? 0 },
                { label: 'Published roles', value: data.summary?.rolesPublished ?? 0 },
              ]"
              :key="item.label"
              class="border-b border-default p-5 last:border-b-0 sm:border-r xl:border-b-0"
            >
              <p class="text-xs font-medium uppercase tracking-wide text-muted">{{ item.label }}</p>
              <p class="mt-3 font-mono text-3xl font-semibold tabular-nums text-highlighted">{{ item.value }}</p>
            </div>
          </div>
        </section>

        <section v-if="isHrAdmin" class="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div class="rounded-xl border border-default bg-default">
            <div class="border-b border-default px-5 py-4">
              <p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Required sequence</p>
              <h2 class="mt-1 text-lg font-semibold text-highlighted">Build the review on evidence, not assumptions</h2>
            </div>
            <ol class="divide-y divide-default">
              <li
                v-for="(step, index) in [
                  { title: 'Owner discovery', detail: 'Define purpose, scope, source consent and fairness controls.', ready: onboardingComplete, to: '/agency/hr/onboarding' },
                  { title: 'Role architecture', detail: 'Reconcile contract titles with actual responsibilities and decision rights.', ready: (data.summary?.rolesPublished ?? 0) > 0, to: '/agency/hr/roles' },
                  { title: 'Questionnaire design', detail: 'Generate a neutral core plus role-specific modules and quality checks.', ready: false },
                  { title: 'Review cycle', detail: 'Assign people, set deadlines, notify and schedule interviews.', ready: (data.summary?.activeCycles ?? 0) > 0, to: '/agency/hr/reviews' },
                ]"
                :key="step.title"
                class="flex gap-4 px-5 py-5"
              >
                <span class="font-mono text-sm text-muted">{{ String(index + 1).padStart(2, '0') }}</span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="font-medium text-highlighted">{{ step.title }}</h3>
                    <UBadge
                      :color="step.ready ? 'success' : index === 0 ? 'warning' : 'neutral'"
                      variant="subtle"
                      :label="step.ready ? 'Complete' : index === 0 ? 'Required' : 'Next phase'"
                    />
                  </div>
                  <p class="mt-1 text-sm leading-6 text-muted">{{ step.detail }}</p>
                </div>
                <UButton
                  v-if="step.to"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-chevron-right"
                  :to="step.to"
                  :aria-label="`Open ${step.title}`"
                />
              </li>
            </ol>
          </div>

          <aside class="rounded-xl border border-default bg-elevated/30 p-5">
            <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-shield-check" class="size-5" />
            </div>
            <h2 class="mt-4 text-lg font-semibold text-highlighted">Guardrails are active</h2>
            <ul class="mt-4 space-y-3 text-sm text-muted">
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" /> Owner-only discovery profile</li>
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" /> No private-message collection</li>
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" /> No health or personality inference</li>
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" /> Scores abstain below evidence threshold</li>
              <li class="flex gap-2"><UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-success" /> Final decisions stay with a human</li>
            </ul>
          </aside>
        </section>

        <section aria-labelledby="my-review-assignments">
          <div class="mb-4">
            <p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Private to you</p>
            <h2 id="my-review-assignments" class="mt-1 text-xl font-semibold text-highlighted">My assignments</h2>
          </div>

          <div v-if="data.myAssignments.length" class="divide-y divide-default overflow-hidden rounded-xl border border-default">
            <div v-for="assignment in data.myAssignments" :key="assignment.id" class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-medium text-highlighted">{{ assignment.questionnaire_name }}</h3>
                  <UBadge :color="statusColor(assignment.status)" variant="subtle" :label="assignment.status.replaceAll('_', ' ')" />
                </div>
                <p class="mt-1 text-sm text-muted">{{ assignment.cycle_name }}<template v-if="assignment.role_title"> · {{ assignment.role_title }}</template></p>
              </div>
              <div class="sm:text-right">
                <p class="text-xs uppercase tracking-wide text-muted">Required by</p>
                <p class="mt-1 font-mono text-sm text-highlighted">{{ formatDate(assignment.due_at) }}</p>
              </div>
              <UButton color="neutral" variant="outline" :label="assignment.status === 'submitted' ? 'View' : 'Open'" trailing-icon="i-lucide-arrow-right" :to="`/agency/hr/assignments/${assignment.id}`" />
            </div>
          </div>
          <div v-else class="rounded-xl border border-dashed border-default px-6 py-10 text-center">
            <UIcon name="i-lucide-inbox" class="mx-auto size-7 text-muted" />
            <p class="mt-3 font-medium text-highlighted">No review assignments yet</p>
            <p class="mt-1 text-sm text-muted">Notifications and required dates will appear here when a review is opened.</p>
          </div>
        </section>

        <section v-if="data.myFollowUps?.length" aria-labelledby="my-review-follow-ups">
          <div class="mb-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Actions after review</p><h2 id="my-review-follow-ups" class="mt-1 text-xl font-semibold text-highlighted">My follow-ups</h2></div>
          <div class="divide-y divide-default overflow-hidden rounded-xl border border-default bg-default">
            <div v-for="followUp in data.myFollowUps" :key="followUp.id" class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UIcon :name="followUp.action_type === 'learning' ? 'i-lucide-graduation-cap' : 'i-lucide-list-checks'" class="size-4" /></div>
              <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h3 class="font-medium text-highlighted">{{ followUp.title }}</h3><UBadge color="neutral" variant="subtle" :label="followUp.action_type.replaceAll('_', ' ')" /></div><p class="mt-1 line-clamp-2 text-sm text-muted">{{ followUp.description }}</p><p class="mt-2 text-xs text-muted">Owner: {{ followUp.owner_name }} · {{ followUp.cycle_name }}</p></div>
              <div class="sm:text-right"><p class="text-xs uppercase tracking-wide text-muted">Required by</p><p class="mt-1 font-mono text-sm text-highlighted">{{ formatDate(followUp.due_at) }}</p></div>
              <div class="flex flex-col gap-2"><UButton v-if="followUp.status === 'proposed' && followUp.participant_user_id === user?.id" color="neutral" variant="outline" label="Acknowledge" @click="acknowledgeFollowUp(followUp.id)" /><UButton v-if="followUp.status === 'completed' && followUp.participant_user_id === user?.id && !followUp.closure_acknowledged_at" color="neutral" variant="outline" label="Acknowledge closure" @click="acknowledgeClosure(followUp.id)" /></div>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
