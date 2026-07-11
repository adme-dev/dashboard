<script setup lang="ts">
definePageMeta({ title: 'HR Launch Governance', middleware: ['auth'] })

type GateKey = 'privacy_impact_assessment' | 'staff_notice_and_consultation' | 'source_scope_review' | 'accessibility_review' | 'scoring_calibration' | 'ai_safety_review' | 'human_decision_only' | 'no_hidden_monitoring' | 'pilot_approval'
type Attestation = { id: string; gate_key: GateKey; status: 'approved' | 'rejected' | 'pending'; evidence_reference: string; limitations: string | null; approved_at: string | null; expires_at: string | null; created_at: string }
type ReadinessResponse = { readiness: { ready: boolean; missing: GateKey[]; expired: GateKey[] }; attestations: Attestation[] }
type PilotResponse = { readiness: { ready: boolean; blockers: string[]; warnings: string[] }; facts: { completedOnboarding: number; publishedRoles: number; eligibleParticipants: number; emailConfigured: boolean; activeCycles: number; approvedMondayScope: boolean } }

const gateDefinitions: Array<{ key: GateKey; label: string; detail: string }> = [
  { key: 'privacy_impact_assessment', label: 'Privacy impact assessment', detail: 'Purpose, necessity, proportionality, retention and correction pathways are documented.' },
  { key: 'staff_notice_and_consultation', label: 'Staff notice and consultation', detail: 'Affected people were told what is changing and had a meaningful opportunity to respond.' },
  { key: 'source_scope_review', label: 'Source scope review', detail: 'Only approved business sources, fields and dates are enabled; private communications remain excluded.' },
  { key: 'accessibility_review', label: 'Accessibility review', detail: 'Owner, participant and reviewer flows have passed keyboard, screen-reader and responsive checks.' },
  { key: 'scoring_calibration', label: 'Scoring calibration', detail: 'Role-specific anchors, evidence coverage and abstention behaviour were reviewed before use.' },
  { key: 'ai_safety_review', label: 'AI safety review', detail: 'AI cannot publish ratings, findings or employment recommendations and cannot infer personality.' },
  { key: 'human_decision_only', label: 'Human decision only', detail: 'A named reviewer remains accountable for every score, finding, action and release decision.' },
  { key: 'no_hidden_monitoring', label: 'No hidden monitoring', detail: 'Participants can see the purpose, sources, period, audience and retention boundary.' },
  { key: 'pilot_approval', label: 'Controlled pilot approval', detail: 'A bounded pilot, support owner, rollback path and close-out review are approved.' },
]
const statusItems = [
  { label: 'Approved', value: 'approved' }, { label: 'Pending', value: 'pending' }, { label: 'Rejected', value: 'rejected' },
]
const expiryItems = [
  { label: '90 days', value: '90' }, { label: '180 days', value: '180' }, { label: 'One year', value: '365' }, { label: 'No expiry', value: 'none' },
]

const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const data = ref<ReadinessResponse | null>(null)
const pilot = ref<PilotResponse | null>(null)
const selectedKey = ref<GateKey>('privacy_impact_assessment')
const form = reactive({ status: 'pending', evidenceReference: '', limitations: '', expiry: '365' })
const apiFetch = $fetch as <T>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const selectedDefinition = computed(() => gateDefinitions.find(gate => gate.key === selectedKey.value)!)
const latestByGate = computed(() => Object.fromEntries((data.value?.attestations || []).map(item => [item.gate_key, item])))
const selectedHistory = computed(() => (data.value?.attestations || []).filter(item => item.gate_key === selectedKey.value))
const pilotChecks = computed(() => [
  { label: 'Governance clearance', ready: data.value?.readiness.ready === true, detail: data.value?.readiness.ready ? 'All nine gates are current.' : `${data.value?.readiness.missing.length || 0} gate approvals remain.`, to: '/agency/hr/governance' },
  { label: 'Owner onboarding', ready: (pilot.value?.facts.completedOnboarding || 0) > 0, detail: `${pilot.value?.facts.completedOnboarding || 0} completed owner profile.`, to: '/agency/hr/onboarding' },
  { label: 'Published role', ready: (pilot.value?.facts.publishedRoles || 0) > 0, detail: `${pilot.value?.facts.publishedRoles || 0} published role version.`, to: '/agency/hr/roles' },
  { label: 'Eligible participant', ready: (pilot.value?.facts.eligibleParticipants || 0) > 0, detail: `${pilot.value?.facts.eligibleParticipants || 0} active person linked to a published role.`, to: '/agency/hr/roles' },
  { label: 'Email delivery', ready: pilot.value?.facts.emailConfigured === true, detail: pilot.value?.facts.emailConfigured ? 'Assignment email provider is configured.' : 'Assignment email provider is not configured.', to: '/agency/hr/reviews' },
  { label: 'Clean pilot lane', ready: (pilot.value?.facts.activeCycles || 0) === 0, detail: `${pilot.value?.facts.activeCycles || 0} active review cycle.`, to: '/agency/hr/reviews' },
])

