<script setup lang="ts">
definePageMeta({ title: 'HR Contract Vault', middleware: ['auth'] })

type RosterMember = {
  id: string
  name: string
  email: string
  current_role: string | null
  department: string | null
  latest_contract_id: string | null
  contract_status: string | null
  contract_version: number | null
  extract_status: string | null
}
type ContractDocument = {
  id: string
  team_member_id: string
  member_name: string
  version: number
  file_name: string
  content_type: string
  size_bytes: number | string
  status: string
  retention_review_at: string
  created_at: string
  extract_id: string | null
  role_title: string | null
  department: string | null
  employment_basis: string | null
  ordinary_hours: string | null
  reporting_to: string | null
  role_purpose: string | null
  responsibilities: string[] | null
  expected_outcomes: string[] | null
  decision_authority: string[] | null
  role_exclusions: string[] | null
  extract_status: string | null
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const roster = ref<RosterMember[]>([])
const documents = ref<ContractDocument[]>([])
const selectedMemberId = ref('')
const selectedFile = ref<File | null>(null)
const selectedDocument = ref<ContractDocument | null>(null)
const showExtract = ref(false)

const extractForm = reactive({
  roleTitle: '', department: '', employmentBasis: '', ordinaryHours: '', reportingTo: '',
  rolePurpose: '', responsibilities: '', expectedOutcomes: '', decisionAuthority: '', roleExclusions: '',
})

const memberItems = computed(() => roster.value.map(member => ({ label: `${member.name} — ${member.current_role || member.email}`, value: member.id })))
const coverage = computed(() => ({
  uploaded: roster.value.filter(member => member.latest_contract_id).length,
  approved: roster.value.filter(member => member.extract_status === 'approved').length,
  total: roster.value.length,
}))

function splitLines(value: string) { return value.split('\n').map(item => item.trim()).filter(Boolean) }
function joinLines(value: string[] | null) { return (value || []).join('\n') }
function formatBytes(value: number | string) { const bytes = Number(value); return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }

async function refresh() {
  loading.value = true
  try {
    const data = await apiFetch<{ roster: RosterMember[]; documents: ContractDocument[] }>('/api/agency/hr/contracts')
    roster.value = data.roster
    documents.value = data.documents
  } catch (error: any) {
    toast.add({ title: 'Contract vault unavailable', description: error?.data?.statusMessage, color: 'error' })
  } finally { loading.value = false }
}
onMounted(() => void refresh())

function onFileChange(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0] || null
}

