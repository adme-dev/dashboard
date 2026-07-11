<script setup lang="ts">
definePageMeta({
  title: 'Private Owner Onboarding',
  middleware: ['auth'],
})

type SourceKey = 'platform' | 'monday' | 'slack' | 'email'

type OnboardingResponse = {
  session: null | {
    id: string
    status: 'draft' | 'completed'
    currentStep: number
    answers: Record<string, any>
    consentedSources: SourceKey[]
  }
  privacy: {
    visibility: string
    privateMessagesExcluded: boolean
    automatedEmploymentDecisions: boolean
  }
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const sessionId = ref<string>()
const currentStep = ref(1)
const completed = ref(false)

const form = reactive({
  companyName: '',
  reviewObjectives: '',
  departments: '',
  successDefinition: '',
  coreProcesses: '',
  knownDisconnects: '',
  workloadPressurePoints: '',
  contractSource: '',
  responsibilityOwner: '',
  titleExceptions: '',
  excludedChannels: '',
  lookbackDays: 90,
  interviewsIncluded: true,
  announcementSent: true,
  employeeSupportContact: '',
  additionalContext: '',
})

const sources = reactive<Record<SourceKey, boolean>>({
  platform: true,
  monday: false,
  slack: false,
  email: false,
})

const sourceOptions: Array<{ key: SourceKey; label: string; detail: string; locked?: boolean }> = [
  { key: 'platform', label: 'Platform records', detail: 'Tasks, projects, time and documented workflow activity.', locked: true },
  { key: 'monday', label: 'Monday.com', detail: 'Assigned work, status history, dependencies and due dates.' },
  { key: 'slack', label: 'Slack channels', detail: 'Approved public work channels only; private messages remain excluded.' },
  { key: 'email', label: 'Work email', detail: 'Approved business mailboxes and work threads only.' },
]

const lookbackOptions = [
  { label: 'Last 30 days', value: 30 },
  { label: 'Last 90 days', value: 90 },
  { label: 'Last 180 days', value: 180 },
  { label: 'Last 12 months', value: 365 },
]

const steps = [
  { title: 'Review intent', eyebrow: 'Why now' },
  { title: 'Operating model', eyebrow: 'How work moves' },
  { title: 'Role governance', eyebrow: 'Contract baseline' },
  { title: 'Evidence scope', eyebrow: 'Explicit consent' },
  { title: 'Fairness controls', eyebrow: 'Non-negotiables' },
  { title: 'Questionnaire rules', eyebrow: 'Neutral by design' },
  { title: 'Communication', eyebrow: 'Employee context' },
  { title: 'Review & seal', eyebrow: 'Owner approval' },
]

function splitLines(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

function joinLines(value: unknown): string {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string').join('\n') : ''
}

function selectedSources(): SourceKey[] {
  return (Object.keys(sources) as SourceKey[]).filter(key => sources[key])
}

function hydrate(data: OnboardingResponse) {
  const session = data.session
  if (!session) return
  sessionId.value = session.id
  currentStep.value = session.currentStep
  completed.value = session.status === 'completed'
  const answers = session.answers || {}
  const business = answers.business || {}
  const operations = answers.operatingModel || {}
  const role = answers.roleGovernance || {}
  const evidence = answers.evidence || {}
  const questionnaire = answers.questionnaire || {}
  const communications = answers.communications || {}

  form.companyName = business.companyName || ''
  form.reviewObjectives = joinLines(business.reviewObjectives)
  form.departments = joinLines(business.departments)
  form.successDefinition = business.successDefinition || ''
  form.coreProcesses = joinLines(operations.coreProcesses)
  form.knownDisconnects = joinLines(operations.knownDisconnects)
  form.workloadPressurePoints = joinLines(operations.workloadPressurePoints)
  form.contractSource = role.contractSource || ''
  form.responsibilityOwner = role.responsibilityOwner || ''
  form.titleExceptions = role.titleExceptions || ''
  form.excludedChannels = joinLines(evidence.excludedChannels)
  form.lookbackDays = evidence.lookbackDays || 90
  form.interviewsIncluded = questionnaire.interviewsIncluded ?? true
  form.announcementSent = communications.announcementSent ?? true
  form.employeeSupportContact = communications.employeeSupportContact || ''
  form.additionalContext = communications.additionalContext || ''

  for (const key of Object.keys(sources) as SourceKey[]) {
    sources[key] = session.consentedSources.includes(key)
  }
  sources.platform = true
}

async function load() {
  loading.value = true
  try {
    hydrate(await apiFetch<OnboardingResponse>('/api/agency/hr/onboarding'))
  } catch (error: any) {
    toast.add({
      title: 'Private onboarding unavailable',
      description: error?.data?.statusMessage || 'You may not have access to this owner-only workspace.',
      color: 'error',
    })
    await navigateTo('/agency/hr')
  } finally {
    loading.value = false
  }
}

onMounted(() => void load())

function payload(status: 'draft' | 'completed') {
  const consentedSources = selectedSources()
  return {
    sessionId: sessionId.value,
    currentStep: currentStep.value,
    status,
    consentedSources,
    answers: {
      business: {
        companyName: form.companyName,
        reviewObjectives: splitLines(form.reviewObjectives),
        departments: splitLines(form.departments),
        successDefinition: form.successDefinition,
      },
      operatingModel: {
        coreProcesses: splitLines(form.coreProcesses),
        knownDisconnects: splitLines(form.knownDisconnects),
        workloadPressurePoints: splitLines(form.workloadPressurePoints),
      },
      roleGovernance: {
        contractSource: form.contractSource,
        responsibilityOwner: form.responsibilityOwner,
        titleExceptions: form.titleExceptions,
      },
      evidence: {
        approvedSources: consentedSources,
        excludedChannels: splitLines(form.excludedChannels),
        lookbackDays: form.lookbackDays,
        includePrivateMessages: false,
      },
      fairness: {
        humanReviewRequired: true,
        noAutomatedEmploymentDecisions: true,
        prohibitedInferences: ['health', 'disability', 'family status', 'personality labels'],
      },
      questionnaire: {
        interviewsIncluded: form.interviewsIncluded,
        allowNotApplicable: true,
        freeTextOptional: true,
      },
      communications: {
        announcementSent: form.announcementSent,
        employeeSupportContact: form.employeeSupportContact,
        additionalContext: form.additionalContext,
      },
      schedule: { timezone: 'Australia/Melbourne' },
    },
  }
}

async function save(status: 'draft' | 'completed' = 'draft') {
  saving.value = true
  try {
    const response = await apiFetch<{ session: { id: string; status: string } }>('/api/agency/hr/onboarding', {
      method: 'PUT',
      body: payload(status),
    })
    sessionId.value = response.session.id
    completed.value = response.session.status === 'completed'
    toast.add({
      title: status === 'completed' ? 'Owner profile sealed' : 'Private draft saved',
      description: status === 'completed'
        ? 'The approved context can now govern role profiles and questionnaires.'
        : 'Only the business owner can retrieve these answers.',
      color: 'success',
    })
    if (status === 'completed') await navigateTo('/agency/hr')
  } catch (error: any) {
    toast.add({
      title: 'Could not save onboarding',
      description: error?.data?.statusMessage || 'Please review the current section and try again.',
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

async function next() {
  if (currentStep.value < steps.length) {
    currentStep.value += 1
    await save('draft')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function previous() {
  if (currentStep.value > 1) currentStep.value -= 1
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto max-w-6xl px-5 py-7 sm:px-8">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              <UIcon name="i-lucide-lock-keyhole" class="size-4" />
              Business owner only
            </div>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Owner discovery dossier</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
              This context governs what the system may examine and how it constructs role-specific reviews. It is not shared with participants.
            </p>
          </div>
          <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" />
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div v-if="loading" class="flex min-h-72 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" />
      </div>

      <div v-else class="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside>
          <div class="sticky top-6 overflow-hidden rounded-xl border border-default bg-default">
            <div class="border-b border-default bg-elevated/40 px-4 py-3">
              <p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Dossier progress</p>
              <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-accented">
                <div class="h-full bg-primary transition-all" :style="{ width: `${(currentStep / steps.length) * 100}%` }" />
              </div>
            </div>
            <nav aria-label="Onboarding sections" class="p-2">
              <button
                v-for="(step, index) in steps"
                :key="step.title"
                type="button"
                class="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors"
                :class="currentStep === index + 1 ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-elevated hover:text-highlighted'"
                @click="currentStep = index + 1"
              >
                <span class="mt-0.5 font-mono text-xs">{{ String(index + 1).padStart(2, '0') }}</span>
                <span>
                  <span class="block text-sm font-medium">{{ step.title }}</span>
                  <span class="mt-0.5 block text-xs opacity-75">{{ step.eyebrow }}</span>
                </span>
              </button>
            </nav>
          </div>
        </aside>

        <section class="min-w-0">
          <div class="rounded-xl border border-default bg-default">
            <div class="border-b border-default px-5 py-5 sm:px-7">
              <p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">Section {{ currentStep }} of {{ steps.length }}</p>
              <h2 class="mt-1 text-2xl font-semibold text-highlighted">{{ steps[currentStep - 1]?.title }}</h2>
            </div>

            <div class="space-y-6 px-5 py-6 sm:px-7 sm:py-7">
              <template v-if="currentStep === 1">
                <UAlert
                  color="info"
                  variant="soft"
                  icon="i-lucide-compass"
                  title="Describe the business outcome—not the people you expect to find at fault."
                  description="These answers establish the neutral purpose against which later questions are checked."
                />
                <UFormField label="Business name" name="companyName">
                  <UInput v-model="form.companyName" placeholder="Company or operating entity" class="w-full" />
                </UFormField>
                <UFormField label="Review objectives" name="reviewObjectives" help="One objective per line. Use observable business outcomes.">
                  <UTextarea v-model="form.reviewObjectives" :rows="5" placeholder="Clarify role ownership&#10;Identify recurring workflow blockers&#10;Understand workload distribution" class="w-full" />
                </UFormField>
                <UFormField label="Departments in scope" name="departments" help="One department per line.">
                  <UTextarea v-model="form.departments" :rows="4" placeholder="Client service&#10;Operations&#10;Media" class="w-full" />
                </UFormField>
                <UFormField label="What would a fair, useful outcome look like?" name="successDefinition">
                  <UTextarea v-model="form.successDefinition" :rows="4" placeholder="Describe decisions, clarity or process improvements this review should enable." class="w-full" />
                </UFormField>
              </template>

              <template v-else-if="currentStep === 2">
                <p class="text-sm leading-6 text-muted">Map the system around the people. Process friction is recorded separately from individual contribution.</p>
                <UFormField label="Core processes" name="coreProcesses" help="One process per line.">
                  <UTextarea v-model="form.coreProcesses" :rows="5" placeholder="Client onboarding&#10;Campaign launch&#10;Monthly reporting" class="w-full" />
                </UFormField>
                <UFormField label="Known hand-off or ownership disconnects" name="knownDisconnects">
                  <UTextarea v-model="form.knownDisconnects" :rows="5" placeholder="State the observable disconnect without naming a person or assigning blame." class="w-full" />
                </UFormField>
                <UFormField label="Workload pressure points" name="workloadPressurePoints">
                  <UTextarea v-model="form.workloadPressurePoints" :rows="4" placeholder="Peak periods, bottlenecks or recurring capacity constraints." class="w-full" />
                </UFormField>
              </template>

              <template v-else-if="currentStep === 3">
                <UAlert color="neutral" variant="soft" icon="i-lucide-file-signature" title="Contracts establish the baseline" description="A job title alone will not govern a scorecard. The published role profile must reconcile contractual responsibilities, actual decision rights and agreed outcomes." />
                <UFormField label="Contract and position-description source" name="contractSource">
                  <UInput v-model="form.contractSource" placeholder="e.g. Employment contracts in Employment Hero" class="w-full" />
                </UFormField>
                <UFormField label="Who approves role-profile corrections?" name="responsibilityOwner">
                  <UInput v-model="form.responsibilityOwner" placeholder="Name or accountable role" class="w-full" />
                </UFormField>
                <UFormField label="Known title or responsibility exceptions" name="titleExceptions" help="Do not speculate about performance here.">
                  <UTextarea v-model="form.titleExceptions" :rows="6" placeholder="Record roles where the current title no longer reflects agreed responsibilities." class="w-full" />
                </UFormField>
              </template>

              <template v-else-if="currentStep === 4">
                <UAlert color="warning" variant="soft" icon="i-lucide-scan-eye" title="Approval is source-specific" description="Connecting a provider does not authorise blanket surveillance. Only approved workspaces, channels and mailboxes may be analysed, and private messages are always excluded." />
                <fieldset class="space-y-3">
                  <legend class="mb-3 text-sm font-medium text-highlighted">Approved evidence sources</legend>
                  <label v-for="source in sourceOptions" :key="source.key" class="flex cursor-pointer gap-3 rounded-lg border border-default p-4">
                    <UCheckbox v-model="sources[source.key]" :disabled="source.locked" class="mt-0.5" />
                    <span>
                      <span class="block text-sm font-medium text-highlighted">{{ source.label }}</span>
                      <span class="mt-1 block text-sm leading-5 text-muted">{{ source.detail }}</span>
                    </span>
                  </label>
                </fieldset>
                <UFormField label="Explicitly excluded channels, boards or mailboxes" name="excludedChannels" help="One exclusion per line.">
                  <UTextarea v-model="form.excludedChannels" :rows="5" placeholder="Leadership private&#10;Payroll mailbox&#10;Social channels" class="w-full" />
                </UFormField>
                <UFormField label="Evidence lookback" name="lookbackDays">
                  <USelectMenu v-model="form.lookbackDays" :items="lookbackOptions" value-key="value" class="w-full" />
                </UFormField>
              </template>

              <template v-else-if="currentStep === 5">
                <p class="text-sm leading-6 text-muted">These controls cannot be switched off by a review administrator.</p>
                <div class="divide-y divide-default overflow-hidden rounded-lg border border-default">
                  <div v-for="control in [
                    { title: 'Human review before publication', detail: 'No system-generated finding becomes an employment decision.' },
                    { title: 'Evidence threshold', detail: 'A score abstains when less than 70% of weighted criteria have suitable evidence.' },
                    { title: 'Protected-attribute exclusion', detail: 'No health, disability, family-status or cultural-background inference.' },
                    { title: 'No personality labels', detail: 'The system reports observable work patterns, never psychological personas.' },
                    { title: 'Employee context and correction', detail: 'Participants may explain blockers and challenge incorrect role assumptions.' },
                  ]" :key="control.title" class="flex gap-3 p-4">
                    <UIcon name="i-lucide-badge-check" class="mt-0.5 size-5 shrink-0 text-success" />
                    <div><p class="text-sm font-medium text-highlighted">{{ control.title }}</p><p class="mt-1 text-sm text-muted">{{ control.detail }}</p></div>
                  </div>
                </div>
              </template>

              <template v-else-if="currentStep === 6">
                <UAlert color="info" variant="soft" icon="i-lucide-message-square-text" title="Questions are role-governed and quality checked" description="Every participant receives the same neutral core plus modules justified by their published responsibilities. Loaded wording and one-sided answer sets are blocked." />
                <label class="flex gap-3 rounded-lg border border-default p-4">
                  <UCheckbox v-model="form.interviewsIncluded" class="mt-0.5" />
                  <span><span class="block text-sm font-medium text-highlighted">Include a follow-up interview</span><span class="mt-1 block text-sm text-muted">Calendar invitations can be scheduled after submission to clarify context and blockers.</span></span>
                </label>
                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="rounded-lg bg-elevated/50 p-4"><p class="text-sm font-medium text-highlighted">“Not applicable” is always available</p><p class="mt-1 text-sm text-muted">People are not forced to rate work outside their role.</p></div>
                  <div class="rounded-lg bg-elevated/50 p-4"><p class="text-sm font-medium text-highlighted">Free text remains optional</p><p class="mt-1 text-sm text-muted">Required narrative answers do not manufacture certainty.</p></div>
                </div>
              </template>

              <template v-else-if="currentStep === 7">
                <UFormField label="Announcement already sent" name="announcementSent">
                  <UCheckbox v-model="form.announcementSent" label="Team members have received the business review notice" />
                </UFormField>
                <UFormField label="Employee support or questions contact" name="employeeSupportContact">
                  <UInput v-model="form.employeeSupportContact" placeholder="Name, role or private contact channel" class="w-full" />
                </UFormField>
                <UFormField label="Additional context to include with assignments" name="additionalContext" help="This text may be visible to participants.">
                  <UTextarea v-model="form.additionalContext" :rows="6" placeholder="Explain the purpose, privacy boundary, required date and how the information will be used." class="w-full" />
                </UFormField>
              </template>

              <template v-else>
                <UAlert color="success" variant="soft" icon="i-lucide-shield-check" title="Ready to establish the business context" description="Completing this dossier publishes version 1 of the owner-approved context. Later changes create a new version so each review remains reproducible." />
                <dl class="divide-y divide-default rounded-lg border border-default">
                  <div class="grid gap-1 p-4 sm:grid-cols-[180px_1fr]"><dt class="text-sm text-muted">Objectives</dt><dd class="text-sm font-medium text-highlighted">{{ splitLines(form.reviewObjectives).length }} defined</dd></div>
                  <div class="grid gap-1 p-4 sm:grid-cols-[180px_1fr]"><dt class="text-sm text-muted">Departments</dt><dd class="text-sm font-medium text-highlighted">{{ splitLines(form.departments).join(', ') || 'Not specified' }}</dd></div>
                  <div class="grid gap-1 p-4 sm:grid-cols-[180px_1fr]"><dt class="text-sm text-muted">Evidence sources</dt><dd class="text-sm font-medium capitalize text-highlighted">{{ selectedSources().join(', ') }}</dd></div>
                  <div class="grid gap-1 p-4 sm:grid-cols-[180px_1fr]"><dt class="text-sm text-muted">Lookback</dt><dd class="text-sm font-medium text-highlighted">{{ form.lookbackDays }} days</dd></div>
                  <div class="grid gap-1 p-4 sm:grid-cols-[180px_1fr]"><dt class="text-sm text-muted">Private messages</dt><dd class="text-sm font-medium text-success">Always excluded</dd></div>
                  <div class="grid gap-1 p-4 sm:grid-cols-[180px_1fr]"><dt class="text-sm text-muted">Decision authority</dt><dd class="text-sm font-medium text-highlighted">Human reviewer only</dd></div>
                </dl>
              </template>
            </div>

            <footer class="flex flex-col-reverse gap-3 border-t border-default bg-elevated/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" label="Previous" :disabled="currentStep === 1 || saving" @click="previous" />
              <div class="flex flex-col gap-2 sm:flex-row">
                <UButton color="neutral" variant="outline" icon="i-lucide-save" label="Save private draft" :loading="saving" @click="save('draft')" />
                <UButton v-if="currentStep < steps.length" trailing-icon="i-lucide-chevron-right" label="Save & continue" :loading="saving" @click="next" />
                <UButton v-else icon="i-lucide-lock-keyhole" label="Complete & seal profile" :loading="saving" @click="save('completed')" />
              </div>
            </footer>
          </div>

          <p class="mt-4 flex items-center gap-2 text-xs text-muted">
            <UIcon name="i-lucide-lock" class="size-3.5" />
            Draft contents are excluded from participant APIs, notifications and calendar invitations.
          </p>
        </section>
      </div>
    </main>
  </div>
</template>
