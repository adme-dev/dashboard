<script setup lang="ts">
definePageMeta({
  title: 'Monday Cutover Governance',
  layout: 'agency',
  middleware: ['role-admin']
})

type ClientResolution = {
  sourceId: string
  clientId: string
  reason: string
}

type ColumnResolution = {
  sourceColumnId: string
  decision: 'import' | 'exclude'
  reason: string
}

type CutoverArtifact = {
  id: string
  revision: number
  state: 'draft' | 'approved'
  resolutions: {
    clients: ClientResolution[]
    columns: ColumnResolution[]
  }
  approvalReason: string | null
  approvedAt: string | null
  updatedAt: string
}

type ClientLink = {
  status: 'exact' | 'resolved' | 'suggested' | 'missing' | 'not_applicable'
  clientId: string | null
  clientName: string | null
  candidates: Array<{ clientId: string, clientName: string, score: number }>
}

type CutoverRecord = {
  sourceId: string
  parentSourceId: string | null
  title: string
  clientLink: ClientLink
}

type ColumnMapping = {
  sourceColumnId: string
  sourceTitle: string
  destination: string
  populatedRecords: number
  resolutionStatus: 'not_required' | 'pending' | 'applied'
  resolutionDecision: 'import' | 'exclude' | null
}

type CutoverResponse = {
  artifact: CutoverArtifact | null
  plan: {
    source: { boardId: string, boardName: string, totalRecords: number, isTruncated: boolean }
    target: { boardId: string, boardName: string, totalRecords: number, isTruncated: boolean }
    records: CutoverRecord[]
    columnMappings: ColumnMapping[]
    summary: {
      sourceRecords: number
      targetRecords: number
      toCreate: number
      targetOnly: number
      blockingExceptions: number
      warningExceptions: number
      isReadyForImport: boolean
    }
  }
  evidence: {
    currentPlanFingerprint: string
    isCurrent: boolean
    canApprove: boolean
  }
}

type ClientOption = { id: string, name: string }

const PILOT_SOURCE_BOARD_ID = '18422459929'
const PILOT_TARGET_BOARD_ID = '86054ef6-6454-46fb-9002-1ba4d8d060b8'
const route = useRoute()
const toast = useToast()
const sourceBoardId = computed(() => String(route.query.sourceBoardId || PILOT_SOURCE_BOARD_ID))
const targetBoardId = computed(() => String(route.query.targetBoardId || PILOT_TARGET_BOARD_ID))
const endpoint = computed(() => `/api/agency/monday/boards/${sourceBoardId.value}/cutover-approval`)

const response = ref<CutoverResponse | null>(null)
const clients = ref<ClientOption[]>([])
const loading = ref(false)
const saving = ref(false)
const approving = ref(false)
const loadError = ref('')
const approvalReason = ref('')
const selectedClients = ref<Record<string, string>>({})
const clientReasons = ref<Record<string, string>>({})
const columnDecisions = ref<Record<string, 'import' | 'exclude' | undefined>>({})
const columnReasons = ref<Record<string, string>>({})

const isApproved = computed(() => response.value?.artifact?.state === 'approved')
const clientReviewRecords = computed(() => (response.value?.plan.records ?? []).filter(record => (
  !record.parentSourceId
  && record.clientLink.status !== 'exact'
  && record.clientLink.status !== 'not_applicable'
)))
const reviewColumns = computed(() => (response.value?.plan.columnMappings ?? []).filter(column => (
  column.resolutionStatus !== 'not_required'
)))

const decisionItems = [
  { label: 'Import through governed mapping', value: 'import' },
  { label: 'Exclude from cutover', value: 'exclude' }
]

function resetDraftState(artifact: CutoverArtifact | null) {
  selectedClients.value = {}
  clientReasons.value = {}
  columnDecisions.value = {}
  columnReasons.value = {}

  for (const resolution of artifact?.resolutions.clients ?? []) {
    selectedClients.value[resolution.sourceId] = resolution.clientId
    clientReasons.value[resolution.sourceId] = resolution.reason
  }
  for (const resolution of artifact?.resolutions.columns ?? []) {
    columnDecisions.value[resolution.sourceColumnId] = resolution.decision
    columnReasons.value[resolution.sourceColumnId] = resolution.reason
  }
  approvalReason.value = artifact?.approvalReason ?? ''
}