async function uploadContract() {
  if (!selectedMemberId.value || !selectedFile.value) {
    toast.add({ title: 'Choose a team member and contract file', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const body = new FormData()
    body.append('teamMemberId', selectedMemberId.value)
    body.append('file', selectedFile.value)
    await apiFetch('/api/agency/hr/contracts', { method: 'POST', body })
    toast.add({ title: 'Contract secured in the HR vault', description: 'Review and approve the role-only extract before using it in a profile.', color: 'success' })
    selectedFile.value = null
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Contract upload failed', description: error?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

function reviewDocument(document: ContractDocument) {
  selectedDocument.value = document
  const member = roster.value.find(item => item.id === document.team_member_id)
  Object.assign(extractForm, {
    roleTitle: document.role_title || member?.current_role || '',
    department: document.department || member?.department || '',
    employmentBasis: document.employment_basis || '',
    ordinaryHours: document.ordinary_hours || '',
    reportingTo: document.reporting_to || '',
    rolePurpose: document.role_purpose || '',
    responsibilities: joinLines(document.responsibilities),
    expectedOutcomes: joinLines(document.expected_outcomes),
    decisionAuthority: joinLines(document.decision_authority),
    roleExclusions: joinLines(document.role_exclusions),
  })
  showExtract.value = true
}

function reviewLatest(member: RosterMember) {
  const document = documents.value.find(item => item.id === member.latest_contract_id)
  if (document) reviewDocument(document)
}

async function saveExtract(status: 'draft' | 'approved') {
  if (!selectedDocument.value) return
  saving.value = true
  try {
    await apiFetch(`/api/agency/hr/contracts/${selectedDocument.value.id}/extract`, {
      method: 'PUT',
      body: {
        roleTitle: extractForm.roleTitle,
        department: extractForm.department || undefined,
        employmentBasis: extractForm.employmentBasis || undefined,
        ordinaryHours: extractForm.ordinaryHours || undefined,
        reportingTo: extractForm.reportingTo || undefined,
        rolePurpose: extractForm.rolePurpose,
        responsibilities: splitLines(extractForm.responsibilities),
        expectedOutcomes: splitLines(extractForm.expectedOutcomes),
        decisionAuthority: splitLines(extractForm.decisionAuthority),
        roleExclusions: splitLines(extractForm.roleExclusions),
        extractionMethod: 'owner_reviewed',
        status,
      },
    })
    toast.add({ title: status === 'approved' ? 'Role extract approved' : 'Role extract draft saved', description: status === 'approved' ? 'This role-only knowledge can now seed a governed role profile.' : 'The original contract remains owner-only.', color: 'success' })
    showExtract.value = false
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Role extract could not be saved', description: error?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30"><div class="mx-auto max-w-7xl px-5 py-8 sm:px-8"><div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div class="max-w-3xl border-l-4 border-primary pl-5"><p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Restricted source register</p><h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Employment contract vault</h1><p class="mt-3 text-sm leading-6 text-muted">Original contracts are owner-only and excluded from general AI search. Only an approved role-only extract can govern responsibilities, questionnaires or scorecards.</p></div><div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" /><UButton color="neutral" variant="outline" icon="i-lucide-badge-check" label="Role library" to="/agency/hr/roles" /></div></div></div></header>

    <main class="mx-auto max-w-7xl space-y-7 px-5 py-8 sm:px-8">
      <div class="grid overflow-hidden rounded-xl border border-default sm:grid-cols-3"><div class="bg-default p-5"><p class="text-xs uppercase tracking-wide text-muted">Active team members</p><p class="mt-2 font-mono text-3xl font-semibold text-highlighted">{{ coverage.total }}</p></div><div class="border-t border-default bg-default p-5 sm:border-l sm:border-t-0"><p class="text-xs uppercase tracking-wide text-muted">Contract on file</p><p class="mt-2 font-mono text-3xl font-semibold text-highlighted">{{ coverage.uploaded }}</p></div><div class="border-t border-default bg-default p-5 sm:border-l sm:border-t-0"><p class="text-xs uppercase tracking-wide text-muted">Role extract approved</p><p class="mt-2 font-mono text-3xl font-semibold text-success">{{ coverage.approved }}</p></div></div>

      <section class="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div class="rounded-xl border border-default bg-default p-5"><div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><UIcon name="i-lucide-file-up" class="size-5" /></div><h2 class="mt-4 text-lg font-semibold text-highlighted">Upload a contract version</h2><p class="mt-1 text-sm leading-6 text-muted">PDF, DOC or DOCX · 15 MB maximum · duplicate files blocked by checksum.</p><div class="mt-5 space-y-4"><UFormField label="Team member" required><USelectMenu v-model="selectedMemberId" :items="memberItems" value-key="value" searchable class="w-full" /></UFormField><UFormField label="Employment document" required><UInput type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" class="w-full" @change="onFileChange" /></UFormField><UButton block icon="i-lucide-shield-check" label="Secure in HR vault" :loading="saving" @click="uploadContract" /></div></div>
        <UAlert color="warning" variant="soft" icon="i-lucide-eye-off" title="Sensitive clauses do not become review knowledge" description="Remuneration, banking, tax, health, leave history, protected attributes and signatures remain in the owner-only original. They are explicitly omitted from the role extract." />
      </section>

      <section><div class="mb-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Coverage register</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Team contract status</h2></div><div v-if="loading" class="flex min-h-52 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div><div v-else class="overflow-hidden rounded-xl border border-default"><div v-for="member in roster" :key="member.id" class="flex flex-col gap-4 border-b border-default bg-default p-4 last:border-b-0 sm:flex-row sm:items-center"><div class="flex min-w-0 flex-1 items-center gap-3"><UAvatar :alt="member.name" size="sm" /><div class="min-w-0"><p class="truncate text-sm font-medium text-highlighted">{{ member.name }}</p><p class="truncate text-xs text-muted">{{ member.current_role || 'Role not recorded' }}<template v-if="member.department"> · {{ member.department }}</template></p></div></div><div class="flex flex-wrap items-center gap-2"><UBadge :color="member.latest_contract_id ? 'success' : 'warning'" variant="subtle" :label="member.latest_contract_id ? `Contract v${member.contract_version}` : 'Missing contract'" /><UBadge v-if="member.latest_contract_id" :color="member.extract_status === 'approved' ? 'success' : 'warning'" variant="outline" :label="member.extract_status === 'approved' ? 'Role extract approved' : 'Extract review required'" /><UButton v-if="member.latest_contract_id" color="neutral" variant="outline" size="sm" label="Review extract" @click="reviewLatest(member)" /></div></div></div></section>
    </main>

    <USlideover v-model:open="showExtract" title="Review role-only contract extract" description="Approve only facts that are relevant to role governance.">
      <template #body><div v-if="selectedDocument" class="space-y-5"><div class="flex items-center justify-between rounded-lg border border-default bg-elevated/30 p-4"><div><p class="text-sm font-medium text-highlighted">{{ selectedDocument.member_name }} · contract v{{ selectedDocument.version }}</p><p class="mt-1 text-xs text-muted">{{ selectedDocument.file_name }} · {{ formatBytes(selectedDocument.size_bytes) }}</p></div><UButton color="neutral" variant="outline" size="sm" icon="i-lucide-download" label="Open original" :to="`/api/agency/hr/contracts/${selectedDocument.id}/download`" external /></div><UFormField label="Contract role title" required><UInput v-model="extractForm.roleTitle" class="w-full" /></UFormField><UFormField label="Department"><UInput v-model="extractForm.department" class="w-full" /></UFormField><div class="grid gap-4 sm:grid-cols-2"><UFormField label="Employment basis"><UInput v-model="extractForm.employmentBasis" placeholder="Full-time, part-time…" class="w-full" /></UFormField><UFormField label="Ordinary hours"><UInput v-model="extractForm.ordinaryHours" placeholder="As stated in contract" class="w-full" /></UFormField></div><UFormField label="Reports to"><UInput v-model="extractForm.reportingTo" class="w-full" /></UFormField><UFormField label="Role purpose" required><UTextarea v-model="extractForm.rolePurpose" :rows="4" class="w-full" /></UFormField><UFormField label="Contractual responsibilities" required help="One role responsibility per line."><UTextarea v-model="extractForm.responsibilities" :rows="7" class="w-full" /></UFormField><UFormField label="Expected outcomes" help="Only include outcomes stated or directly supported by the contract/position description."><UTextarea v-model="extractForm.expectedOutcomes" :rows="5" class="w-full" /></UFormField><UFormField label="Decision authority"><UTextarea v-model="extractForm.decisionAuthority" :rows="4" class="w-full" /></UFormField><UFormField label="Explicit role exclusions"><UTextarea v-model="extractForm.roleExclusions" :rows="4" class="w-full" /></UFormField><UAlert color="neutral" variant="soft" icon="i-lucide-lock" title="Owner approval required" description="Approval makes this structured extract available to the role library. It never publishes or exposes the original document." /></div></template>
      <template #footer><div class="flex w-full justify-end gap-2"><UButton color="neutral" variant="outline" label="Save draft" :loading="saving" @click="saveExtract('draft')" /><UButton icon="i-lucide-shield-check" label="Approve role extract" :loading="saving" @click="saveExtract('approved')" /></div></template>
    </USlideover>
  </div>
</template>
