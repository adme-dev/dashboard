<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Setup proposals | Page Studio' })

interface SetupProposal {
  id: string
  clientId: string
  siteId: string
  clientName: string
  siteName: string
  revision: number
  source: 'template' | 'chat'
  brief?: string | null
  plan: { pages?: string[], modules?: string[], missingFacts?: string[] }
  status: 'proposed' | 'accepted' | 'rejected'
  createdAt: string
}

const toast = useToast()
const decision = ref<{ siteId: string, revision: number, status: 'accepted' | 'rejected' } | null>(null)
const decisionOpen = computed({
  get: () => Boolean(decision.value),
  set: (open: boolean) => {
    if (!open) decision.value = null
  }
})
const selectedProposal = ref<SetupProposal | null>(null)
const selectedProposalOpen = computed({
  get: () => Boolean(selectedProposal.value),
  set: (open: boolean) => {
    if (!open) selectedProposal.value = null
  }
})
const saving = ref(false)
const { data, pending, error, refresh } = await useFetch<{ proposals: SetupProposal[] }>('/api/agency/page-studio/setup-proposals', { default: () => ({ proposals: [] }) })
const proposals = computed(() => data.value?.proposals ?? [])
const columns = [
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'siteName', header: 'Site' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'revision', header: 'Revision' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'createdAt', header: 'Created' },
  { accessorKey: 'actions', header: 'Actions' }
]

function date(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function applyDecision() {
  if (!decision.value || saving.value) return
  saving.value = true
  try {
    await $fetch(`/api/agency/page-studio/setup-proposals/${encodeURIComponent(decision.value.siteId)}/decision`, {
      method: 'POST', body: { decision: decision.value.status, expectedRevision: decision.value.revision }
    })
    toast.add({ title: `Proposal ${decision.value.status}`, description: 'The proposal status was updated.', color: 'success' })
    decision.value = null
    await refresh()
  } catch (caught: unknown) {
    toast.add({ title: 'Proposal update failed', description: caught instanceof Error ? caught.message : 'The proposal changed or could not be updated.', color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <UDashboardPanel id="page-studio-setup-proposals">
    <template #header>
      <UDashboardNavbar title="Setup proposals" description="Review customer website plans before Cloudflare resources are provisioned.">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Refresh"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="pending"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        title="Unable to load setup proposals"
        description="Refresh or check your Page Studio approval permission."
      />
      <UCard v-else-if="proposals.length" :ui="{ body: '!p-0' }">
        <UTable :data="proposals" :columns="columns">
          <template #createdAt-cell="{ row }">
            {{ date(row.original.createdAt) }}
          </template>
          <template #status-cell="{ row }">
            <UBadge :color="row.original.status === 'accepted' ? 'success' : row.original.status === 'rejected' ? 'warning' : 'info'" variant="subtle">
              {{ row.original.status }}
            </UBadge>
          </template>
          <template #source-cell="{ row }">
            {{ row.original.source === 'chat' ? 'Chat' : 'Template' }}
          </template>
          <template #actions-cell="{ row }">
            <div class="flex gap-2">
              <UButton
                label="View"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="selectedProposal = row.original"
              />
              <template v-if="row.original.status === 'proposed'">
                <UButton
                  label="Accept"
                  size="xs"
                  color="success"
                  variant="soft"
                  @click="decision = { siteId: row.original.siteId, revision: row.original.revision, status: 'accepted' }"
                />
                <UButton
                  label="Reject"
                  size="xs"
                  color="warning"
                  variant="soft"
                  @click="decision = { siteId: row.original.siteId, revision: row.original.revision, status: 'rejected' }"
                />
              </template>
            </div>
          </template>
        </UTable>
      </UCard>
      <UCard v-else>
        <div class="py-12 text-center text-sm text-muted">
          No setup proposals are waiting for review.
        </div>
      </UCard>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="selectedProposalOpen" title="Setup proposal details">
    <template #body>
      <div v-if="selectedProposal" class="space-y-4">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UCard variant="subtle">
            <p class="text-xs text-muted">
              Client
            </p>
            <p class="font-medium">
              {{ selectedProposal.clientName }}
            </p>
          </UCard>
          <UCard variant="subtle">
            <p class="text-xs text-muted">
              Site
            </p>
            <p class="font-medium">
              {{ selectedProposal.siteName }}
            </p>
          </UCard>
        </div>
        <div class="text-sm text-muted">
          Revision {{ selectedProposal.revision }} · {{ selectedProposal.source === 'chat' ? 'Chat' : 'Template' }} · {{ date(selectedProposal.createdAt) }}
        </div>
        <p v-if="selectedProposal.brief" class="whitespace-pre-wrap text-sm">
          {{ selectedProposal.brief }}
        </p>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p class="mb-2 text-xs font-medium text-muted">
              Pages
            </p>
            <ul class="list-disc space-y-1 pl-5 text-sm">
              <li v-for="page in selectedProposal.plan.pages ?? []" :key="page">
                {{ page }}
              </li>
            </ul>
          </div>
          <div>
            <p class="mb-2 text-xs font-medium text-muted">
              Modules
            </p>
            <ul class="list-disc space-y-1 pl-5 text-sm">
              <li v-for="module in selectedProposal.plan.modules ?? []" :key="module">
                {{ module }}
              </li>
            </ul>
          </div>
        </div>
        <UAlert
          v-if="selectedProposal.plan.missingFacts?.length"
          color="warning"
          variant="subtle"
          title="Needs customer confirmation"
          description="These details are intentionally left open until the customer supplies them."
        >
          <template #description>
            <ul class="mt-2 list-disc space-y-1 pl-5">
              <li v-for="fact in selectedProposal.plan.missingFacts" :key="fact">
                {{ fact }}
              </li>
            </ul>
          </template>
        </UAlert>
        <p v-else class="text-sm text-muted">
          No missing facts detected.
        </p>
      </div>
    </template>
  </UModal>

  <UModal v-model:open="decisionOpen" title="Confirm setup proposal decision">
    <template #body>
      <p class="text-sm text-muted">
        {{ decision?.status === 'accepted' ? 'Accepting allows the approved provisioning job to start.' : 'Rejecting keeps the proposal from being provisioned.' }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-3">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="decision = null"
        /><UButton
          :label="decision?.status === 'accepted' ? 'Accept proposal' : 'Reject proposal'"
          :color="decision?.status === 'accepted' ? 'success' : 'warning'"
          :loading="saving"
          @click="applyDecision"
        />
      </div>
    </template>
  </UModal>
</template>
