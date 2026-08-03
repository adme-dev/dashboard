<script setup lang="ts">
interface OutcomeResponse {
  totals: {
    measuredViews: number
    measuredCtaHandoffs: number
    directLeads: number
    assistedLeads: number
  }
  unlinkedLeads: number
  ga4: { available: boolean, sessions: number | null, dataThroughDate: string | null }
  firstParty: { available: boolean }
  limitations: string[]
  publications: Array<{
    id: string
    title: string
    publicUrl: string
    measuredViews: number
    measuredCtaHandoffs: number
    directLeads: number
    assistedLeads: number
  }>
  pmaxSuggestion: null | {
    reviewState: 'review_required'
    mutationPerformed: false
    taskPayload: Record<string, unknown>
  }
}

const props = defineProps<{
  clientId: string | null
  startDate: string
  endDate: string
}>()
const toast = useToast()
const loading = ref(false)
const data = ref<OutcomeResponse | null>(null)

async function load() {
  if (!props.clientId || !props.startDate || !props.endDate) {
    data.value = null
    return
  }
  loading.value = true
  try {
    const query = new URLSearchParams({
      clientId: props.clientId,
      startDate: props.startDate,
      endDate: props.endDate
    })
    data.value = await $fetch<OutcomeResponse>(
      `/api/agency/search-authority/reporting/overview?${query}`
    )
  } catch (error: unknown) {
    const candidate = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Outcome reporting unavailable',
      description: candidate?.data?.statusMessage || candidate?.message,
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

async function copyPmaxBrief() {
  if (!data.value?.pmaxSuggestion) return
  await navigator.clipboard.writeText(JSON.stringify(data.value.pmaxSuggestion.taskPayload, null, 2))
  toast.add({ title: 'Review brief copied', description: 'A media buyer must review it before any paid-media change.', color: 'success' })
}

watch(
  [() => props.clientId, () => props.startDate, () => props.endDate],
  () => void load(),
  { immediate: true }
)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Published guide outcomes
          </h2>
          <p class="mt-1 text-sm text-muted">
            First-party events and explicit UTM linkage, kept separate from aggregate provider evidence.
          </p>
        </div>
        <UBadge label="Evidence-labelled" color="neutral" variant="subtle" />
      </div>
    </template>

    <div v-if="loading" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <USkeleton v-for="index in 4" :key="index" class="h-24 w-full" />
    </div>
    <div v-else-if="data" class="space-y-5">
      <div class="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-elevated lg:grid-cols-4">
        <div class="bg-default p-4">
          <p class="text-xs text-muted">
            Measured guide views
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted">
            {{ data.firstParty.available ? data.totals.measuredViews : 'Unavailable' }}
          </p>
        </div>
        <div class="bg-default p-4">
          <p class="text-xs text-muted">
            CTA handoffs
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted">
            {{ data.firstParty.available ? data.totals.measuredCtaHandoffs : 'Unavailable' }}
          </p>
        </div>
        <div class="bg-default p-4">
          <p class="text-xs text-muted">
            Directly attributed leads
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted">
            {{ data.totals.directLeads }}
          </p>
        </div>
        <div class="bg-default p-4">
          <p class="text-xs text-muted">
            Assisted leads
          </p>
          <p class="mt-1 text-2xl font-semibold text-highlighted">
            {{ data.totals.assistedLeads }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UAlert
          :title="data.ga4.available ? `${data.ga4.sessions || 0} aggregate GA4 sessions` : 'GA4 landing-page evidence: Unavailable'"
          :description="data.ga4.available ? `Data through ${data.ga4.dataThroughDate}.` : 'No matching GA4 landing-page rows exist in this window; zero is not assumed.'"
          :color="data.ga4.available ? 'info' : 'neutral'"
          variant="subtle"
        />
        <UAlert
          :title="`${data.unlinkedLeads} leads with unknown publication linkage`"
          description="Unknown remains unknown. Timing and query similarity are not used to assign a person to a guide."
          color="neutral"
          variant="subtle"
        />
      </div>

      <div v-if="data.pmaxSuggestion" class="rounded-lg border border-default p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-sm font-medium text-highlighted">
              Review-only PMax brief
            </h3>
            <p class="mt-1 text-xs text-muted">
              Copies evidence into the normal review workflow. No Google Ads mutation has occurred.
            </p>
          </div>
          <UButton
            label="Copy review brief"
            icon="i-lucide-copy"
            color="neutral"
            variant="soft"
            @click="copyPmaxBrief"
          />
        </div>
      </div>

      <p v-for="limitation in data.limitations" :key="limitation" class="text-xs text-muted">
        {{ limitation }}
      </p>
    </div>
    <UAlert
      v-else
      title="Outcome evidence unavailable"
      description="Choose a client and complete the reporting window to load measured outcomes."
      color="neutral"
      variant="subtle"
    />
  </UCard>
</template>
