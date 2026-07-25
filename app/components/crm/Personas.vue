<script setup lang="ts">
interface PersonaTimeline {
  id: string
  displayName: string
  email: string | null
  phone: string | null
  firstSeenAt: string
  lastSeenAt: string
  lifecycleStage: string | null
  hasConflict: boolean
  leads: Array<{
    id: string
    source: string
    submittedAt: string
    formName: string | null
    vehicle: string | null
  }>
  crmPeople: Array<{
    id: string
    name: string
    lifecycleStage: string | null
  }>
  products: Array<{
    productId: string | null
    matchMethod: string
    confidence: number
    snapshot: Record<string, string>
    product: Record<string, unknown> | null
    occurredAt: string
  }>
  submissions: Array<{
    pageUrl: string
    formId: string | null
    occurredAt: string
  }>
  evidence: Array<{
    id: string
    type: string
    source: string
    confidence: number
    metadata: Record<string, unknown>
    occurredAt: string
  }>
}

interface PersonaResponse {
  enabled: boolean
  generatedAt: string
  personas: PersonaTimeline[]
}

defineProps<{ clientId: string }>()

const { data, status, error, refresh } = useFetch<PersonaResponse>(
  '/api/client-portal/crm/personas',
  { key: 'portal-crm-personas' }
)
const selectedId = ref<string | null>(null)
const selected = computed(() => {
  const personas = data.value?.personas ?? []
  return personas.find(persona => persona.id === selectedId.value) ?? personas[0] ?? null
})

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function evidenceLabel(type: string): string {
  return type.split('_').map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ')
}

