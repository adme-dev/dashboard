<script setup lang="ts">
definePageMeta({
  title: 'Measurement Signal Centre',
  middleware: ['role-clients']
})

interface SignalSummary {
  captured: number
  confirmed: number
  consentGranted: number
  policySkipped: number
  delivered: number
  retrying: number
  failed: number
  identifierCoverage: Record<string, number>
  freshnessAt: string | null
}

const route = useRoute()
const { isOwner, canAccessMediaBuying, canWrite } = useAuth()
const clientId = computed(() => String(route.params.clientId || ''))
const summary = ref<SignalSummary | null>(null)
const summaryPending = ref(true)
const summaryError = ref<string | null>(null)

function errorMessage(value: unknown) {
  const candidate = value as {
    data?: { statusMessage?: string, error?: { message?: string } }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.error?.message
    || candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'Signal summary could not be loaded'
}

async function refreshSummary() {
  if (!canAccessMediaBuying.value) {
    summaryPending.value = false
    summaryError.value = 'Media buying access is required to view measurement signals.'
    return
  }
  summaryPending.value = true
  summaryError.value = null
  try {
    summary.value = await $fetch<SignalSummary>(
      `/api/agency/measurement/clients/${clientId.value}/signals/summary`
    )
  } catch (error) {
    summary.value = null
    summaryError.value = errorMessage(error)
  } finally {
    summaryPending.value = false
  }
}

await refreshSummary()
</script>

<template>
  <div class="mx-auto w-full max-w-screen-2xl space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex items-center gap-2 text-sm text-muted">
          <UButton
            :to="`/agency/clients/${clientId}`"
            label="Client"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="link"
            class="-ml-2"
          />
          <span aria-hidden="true">/</span>
          <span>Measurement</span>
        </div>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">
          Measurement Signal Centre
        </h1>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Explain what XeroFlow captured, what privacy policy allowed, and what TikTok, Meta and Google accepted—without exposing visitor identifiers or provider credentials.
        </p>
      </div>
      <UBadge color="primary" variant="subtle" size="lg">
        Enterprise measurement
      </UBadge>
    </header>

    <MeasurementSignalOverview
      :summary="summary"
      :pending="summaryPending"
      :error="summaryError"
      @retry="refreshSummary"
    />

    <MeasurementSignalEventExplorer v-if="canAccessMediaBuying" :client-id="clientId" />

    <section class="border-t border-default pt-6">
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-highlighted">Configuration and validation</h2>
        <p class="mt-1 text-sm text-muted">
          Destination changes, test events and live activation continue through the governed approval controls.
        </p>
      </div>
      <ClientsClientMeasurementPanel
        v-if="canAccessMediaBuying"
        :client-id="clientId"
        :can-configure="canWrite"
        :can-owner-override="isOwner"
      />
    </section>
  </div>
</template>
