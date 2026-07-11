<script setup lang="ts">
definePageMeta({
  title: 'HR Role Library',
  middleware: ['auth'],
})

type Benchmark = {
  framework_key: 'ami-mcf' | 'sfia-9' | 'pmi-pmcd'
  name: string
  publisher: string
  version: string
  source_url: string
}

type RoleProfile = {
  id: string
  title: string
  department: string | null
  status: string
  version_status: string
  version_id: string
  version: number
  purpose: string
  responsibilities: string[]
  expected_outcomes: string[]
  decision_authority: string[]
  dependencies: string[]
  out_of_scope: string[]
  benchmark_refs: Array<{ name?: string; publisher?: string; framework_key?: string }>
  published_at: string | null
  assigned_people: string | number
  question_count: number | null
  kpis: Array<{
    id: string; name: string; description: string | null; unit: string;
    direction: KpiDraft['direction']; targetValue: number | string | null;
    targetMin: number | string | null; targetMax: number | string | null;
    targetDescription: string | null; cadence: KpiDraft['cadence'];
    sourceType: KpiDraft['sourceType']; sourceRef: string; dataOwner: string | null;
    weight: number | string; departmentGoalVersionId: string | null;
    goalContributionWeight: number | string | null; goalRationale: string | null;
  }>
}
type ContractExtract = {
  id: string
  team_member_id: string
  member_name: string
  role_title: string
  department: string | null
  role_purpose: string
  responsibilities: string[]
  expected_outcomes: string[]
  decision_authority: string[]
  role_exclusions: string[]
}
type DepartmentGoal = { version_id: string; name: string; department_name: string; metric_name: string; unit: string; period_end: string }
type KpiDraft = {
  name: string
  description: string
  unit: string
  direction: 'higher_is_better' | 'lower_is_better' | 'within_range' | 'milestone'
  targetValue: number | null
  targetMin: number | null
  targetMax: number | null
  targetDescription: string
  cadence: 'weekly' | 'monthly' | 'quarterly' | 'per_project' | 'annual'
  sourceType: 'platform' | 'monday' | 'approved_report' | 'manual_verified' | 'other'
  sourceRef: string
  dataOwner: string
  weight: number
  departmentGoalVersionId: string
  goalContributionWeight: number
  goalRationale: string
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const roles = ref<RoleProfile[]>([])
const benchmarks = ref<Benchmark[]>([])
const contractExtracts = ref<ContractExtract[]>([])
const departmentGoals = ref<DepartmentGoal[]>([])
const showBuilder = ref(false)
const editingRoleId = ref<string | null>(null)
const expectedVersion = ref<number | null>(null)

const form = reactive({
  title: '',
  department: '',
  purpose: '',
  responsibilities: '',
  expectedOutcomes: '',
  decisionAuthority: '',
  dependencies: '',
  outOfScope: '',
  benchmarkKey: 'ami-mcf' as Benchmark['framework_key'],
  contractExtractId: '',
  kpis: [] as KpiDraft[],
  publish: true,
})

const benchmarkItems = computed(() => benchmarks.value.map(item => ({
  label: `${item.name} — ${item.publisher}`,
  value: item.framework_key,
})))
const contractExtractItems = computed(() => contractExtracts.value.map(item => ({
  label: `${item.member_name} — ${item.role_title}`,
  value: item.id,
})))
const departmentGoalItems = computed(() => departmentGoals.value.map(item => ({
  label: `${item.department_name} — ${item.name} (${item.metric_name})`,
  value: item.version_id,
})))
const kpiWeightTotal = computed(() => form.kpis.reduce((total, kpi) => total + Number(kpi.weight || 0), 0))

function splitLines(value: string): string[] {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

async function refresh() {
  loading.value = true
  try {
    const data = await apiFetch<{ roles: RoleProfile[]; benchmarks: Benchmark[]; contractExtracts: ContractExtract[]; departmentGoals: DepartmentGoal[] }>('/api/agency/hr/roles')
    roles.value = data.roles
    benchmarks.value = data.benchmarks
    contractExtracts.value = data.contractExtracts
    departmentGoals.value = data.departmentGoals
  } catch (error: any) {
    toast.add({ title: 'Role library unavailable', description: error?.data?.statusMessage, color: 'error' })
  } finally {
    loading.value = false
  }
}

onMounted(() => void refresh())

function resetForm() {
  Object.assign(form, {
    title: '', department: '', purpose: '', responsibilities: '', expectedOutcomes: '',
    decisionAuthority: '', dependencies: '', outOfScope: '', benchmarkKey: 'ami-mcf', contractExtractId: '', kpis: [], publish: true,
  })
}

function startNewRole() {
  editingRoleId.value = null
  expectedVersion.value = null
  resetForm()
  showBuilder.value = true
}

function reviseRole(role: RoleProfile) {
  editingRoleId.value = role.id
  expectedVersion.value = Number(role.version)
  Object.assign(form, {
    title: role.title,
    department: role.department || '',
    purpose: role.purpose,
    responsibilities: role.responsibilities.join('\n'),
    expectedOutcomes: role.expected_outcomes.join('\n'),
    decisionAuthority: role.decision_authority.join('\n'),
    dependencies: role.dependencies.join('\n'),
    outOfScope: role.out_of_scope.join('\n'),
    benchmarkKey: role.benchmark_refs?.[0]?.framework_key || 'ami-mcf',
    contractExtractId: '',
    kpis: role.kpis.map(kpi => ({
      name: kpi.name,
      description: kpi.description || '',
      unit: kpi.unit,
      direction: kpi.direction,
      targetValue: kpi.targetValue === null ? null : Number(kpi.targetValue),
      targetMin: kpi.targetMin === null ? null : Number(kpi.targetMin),
      targetMax: kpi.targetMax === null ? null : Number(kpi.targetMax),
      targetDescription: kpi.targetDescription || '',
      cadence: kpi.cadence,
      sourceType: kpi.sourceType,
      sourceRef: kpi.sourceRef,
      dataOwner: kpi.dataOwner || '',
      weight: Number(kpi.weight),
      departmentGoalVersionId: kpi.departmentGoalVersionId || '',
      goalContributionWeight: Number(kpi.goalContributionWeight || 100),
      goalRationale: kpi.goalRationale || '',
    })),
    publish: true,
  })
  showBuilder.value = true
}

function addKpi() {
  const nextWeight = form.kpis.length === 0 ? 100 : 0
  form.kpis.push({
    name: '', description: '', unit: '', direction: 'higher_is_better', targetValue: null,
    targetMin: null, targetMax: null, targetDescription: '', cadence: 'monthly',
    sourceType: 'platform', sourceRef: '', dataOwner: '', weight: nextWeight,
    departmentGoalVersionId: '', goalContributionWeight: 100, goalRationale: '',
  })
}

function removeKpi(index: number) { form.kpis.splice(index, 1) }

function applyContractExtract(extractId: string) {
  form.contractExtractId = extractId
  const extract = contractExtracts.value.find(item => item.id === extractId)
  if (!extract) return
  form.title = extract.role_title
  form.department = extract.department || ''
  form.purpose = extract.role_purpose
  form.responsibilities = extract.responsibilities.join('\n')
  form.expectedOutcomes = extract.expected_outcomes.join('\n')
  form.decisionAuthority = extract.decision_authority.join('\n')
  form.outOfScope = extract.role_exclusions.join('\n')
}

async function createRole() {
  if (!form.title.trim() || !form.purpose.trim() || splitLines(form.responsibilities).length === 0 || splitLines(form.expectedOutcomes).length === 0) {
    toast.add({ title: 'Complete the role baseline', description: 'Title, purpose, responsibilities and expected outcomes are required.', color: 'warning' })
    return
  }
  if (form.kpis.some(kpi => !kpi.sourceRef.trim())) {
    toast.add({ title: 'Add every KPI source reference', description: 'Each measure needs a report, board or metric identifier that the employee can challenge.', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const endpoint = editingRoleId.value
      ? `/api/agency/hr/roles/${editingRoleId.value}/versions`
      : '/api/agency/hr/roles'
    await apiFetch(endpoint, {
      method: 'POST',
      body: {
        ...(editingRoleId.value ? { expectedVersion: expectedVersion.value } : {}),
        title: form.title,
        department: form.department || undefined,
        purpose: form.purpose,
        responsibilities: splitLines(form.responsibilities),
        expectedOutcomes: splitLines(form.expectedOutcomes),
        decisionAuthority: splitLines(form.decisionAuthority),
        dependencies: splitLines(form.dependencies),
        outOfScope: splitLines(form.outOfScope),
        benchmarkKey: form.benchmarkKey,
        contractExtractId: form.contractExtractId || undefined,
        kpis: form.kpis.map(kpi => ({
          ...kpi,
          description: kpi.description || undefined,
          targetValue: kpi.targetValue ?? undefined,
          targetMin: kpi.targetMin ?? undefined,
          targetMax: kpi.targetMax ?? undefined,
          targetDescription: kpi.targetDescription || undefined,
          sourceRef: kpi.sourceRef,
          dataOwner: kpi.dataOwner || undefined,
          departmentGoalVersionId: kpi.departmentGoalVersionId || undefined,
          goalRationale: kpi.goalRationale || undefined,
        })),
        publish: form.publish,
      },
    })
    toast.add({ title: editingRoleId.value ? 'New role version saved' : form.publish ? 'Role profile published' : 'Role draft created', description: 'A neutral questionnaire and evidence-aware scorecard were generated with the role version.', color: 'success' })
    resetForm()
    showBuilder.value = false
    editingRoleId.value = null
    expectedVersion.value = null
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not create role profile', description: error?.data?.statusMessage || 'Review the profile and try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-3xl border-l-4 border-primary pl-5">
            <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Contract → responsibilities → evidence</p>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Role architecture library</h1>
            <p class="mt-3 text-sm leading-6 text-muted">Publish what good work means before asking anyone to account for it. Each version carries its questionnaire, benchmark and evidence threshold.</p>
          </div>
          <div class="flex gap-2">
            <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" />
            <UButton icon="i-lucide-plus" label="Build role profile" @click="startNewRole" />
          </div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div class="grid gap-7" :class="showBuilder ? 'xl:grid-cols-[minmax(0,1fr)_440px]' : ''">
        <section>
          <div class="mb-4 flex items-center justify-between">
            <div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Controlled definitions</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Published and draft roles</h2></div>
            <UBadge color="neutral" variant="subtle" :label="`${roles.length} profiles`" />
          </div>

          <div v-if="loading" class="flex min-h-64 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
          <div v-else-if="roles.length" class="space-y-4">
            <article v-for="role in roles" :key="role.id" class="overflow-hidden rounded-xl border border-default bg-default">
              <div class="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-semibold text-highlighted">{{ role.title }}</h3>
                    <UBadge :color="role.status === 'active' ? 'success' : 'warning'" variant="subtle" :label="role.status" />
                    <UBadge color="neutral" variant="outline" :label="`v${role.version}`" />
                  </div>
                  <p class="mt-1 text-sm text-muted">{{ role.department || 'No department' }}</p>
                  <p class="mt-3 max-w-3xl text-sm leading-6 text-muted">{{ role.purpose }}</p>
                </div>
                <div class="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-lg border border-default bg-default text-center">
                  <div class="bg-elevated/40 px-4 py-3"><p class="font-mono text-lg font-semibold text-highlighted">{{ role.question_count ?? 0 }}</p><p class="text-[11px] uppercase tracking-wide text-muted">questions</p></div>
                  <div class="bg-elevated/40 px-4 py-3"><p class="font-mono text-lg font-semibold text-highlighted">{{ role.assigned_people }}</p><p class="text-[11px] uppercase tracking-wide text-muted">assigned</p></div>
                  <div class="bg-elevated/40 px-4 py-3"><p class="font-mono text-lg font-semibold text-highlighted">{{ role.kpis?.length || 0 }}</p><p class="text-[11px] uppercase tracking-wide text-muted">KPIs</p></div>
                </div>
              </div>
              <div class="grid gap-px border-t border-default bg-default md:grid-cols-3">
                <div class="bg-elevated/20 p-4"><p class="text-xs font-semibold uppercase tracking-wide text-muted">Responsibilities</p><p class="mt-2 text-sm text-highlighted">{{ role.responsibilities.length }} observable accountabilities</p></div>
                <div class="bg-elevated/20 p-4"><p class="text-xs font-semibold uppercase tracking-wide text-muted">Expected outcomes</p><p class="mt-2 text-sm text-highlighted">{{ role.expected_outcomes.length }} agreed results</p></div>
                <div class="bg-elevated/20 p-4"><p class="text-xs font-semibold uppercase tracking-wide text-muted">Benchmark</p><p class="mt-2 text-sm text-highlighted">{{ role.benchmark_refs?.[0]?.name || 'Framework pending' }}</p></div>
              </div>
              <div class="flex justify-end border-t border-default p-4"><UButton color="neutral" variant="outline" icon="i-lucide-git-branch-plus" label="Revise role" @click="reviseRole(role)" /></div>
            </article>
          </div>
          <div v-else class="rounded-xl border border-dashed border-default px-6 py-14 text-center">
            <UIcon name="i-lucide-badge-check" class="mx-auto size-8 text-muted" />
            <p class="mt-3 font-medium text-highlighted">No governed role profiles yet</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-muted">Start with a contractual role, then describe its purpose, responsibilities and expected outcomes in observable terms.</p>
          </div>
        </section>

        <aside v-if="showBuilder" class="xl:sticky xl:top-6 xl:self-start">
          <div class="overflow-hidden rounded-xl border border-default bg-default">
            <div class="border-b border-default bg-elevated/30 px-5 py-4">
              <p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">New controlled version</p>
              <h2 class="mt-1 text-lg font-semibold text-highlighted">Build role baseline</h2>
            </div>
            <div class="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-5">
              <UAlert v-if="contractExtractItems.length === 0" color="neutral" variant="soft" icon="i-lucide-file-lock-2" title="No approved contract extracts yet" description="You can still build a role manually, or secure and approve contracts in the HR contract vault first." :actions="[{ label: 'Open contract vault', to: '/agency/hr/contracts' }]" />
              <UFormField v-else label="Seed from approved contract extract" help="Copies only owner-approved role facts; sensitive clauses remain excluded.">
                <USelectMenu :model-value="form.contractExtractId" :items="contractExtractItems" value-key="value" placeholder="Choose a team member contract" class="w-full" @update:model-value="value => applyContractExtract(String(value || ''))" />
              </UFormField>
              <UFormField label="Contract role title" required><UInput v-model="form.title" placeholder="e.g. Senior Account Manager" class="w-full" /></UFormField>
              <UFormField label="Department"><UInput v-model="form.department" placeholder="e.g. Client Service" class="w-full" /></UFormField>
              <UFormField label="Role purpose" required help="Describe why the role exists, not the person currently in it."><UTextarea v-model="form.purpose" :rows="4" class="w-full" /></UFormField>
              <UFormField label="Agreed responsibilities" required help="One observable responsibility per line."><UTextarea v-model="form.responsibilities" :rows="6" placeholder="Own the monthly client planning cycle&#10;Maintain approved campaign budgets" class="w-full" /></UFormField>
              <UFormField label="Expected outcomes" required help="One measurable or verifiable outcome per line."><UTextarea v-model="form.expectedOutcomes" :rows="5" class="w-full" /></UFormField>
              <div class="rounded-lg border border-default">
                <div class="flex items-center justify-between border-b border-default bg-elevated/30 p-4"><div><p class="text-sm font-medium text-highlighted">Role KPI register</p><p class="mt-1 text-xs text-muted">Operational evidence, not questionnaire opinion.</p></div><div class="flex items-center gap-2"><UBadge :color="form.kpis.length === 0 || kpiWeightTotal === 100 ? 'success' : 'warning'" variant="subtle" :label="`${kpiWeightTotal}%`" /><UButton color="neutral" variant="outline" size="sm" icon="i-lucide-plus" label="Add KPI" @click="addKpi" /></div></div>
                <div v-if="form.kpis.length" class="divide-y divide-default">
                  <div v-for="(kpi, index) in form.kpis" :key="index" class="space-y-4 p-4">
                    <div class="flex items-center justify-between"><p class="font-mono text-xs uppercase tracking-wide text-muted">KPI {{ index + 1 }}</p><UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" aria-label="Remove KPI" @click="removeKpi(index)" /></div>
                    <UFormField label="Measure name" required><UInput v-model="kpi.name" placeholder="e.g. Budget pacing variance" class="w-full" /></UFormField>
                    <UFormField label="Definition"><UTextarea v-model="kpi.description" :rows="2" placeholder="Exactly what is included and excluded" class="w-full" /></UFormField>
                    <div class="grid gap-3 sm:grid-cols-2"><UFormField label="Unit" required><UInput v-model="kpi.unit" placeholder="%, days, $, count" class="w-full" /></UFormField><UFormField label="Direction" required><USelectMenu v-model="kpi.direction" :items="[{ label: 'Higher is better', value: 'higher_is_better' }, { label: 'Lower is better', value: 'lower_is_better' }, { label: 'Within range', value: 'within_range' }, { label: 'Milestone', value: 'milestone' }]" value-key="value" class="w-full" /></UFormField></div>
                    <div v-if="kpi.direction === 'within_range'" class="grid gap-3 sm:grid-cols-2"><UFormField label="Target minimum" required><UInput v-model.number="kpi.targetMin" type="number" class="w-full" /></UFormField><UFormField label="Target maximum" required><UInput v-model.number="kpi.targetMax" type="number" class="w-full" /></UFormField></div>
                    <UFormField v-else-if="kpi.direction === 'milestone'" label="Milestone target" required><UInput v-model="kpi.targetDescription" placeholder="Observable completion condition" class="w-full" /></UFormField>
                    <UFormField v-else label="Numeric target" required><UInput v-model.number="kpi.targetValue" type="number" class="w-full" /></UFormField>
                    <div class="grid gap-3 sm:grid-cols-2"><UFormField label="Cadence" required><USelectMenu v-model="kpi.cadence" :items="[{ label: 'Weekly', value: 'weekly' }, { label: 'Monthly', value: 'monthly' }, { label: 'Quarterly', value: 'quarterly' }, { label: 'Per project', value: 'per_project' }, { label: 'Annual', value: 'annual' }]" value-key="value" class="w-full" /></UFormField><UFormField label="Weight within KPI outcome" required><UInput v-model.number="kpi.weight" type="number" :min="1" :max="100" class="w-full"><template #trailing>%</template></UInput></UFormField></div>
                    <div class="grid gap-3 sm:grid-cols-2"><UFormField label="Approved source" required><USelectMenu v-model="kpi.sourceType" :items="[{ label: 'Platform data', value: 'platform' }, { label: 'Monday.com', value: 'monday' }, { label: 'Approved report', value: 'approved_report' }, { label: 'Manual + verified', value: 'manual_verified' }, { label: 'Other', value: 'other' }]" value-key="value" class="w-full" /></UFormField><UFormField label="Source reference"><UInput v-model="kpi.sourceRef" placeholder="Report, board or metric identifier" class="w-full" /></UFormField></div>
                    <UFormField label="Data owner"><UInput v-model="kpi.dataOwner" placeholder="Who verifies this measure?" class="w-full" /></UFormField>
                    <UFormField label="Contributes to department goal"><USelectMenu v-model="kpi.departmentGoalVersionId" :items="departmentGoalItems" value-key="value" placeholder="Optional approved department goal" class="w-full" /></UFormField>
                    <UFormField v-if="kpi.departmentGoalVersionId" label="Contribution rationale"><UTextarea v-model="kpi.goalRationale" :rows="2" placeholder="Explain how this role KPI contributes without making the individual solely responsible for the department result." class="w-full" /></UFormField>
                  </div>
                </div>
                <div v-else class="p-4 text-sm text-muted">KPIs are optional, but recommended where a reliable measure and approved source exist. The scorecard still contains verified role outcomes when no KPI is suitable.</div>
              </div>
              <UFormField label="Decision authority" help="One decision right per line."><UTextarea v-model="form.decisionAuthority" :rows="4" class="w-full" /></UFormField>
              <UFormField label="Dependencies" help="Teams, approvals or inputs this role relies on."><UTextarea v-model="form.dependencies" :rows="4" class="w-full" /></UFormField>
              <UFormField label="Explicitly out of scope" help="Prevents people being judged for work they do not own."><UTextarea v-model="form.outOfScope" :rows="4" class="w-full" /></UFormField>
              <UFormField label="Industry framework" required><USelectMenu v-model="form.benchmarkKey" :items="benchmarkItems" value-key="value" class="w-full" /></UFormField>
              <label class="flex gap-3 rounded-lg border border-default p-4"><UCheckbox v-model="form.publish" class="mt-0.5" /><span><span class="block text-sm font-medium text-highlighted">Publish version 1</span><span class="mt-1 block text-sm text-muted">Makes this role eligible for review assignments. The role still requires acknowledgement.</span></span></label>
            </div>
            <div class="flex justify-end gap-2 border-t border-default p-4"><UButton color="neutral" variant="ghost" label="Cancel" @click="showBuilder = false" /><UButton icon="i-lucide-badge-check" label="Create profile" :loading="saving" @click="createRole" /></div>
          </div>
        </aside>
      </div>
    </main>
  </div>
</template>