function clientItems(record: CutoverRecord) {
  const suggestions = new Set(record.clientLink.candidates.map(candidate => candidate.clientId))
  return [...clients.value]
    .sort((left, right) => {
      const suggestionOrder = Number(suggestions.has(right.id)) - Number(suggestions.has(left.id))
      return suggestionOrder || left.name.localeCompare(right.name)
    })
    .map(client => ({
      label: suggestions.has(client.id) ? `${client.name} · suggested` : client.name,
      value: client.id
    }))
}

function errorMessage(error: unknown, fallback: string) {
  const value = error as { data?: { statusMessage?: string }, statusMessage?: string }
  return value.data?.statusMessage || value.statusMessage || fallback
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [cutover, clientRows] = await Promise.all([
      $fetch<CutoverResponse>(endpoint.value, {
        query: { targetBoardId: targetBoardId.value }
      }),
      $fetch<ClientOption[]>('/api/agency/clients')
    ])
    response.value = cutover
    clients.value = Array.isArray(clientRows) ? clientRows.map(client => ({ id: client.id, name: client.name })) : []
    resetDraftState(cutover.artifact)
  } catch (error: unknown) {
    loadError.value = errorMessage(error, 'Cutover evidence could not be loaded.')
  } finally {
    loading.value = false
  }
}

function buildResolutions() {
  const clientResolutions: ClientResolution[] = []
  for (const record of clientReviewRecords.value) {
    const clientId = selectedClients.value[record.sourceId]
    if (!clientId) continue
    const reason = (clientReasons.value[record.sourceId] || '').trim()
    if (reason.length < 10) {
      throw new Error(`Add a review reason for ${record.title}.`)
    }
    clientResolutions.push({ sourceId: record.sourceId, clientId, reason })
  }

  const columnResolutions: ColumnResolution[] = []
  for (const column of reviewColumns.value) {
    const decision = columnDecisions.value[column.sourceColumnId]
    if (!decision) continue
    const reason = (columnReasons.value[column.sourceColumnId] || '').trim()
    if (reason.length < 10) {
      throw new Error(`Add a review reason for ${column.sourceTitle}.`)
    }
    columnResolutions.push({ sourceColumnId: column.sourceColumnId, decision, reason })
  }

  return { clients: clientResolutions, columns: columnResolutions }
}

