<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Setup status | Page Studio' })

interface ProvisioningStatus {
  proposal: { revision: number, status: string, source: 'template' | 'chat' }
  requestKey: string
  provisioning: { phase?: string, attempts?: number, error?: string | null } | null
  serviceAvailable: boolean
}

interface SetupProposal {
  revision: number
  status: 'proposed' | 'accepted' | 'rejected'
  source: 'template' | 'chat'
  brief?: string | null
  plan?: { missingFacts?: string[] }
}

const route = useRoute()
const toast = useToast()
const siteId = computed(() => String(route.params.siteId || ''))
const retrying = ref(false)
const revising = ref(false)
const revisionBrief = ref('')
const { data, pending, error, refresh } = await useFetch<ProvisioningStatus>(
  () => `/api/portal/page-studio/sites/${encodeURIComponent(siteId.value)}/provision`,
  { watch: [siteId] }
)
const { data: proposalData, refresh: refreshProposal } = await useFetch<{ proposal: SetupProposal }>(
  () => `/api/portal/page-studio/sites/${encodeURIComponent(siteId.value)}/setup-proposal`,
  { watch: [siteId] }
)

const phaseLabel = computed(() => {
  const phase = data.value?.provisioning?.phase || (data.value?.proposal.status === 'accepted' ? 'requested' : data.value?.proposal.status)
  return phase ? phase.replaceAll('-', ' ').replace(/\b\w/g, character => character.toUpperCase()) : 'Waiting'
})

const phaseColor = computed((): 'success' | 'warning' | 'info' | 'neutral' => {
  if (data.value?.provisioning?.phase === 'completed') return 'success'
  if (data.value?.provisioning?.phase === 'failed') return 'warning'
  if (data.value?.proposal.status !== 'accepted') return 'neutral'
  return 'info'
})

async function retryProvisioning() {
  if (!data.value || retrying.value || data.value.proposal.status !== 'accepted') return
  retrying.value = true
  try {
    await $fetch(`/api/portal/page-studio/sites/${encodeURIComponent(siteId.value)}/provision`, {
      method: 'POST',
      body: { expectedRevision: data.value.proposal.revision }
    })
    toast.add({ title: 'Setup resumed', description: 'The provisioning service accepted the request.', color: 'success' })
    await refresh()
  } catch (caught: unknown) {
    const message = caught && typeof caught === 'object' && 'data' in caught && caught.data && typeof caught.data === 'object' && 'statusMessage' in caught.data
      ? String(caught.data.statusMessage)
      : 'The setup could not be resumed.'
    toast.add({ title: 'Setup could not resume', description: message, color: 'error' })
  } finally {
    retrying.value = false
  }
}

async function reviseProposal() {
  if (!proposalData.value?.proposal || revising.value || !revisionBrief.value.trim()) return
  revising.value = true
  try {
    await $fetch(`/api/portal/page-studio/sites/${encodeURIComponent(siteId.value)}/setup-proposal`, {
      method: 'PATCH',
      body: { expectedRevision: proposalData.value.proposal.revision, setupBrief: revisionBrief.value.trim() }
    })
    revisionBrief.value = ''
    toast.add({ title: 'Details submitted', description: 'A new proposal revision is ready for agency review.', color: 'success' })
    await Promise.all([refresh(), refreshProposal()])
  } catch (caught: unknown) {
    const message = caught && typeof caught === 'object' && 'data' in caught && caught.data && typeof caught.data === 'object' && 'statusMessage' in caught.data
      ? String(caught.data.statusMessage)
      : 'The additional details could not be submitted.'
    toast.add({ title: 'Details not submitted', description: message, color: 'error' })
  } finally {
    revising.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Page Studio setup
        </p>
        <h1 class="mt-2 text-2xl font-semibold text-highlighted">
          Website setup status
        </h1>
        <p class="mt-2 text-sm leading-6 text-muted">
          Track proposal review and resource provisioning for this website.
        </p>
      </div>
      <UButton
        label="Back to websites"
        to="/portal/page-studio"
        color="neutral"
        variant="outline"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Setup status unavailable"
      description="Refresh the page or contact your agency team."
    />

    <template v-else-if="pending && !data">
      <UCard><USkeleton class="h-6 w-1/3" /><USkeleton class="mt-4 h-4 w-2/3" /></UCard>
    </template>

    <template v-else-if="data">
      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p class="text-sm text-muted">
              Proposal revision {{ data.proposal.revision }} · {{ data.proposal.source === 'chat' ? 'Chat setup' : 'Template setup' }}
            </p>
            <p class="mt-2 text-lg font-semibold text-highlighted">
              {{ phaseLabel }}
            </p>
          </div>
          <UBadge :color="phaseColor" variant="subtle" size="lg">
            {{ phaseLabel }}
          </UBadge>
        </div>
        <UProgress v-if="data.provisioning && data.provisioning.phase !== 'failed'" class="mt-6" :value="data.provisioning.phase === 'completed' ? 100 : 60" />
        <p v-if="data.provisioning?.error" class="mt-4 text-sm text-warning">
          {{ data.provisioning.error }}
        </p>
      </UCard>

      <UAlert
        v-if="!data.serviceAvailable"
        color="info"
        variant="subtle"
        icon="i-lucide-cloud-off"
        title="Provisioning service is not connected"
        description="Your proposal is retained safely. The agency must connect the isolated Cloudflare provisioning service before resources can be created."
      />
      <UAlert
        v-else-if="data.proposal.status !== 'accepted'"
        color="warning"
        variant="subtle"
        icon="i-lucide-clock-3"
        title="Waiting for agency review"
        description="Resources are not created until the setup proposal is accepted."
      />

      <UCard v-if="proposalData?.proposal && proposalData.proposal.status === 'proposed'">
        <div class="space-y-4">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              Complete your setup details
            </h2>
            <p class="mt-1 text-sm leading-6 text-muted">
              Answer any open questions below. Your agency will review the updated proposal before provisioning starts.
            </p>
          </div>
          <UAlert
            v-if="proposalData.proposal.plan?.missingFacts?.length"
            color="warning"
            variant="subtle"
            title="Still needed"
          >
            <template #description>
              <ul class="mt-2 list-disc space-y-1 pl-5">
                <li v-for="fact in proposalData.proposal.plan.missingFacts" :key="fact">
                  {{ fact }}
                </li>
              </ul>
            </template>
          </UAlert>
          <UFormField label="Additional business details" help="Include confirmed prices, hours, locations, policies, contact details, or other facts. The system will not invent them.">
            <UTextarea
              v-model="revisionBrief"
              class="w-full"
              :rows="5"
              placeholder="For example: bookings are available 7 days a week; airport transfers start at $220; call 03 9000 0000."
            />
          </UFormField>
          <div class="flex justify-end">
            <UButton
              label="Submit details for review"
              color="primary"
              :loading="revising"
              :disabled="!revisionBrief.trim()"
              @click="reviseProposal"
            />
          </div>
        </div>
      </UCard>

      <div class="flex justify-end gap-3">
        <UButton
          label="Refresh"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="pending"
          @click="refresh"
        />
        <UButton
          v-if="data.serviceAvailable && data.proposal.status === 'accepted'"
          label="Resume setup"
          icon="i-lucide-play"
          color="primary"
          :loading="retrying"
          @click="retryProvisioning"
        />
      </div>
    </template>
  </div>
</template>
