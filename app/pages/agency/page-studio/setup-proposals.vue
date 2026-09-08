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
            <div v-if="row.original.status === 'proposed'" class="flex gap-2">
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