function productLabel(product: PersonaTimeline['products'][number]): string {
  const source = product.product ?? product.snapshot
  const parts = [
    source.year ?? source.vehicle_year,
    source.make ?? source.vehicle_make,
    source.model ?? source.vehicle_model,
    source.variant ?? source.vehicle_variant
  ].filter(Boolean)
  return parts.join(' ') || String(
    source.stock_id ?? source.vehicle_stock_number ?? source.sku ?? 'Product enquiry'
  )
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-lg font-semibold">
            Persona Identity
          </h2>
          <UBadge color="warning" variant="subtle">
            Pilot
          </UBadge>
          <UBadge color="neutral" variant="subtle">
            Read only
          </UBadge>
        </div>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Deterministic links between confirmed leads, website submissions, CRM people,
          campaign attribution and product enquiries. No probabilistic merges are performed.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="status === 'pending'"
        @click="refresh()"
      >
        Refresh
      </UButton>
    </div>

    <UAlert
      v-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      title="Persona timeline is unavailable"
      :description="error.message"
    />

    <div
      v-else-if="status === 'pending' && !data"
      class="grid min-h-72 place-items-center rounded-xl border border-default"
    >
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>

    <UAlert
      v-else-if="data && !data.enabled"
      color="neutral"
      icon="i-lucide-lock-keyhole"
      title="Persona Identity is not enabled"
      description="This client is not enrolled in the Persona Identity pilot."
    />

    <UAlert
      v-else-if="!data?.personas.length"
      color="neutral"
      icon="i-lucide-users"
      title="No personas yet"
      description="A persona appears after a confirmed lead has deterministic identity evidence."
    />

    <div v-else class="grid gap-4 xl:grid-cols-[minmax(260px,0.34fr)_minmax(0,1fr)]">
      <UCard :ui="{ body: 'p-2 sm:p-2' }">
        <div class="max-h-[680px] space-y-1 overflow-y-auto">
          <button
            v-for="persona in data?.personas"
            :key="persona.id"
            type="button"
            class="w-full rounded-lg px-3 py-3 text-left transition"
            :class="selected?.id === persona.id ? 'bg-elevated' : 'hover:bg-elevated/60'"
            @click="selectedId = persona.id"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="truncate text-sm font-medium">{{ persona.displayName }}</span>
              <UIcon
                v-if="persona.hasConflict"
                name="i-lucide-triangle-alert"
                class="mt-0.5 size-4 shrink-0 text-warning"
              />
            </div>
            <p class="mt-1 truncate text-xs text-muted">
              {{ persona.email || persona.phone || `Persona ${persona.id.slice(0, 8)}` }}
            </p>
            <div class="mt-2 flex items-center gap-2 text-[11px] text-muted">
              <span>{{ persona.leads.length }} lead{{ persona.leads.length === 1 ? '' : 's' }}</span>
              <span>·</span>
              <span>{{ dateTime(persona.lastSeenAt) }}</span>
            </div>
          </button>
        </div>
      </UCard>

      <div v-if="selected" class="space-y-4">
        <UCard>
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-xl font-semibold">
                  {{ selected.displayName }}
                </h3>
                <UBadge v-if="selected.lifecycleStage" color="primary" variant="subtle">
                  {{ selected.lifecycleStage }}
                </UBadge>
              </div>
              <p class="mt-1 text-sm text-muted">
                {{ selected.email || 'No email' }} · {{ selected.phone || 'No phone' }}
              </p>
              <p class="mt-2 font-mono text-xs text-muted">
                Persona {{ selected.id }}
              </p>
            </div>
            <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-xs">
              <span class="text-muted">First seen</span>
              <span>{{ dateTime(selected.firstSeenAt) }}</span>
              <span class="text-muted">Last seen</span>
              <span>{{ dateTime(selected.lastSeenAt) }}</span>
            </div>
          </div>
        </UCard>

        <div class="grid gap-4 md:grid-cols-3">
          <UCard>
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Confirmed leads</p>
            <p class="mt-2 text-2xl font-semibold">{{ selected.leads.length }}</p>
          </UCard>
          <UCard>
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Website matches</p>
            <p class="mt-2 text-2xl font-semibold">{{ selected.submissions.length }}</p>
          </UCard>
          <UCard>
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Product interests</p>
            <p class="mt-2 text-2xl font-semibold">{{ selected.products.length }}</p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <h4 class="font-medium">Identity timeline</h4>
          </template>
          <div class="space-y-4">
            <div
              v-for="item in selected.evidence"
              :key="item.id"
              class="grid grid-cols-[auto_minmax(0,1fr)] gap-3"
            >
              <div class="mt-1 grid size-8 place-items-center rounded-full bg-elevated">
                <UIcon
                  :name="item.type === 'identity_conflict' ? 'i-lucide-triangle-alert' : 'i-lucide-link-2'"
                  class="size-4"
                  :class="item.type === 'identity_conflict' ? 'text-warning' : 'text-primary'"
                />
              </div>
              <div class="min-w-0 border-b border-default pb-4">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium">{{ evidenceLabel(item.type) }}</p>
                  <span class="text-xs text-muted">{{ dateTime(item.occurredAt) }}</span>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ item.source }} · {{ item.confidence }}% confidence
                </p>
              </div>
            </div>
          </div>
        </UCard>

        <div class="grid gap-4 lg:grid-cols-2">
          <UCard>
            <template #header>
              <h4 class="font-medium">Website and lead activity</h4>
            </template>
            <div class="space-y-3">
              <div v-for="lead in selected.leads" :key="lead.id" class="rounded-lg bg-elevated p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium">{{ lead.vehicle || lead.formName || 'Lead enquiry' }}</span>
                  <UBadge color="neutral" variant="subtle">{{ lead.source }}</UBadge>
                </div>
                <p class="mt-1 text-xs text-muted">{{ dateTime(lead.submittedAt) }}</p>
              </div>
              <a
                v-for="submission in selected.submissions"
                :key="`${submission.pageUrl}:${submission.occurredAt}`"
                :href="submission.pageUrl"
                target="_blank"
                rel="noreferrer"
                class="block truncate text-xs text-primary hover:underline"
              >
                {{ submission.pageUrl }}
              </a>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h4 class="font-medium">Product interests</h4>
            </template>
            <div v-if="selected.products.length" class="space-y-3">
              <div
                v-for="product in selected.products"
                :key="`${product.productId}:${product.occurredAt}`"
                class="rounded-lg bg-elevated p-3"
              >
                <p class="text-sm font-medium">{{ productLabel(product) }}</p>
                <p class="mt-1 text-xs text-muted">
                  {{ product.matchMethod.replaceAll('_', ' ') }} · {{ product.confidence }}% confidence
                </p>
              </div>
            </div>
            <p v-else class="text-sm text-muted">No product identifiers were attached to these enquiries.</p>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>