async function saveDraft() {
  if (!response.value || isApproved.value) return
  saving.value = true
  try {
    const result = await $fetch<CutoverResponse>(endpoint.value, {
      method: 'PUT',
      body: {
        targetBoardId: targetBoardId.value,
        expectedRevision: response.value.artifact?.revision ?? null,
        resolutions: buildResolutions()
      }
    })
    response.value = result
    resetDraftState(result.artifact)
    toast.add({ title: `Draft revision ${result.artifact?.revision} saved`, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Draft not saved', description: errorMessage(error, 'Review the mapping decisions and retry.'), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function approveEvidence() {
  const artifact = response.value?.artifact
  if (!artifact || !response.value?.evidence.canApprove || isApproved.value) return
  const reason = approvalReason.value.trim()
  if (reason.length < 10) {
    toast.add({ title: 'Approval reason required', description: 'Enter at least 10 characters.', color: 'warning' })
    return
  }

  approving.value = true
  try {
    const result = await $fetch<CutoverResponse>(`${endpoint.value}/approve`, {
      method: 'POST',
      body: {
        targetBoardId: targetBoardId.value,
        expectedRevision: artifact.revision,
        reason
      }
    })
    response.value = result
    resetDraftState(result.artifact)
    toast.add({ title: 'Mapping evidence approved', description: 'No import was executed.', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Evidence not approved', description: errorMessage(error, 'Refresh the dry-run evidence and retry.'), color: 'error' })
  } finally {
    approving.value = false
  }
}

watch([sourceBoardId, targetBoardId], load, { immediate: true })
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-primary-600">
          Cutover governance
        </p>
        <h1 class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
          Monday → Zero mapping evidence
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Review client links and column handling against the current production dry-run. Saving or approving this evidence does not write to Monday, create Zero tasks, or start a migration.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="loading"
        @click="load"
      >
        Refresh evidence
      </UButton>
    </div>

    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      title="No import is executed"
      description="Approval only freezes the reviewed mapping evidence. Cutover remains a separate, explicitly governed action."
    />

    <UCard v-if="loading && !response">
      <div class="flex items-center justify-center gap-3 py-12 text-gray-500">
        <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" />
        Loading the exact source and target inventories…
      </div>
    </UCard>

    <UAlert
      v-else-if="loadError"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Evidence unavailable"
      :description="loadError"
    />

    <template v-else-if="response">
      <UCard>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div class="lg:col-span-2">
            <p class="text-xs text-gray-500">
              Exact board pair
            </p>
            <p class="mt-1 font-medium">
              {{ response.plan.source.boardName }}
            </p>
            <p class="mt-1 break-all text-xs text-gray-500">
              {{ response.plan.source.boardId }} → {{ response.plan.target.boardId }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-500">
              Source records
            </p>
            <p class="mt-1 text-2xl font-semibold">
              {{ response.plan.summary.sourceRecords }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-500">
              Blocking decisions
            </p>
            <p class="mt-1 text-2xl font-semibold" :class="response.plan.summary.blockingExceptions ? 'text-amber-600' : 'text-green-600'">
              {{ response.plan.summary.blockingExceptions }}
            </p>
          </div>
          <div>
            <p class="text-xs text-gray-500">
              Artifact
            </p>
            <div class="mt-2 flex items-center gap-2">
              <UBadge :color="isApproved ? 'success' : response.artifact ? 'warning' : 'neutral'" variant="subtle">
                {{ isApproved ? 'Approved' : response.artifact ? `Draft r${response.artifact.revision}` : 'Not saved' }}
              </UBadge>
              <UBadge v-if="response.artifact && !response.evidence.isCurrent" color="error" variant="subtle">
                Stale
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div>
            <h2 class="font-semibold">
              Client links
            </h2>
            <p class="mt-1 text-sm text-gray-500">
              Fuse suggestions are hints only. Every non-exact link requires an explicit Zero client and rationale.
            </p>
          </div>
        </template>
        <div v-if="clientReviewRecords.length" class="divide-y divide-gray-200 dark:divide-gray-800">
          <div v-for="record in clientReviewRecords" :key="record.sourceId" class="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p class="font-medium">
                {{ record.title }}
              </p>
              <p class="mt-1 text-xs text-gray-500">
                Monday item {{ record.sourceId }} · {{ record.clientLink.status }}
              </p>
            </div>
            <USelectMenu
              v-model="selectedClients[record.sourceId]"
              :items="clientItems(record)"
              value-key="value"
              placeholder="Select canonical Zero client"
              :disabled="isApproved"
            />
            <UInput
              v-model="clientReasons[record.sourceId]"
              placeholder="Why is this the correct client?"
              :disabled="isApproved"
            />
          </div>
        </div>
        <p v-else class="text-sm text-green-600">
          All client links are exact or not applicable.
        </p>
      </UCard>

      <UCard>
        <template #header>
          <div>
            <h2 class="font-semibold">
              Column decisions
            </h2>
            <p class="mt-1 text-sm text-gray-500">
              Choose import or exclusion for each review column. Populated exclusions remain visible as warnings.
            </p>
          </div>
        </template>
        <div class="divide-y divide-gray-200 dark:divide-gray-800">
          <div v-for="column in reviewColumns" :key="column.sourceColumnId" class="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p class="font-medium">
                {{ column.sourceTitle }}
              </p>
              <p class="mt-1 text-xs text-gray-500">
                {{ column.destination }} · {{ column.populatedRecords }} populated records
              </p>
            </div>
            <USelect
              v-model="columnDecisions[column.sourceColumnId]"
              :items="decisionItems"
              value-key="value"
              placeholder="Select decision"
              :disabled="isApproved"
            />
            <UInput
              v-model="columnReasons[column.sourceColumnId]"
              placeholder="Document the review rationale"
              :disabled="isApproved"
            />
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="max-w-2xl flex-1">
            <UFormField label="Approval reason" help="Required only when the current draft has no blocking exceptions.">
              <UTextarea
                v-model="approvalReason"
                :rows="3"
                placeholder="Confirm what was reviewed and why this mapping evidence is safe to freeze."
                :disabled="isApproved"
              />
            </UFormField>
          </div>
          <div class="flex flex-wrap gap-3">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-save"
              :loading="saving"
              :disabled="isApproved"
              @click="saveDraft"
            >
              Save draft
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-badge-check"
              :loading="approving"
              :disabled="isApproved || !response.evidence.canApprove"
              @click="approveEvidence"
            >
              Approve mapping evidence
            </UButton>
          </div>
        </div>
        <p v-if="!isApproved && !response.evidence.canApprove" class="mt-3 text-sm text-amber-600">
          Approval stays disabled until a freshly saved draft has zero blocking exceptions.
        </p>
        <p v-if="isApproved" class="mt-3 text-sm text-green-600">
          Approved evidence is immutable. No import was executed.
        </p>
      </UCard>
    </template>
  </div>
</template>