function gateState(key: GateKey) {
  if (data.value?.readiness.expired.includes(key)) return { label: 'Expired', color: 'warning' as const, icon: 'i-lucide-clock-alert' }
  const latest = latestByGate.value[key]
  if (latest?.status === 'approved') return { label: 'Approved', color: 'success' as const, icon: 'i-lucide-shield-check' }
  if (latest?.status === 'rejected') return { label: 'Rejected', color: 'error' as const, icon: 'i-lucide-shield-x' }
  return { label: latest ? 'Pending' : 'Not reviewed', color: 'neutral' as const, icon: 'i-lucide-circle-dashed' }
}
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'No expiry' }
function selectGate(key: GateKey) {
  selectedKey.value = key
  const latest = latestByGate.value[key]
  form.status = latest?.status || 'pending'
  form.evidenceReference = latest?.evidence_reference || ''
  form.limitations = latest?.limitations || ''
  form.expiry = '365'
}
async function refresh() {
  loading.value = true
  try {
    const [governance, pilotReadiness] = await Promise.all([
      apiFetch<ReadinessResponse>('/api/agency/hr/governance/launch-readiness'),
      apiFetch<PilotResponse>('/api/agency/hr/governance/pilot-readiness'),
    ])
    data.value = governance
    pilot.value = pilotReadiness
  }
  catch (error: any) { toast.add({ title: 'Governance register unavailable', description: error?.data?.statusMessage, color: 'error' }) }
  finally { loading.value = false }
}
async function saveAttestation() {
  saving.value = true
  try {
    const expiresAt = form.expiry === 'none' ? undefined : new Date(Date.now() + Number(form.expiry) * 86_400_000).toISOString()
    await apiFetch('/api/agency/hr/governance/launch-attestations', { method: 'POST', body: {
      gateKey: selectedKey.value, status: form.status, evidenceReference: form.evidenceReference,
      limitations: form.limitations || undefined, expiresAt,
    } })
    toast.add({ title: 'Launch attestation recorded', description: 'The prior decision remains in the approval history.', color: 'success' })
    await refresh()
  } catch (error: any) { toast.add({ title: 'Attestation not recorded', description: error?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
onMounted(() => void refresh())
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-3xl border-l-4 border-primary pl-5">
            <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Human clearance ledger</p>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Launch governance</h1>
            <p class="mt-3 text-sm leading-6 text-muted">Questionnaires stay locked until every clearance is supported by evidence, approved by an authorised owner and still current.</p>
          </div>
          <div class="flex flex-wrap gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" /><UBadge :color="data?.readiness.ready ? 'success' : 'warning'" variant="subtle" :label="data?.readiness.ready ? 'Cleared for commissioning' : 'Commissioning locked'" /></div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div v-if="loading" class="flex min-h-64 items-center justify-center" aria-label="Loading governance register"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
      <template v-else-if="data && pilot">
        <section aria-labelledby="pilot-preflight" class="mb-6 overflow-hidden rounded-xl border border-default bg-default">
          <div class="flex flex-col gap-3 border-b border-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Read-only launch check</p><h2 id="pilot-preflight" class="mt-1 text-lg font-semibold text-highlighted">Pilot preflight</h2></div>
            <UBadge :color="pilot.readiness.ready ? 'success' : 'warning'" variant="subtle" :label="pilot.readiness.ready ? 'Ready for owner approval' : `${pilot.readiness.blockers.length} blockers`" />
          </div>
          <div class="max-h-72 overflow-y-auto overscroll-contain divide-y divide-default">
            <div v-for="check in pilotChecks" :key="check.label" class="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div class="flex min-w-0 gap-3"><UIcon :name="check.ready ? 'i-lucide-check-circle-2' : 'i-lucide-circle-alert'" :class="check.ready ? 'text-success' : 'text-warning'" class="mt-0.5 size-5 shrink-0" /><div><h3 class="text-sm font-medium text-highlighted">{{ check.label }}</h3><p class="mt-1 text-sm text-muted">{{ check.detail }}</p></div></div>
              <UButton v-if="!check.ready" color="neutral" variant="outline" size="sm" label="Resolve" :to="check.to" :aria-label="`Resolve ${check.label}`" />
            </div>
          </div>
          <div class="border-t border-default bg-elevated/30 px-5 py-3 text-xs leading-5 text-muted">This preflight creates no employee, questionnaire, notification or calendar record. Monday evidence is optional and remains separately scoped.</div>
        </section>

        <div class="grid min-h-0 gap-6 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.35fr)]">
        <section aria-labelledby="clearance-list" class="overflow-hidden rounded-xl border border-default bg-default">
          <div class="border-b border-default px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">{{ gateDefinitions.length }} required controls</p><h2 id="clearance-list" class="mt-1 text-lg font-semibold text-highlighted">Launch clearance</h2></div>
          <div class="max-h-[68vh] overflow-y-auto overscroll-contain p-2">
            <UButton v-for="gate in gateDefinitions" :key="gate.key" color="neutral" :variant="selectedKey === gate.key ? 'soft' : 'ghost'" class="mb-1 h-auto w-full justify-start px-3 py-3 text-left" @click="selectGate(gate.key)">
              <div class="flex w-full items-start gap-3"><UIcon :name="gateState(gate.key).icon" class="mt-0.5 size-5 shrink-0" /><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center justify-between gap-2"><span class="font-medium text-highlighted">{{ gate.label }}</span><UBadge :color="gateState(gate.key).color" variant="subtle" :label="gateState(gate.key).label" /></div><p class="mt-1 text-xs leading-5 text-muted">{{ gate.detail }}</p></div></div>
            </UButton>
          </div>
        </section>

        <section aria-labelledby="attestation-form" class="min-w-0 rounded-xl border border-default bg-default">
          <div class="border-b border-default px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Append-only decision</p><h2 id="attestation-form" class="mt-1 text-lg font-semibold text-highlighted">{{ selectedDefinition.label }}</h2><p class="mt-2 text-sm leading-6 text-muted">{{ selectedDefinition.detail }}</p></div>
          <form class="space-y-5 p-5" @submit.prevent="saveAttestation">
            <div class="grid gap-4 sm:grid-cols-2"><UFormField label="Decision" name="status" required><USelect v-model="form.status" :items="statusItems" value-key="value" class="w-full" /></UFormField><UFormField label="Expiry" name="expiry" help="A future review is recommended for changing policies and standards."><USelect v-model="form.expiry" :items="expiryItems" value-key="value" class="w-full" /></UFormField></div>
            <UFormField label="Evidence reference" name="evidenceReference" required help="Reference an approved document, test report, consultation record or signed decision. Do not paste private employee content."><UTextarea v-model="form.evidenceReference" :rows="4" class="w-full" placeholder="Example: Accessibility report HR-A11Y-2026-01, reviewed 11 July 2026 by…" /></UFormField>
            <UFormField label="Limitations" name="limitations" help="Record exclusions, unresolved risks or conditions that reviewers must understand."><UTextarea v-model="form.limitations" :rows="3" class="w-full" placeholder="Example: Live file import awaits a non-sensitive fixture; no employee review may rely on that source yet." /></UFormField>
            <UAlert color="neutral" variant="soft" icon="i-lucide-scale" title="Approval is a human decision" description="This record does not let AI approve a gate. A new decision appends to history and never overwrites the prior evidence." />
            <div class="flex justify-end"><UButton type="submit" icon="i-lucide-file-check-2" label="Record attestation" :loading="saving" /></div>
          </form>

          <div class="border-t border-default px-5 py-4"><h3 class="text-sm font-semibold text-highlighted">Approval history</h3></div>
          <div class="max-h-64 overflow-y-auto overscroll-contain border-t border-default">
            <div v-if="!selectedHistory.length" class="p-5 text-sm text-muted">No decision has been recorded for this clearance.</div>
            <article v-for="item in selectedHistory" :key="item.id" class="border-b border-default p-5 last:border-b-0">
              <div class="flex flex-wrap items-center justify-between gap-2"><UBadge :color="gateState(item.gate_key).color" variant="subtle" :label="item.status" /><time class="text-xs text-muted">{{ formatDate(item.created_at) }}</time></div>
              <p class="mt-3 whitespace-pre-wrap text-sm leading-6 text-highlighted">{{ item.evidence_reference }}</p><p v-if="item.limitations" class="mt-2 text-sm leading-6 text-muted">Limitations: {{ item.limitations }}</p><p class="mt-2 text-xs text-muted">Expiry: {{ formatDate(item.expires_at) }}</p>
            </article>
          </div>
        </section>
        </div>
      </template>
    </main>
  </div>
</template>
