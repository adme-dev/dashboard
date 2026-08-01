<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { SiteIntelligenceDomain, SiteIntelligenceLane } from '~/types/site-intelligence'

const props = defineProps<{
  open: boolean
  clients: Array<{ id: string, name: string }>
  domain?: SiteIntelligenceDomain | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [domain: SiteIntelligenceDomain]
}>()

const laneOptions = [
  { label: 'Client-owned site', value: 'owned' },
  { label: 'Public competitor site', value: 'competitor' }
]
const statusOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' }
]
const discoveryOptions = [
  { label: 'Sitemaps first', value: 'sitemaps' },
  { label: 'Sitemaps and page links', value: 'all' },
  { label: 'Page links only', value: 'links' }
]
const renderOptions = [
  { label: 'Static first, browser fallback', value: 'auto' },
  { label: 'Static HTML only', value: 'static' },
  { label: 'Browser rendered', value: 'browser' }
]
const frequencyOptions = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Manual only', value: 'manual' }
]
const advancedItems = [{ label: 'Advanced crawl controls', slot: 'advanced' }]

const clientOptions = computed(() => props.clients.map(client => ({
  label: client.name,
  value: client.id
})))

const form = reactive({
  clientId: '',
  lane: 'owned' as SiteIntelligenceLane,
  name: '',
  origin: '',
  justification: '',
  status: 'active' as 'active' | 'paused',
  discoveryMode: 'sitemaps' as 'all' | 'sitemaps' | 'links',
  renderMode: 'auto' as 'auto' | 'static' | 'browser',
  pageLimit: 200,
  depth: 3,
  frequency: 'daily' as 'daily' | 'weekly' | 'manual',
  retentionDays: 90,
  includePatterns: '',
  excludePatterns: '',
  includeSubdomains: false,
  aiInputAllowed: false
})

const saving = ref(false)
const errorMessage = ref<string | null>(null)

function laneDefaults(lane: SiteIntelligenceLane) {
  form.pageLimit = lane === 'competitor' ? 100 : 200
  form.depth = lane === 'competitor' ? 2 : 3
  form.retentionDays = lane === 'competitor' ? 30 : 90
  form.aiInputAllowed = false
}

function resetForm() {
  const domain = props.domain
  form.clientId = domain?.clientId ?? props.clients[0]?.id ?? ''
  form.lane = domain?.lane ?? 'owned'
  form.name = domain?.name ?? ''
  form.origin = domain?.origin ?? ''
  form.justification = domain?.justification ?? ''
  form.status = domain?.status ?? 'active'
  form.discoveryMode = domain?.discoveryMode ?? 'sitemaps'
  form.renderMode = domain?.renderMode ?? 'auto'
  form.pageLimit = domain?.pageLimit ?? (form.lane === 'competitor' ? 100 : 200)
  form.depth = domain?.depth ?? (form.lane === 'competitor' ? 2 : 3)
  form.frequency = domain?.frequency ?? 'daily'
  form.retentionDays = domain?.retentionDays ?? (form.lane === 'competitor' ? 30 : 90)
  form.includePatterns = domain?.includePatterns.join('\n') ?? ''
  form.excludePatterns = domain?.excludePatterns.join('\n') ?? ''
  form.includeSubdomains = domain?.includeSubdomains ?? false
  form.aiInputAllowed = domain?.aiInputAllowed ?? false
  errorMessage.value = null
}

watch(() => props.open, (open) => {
  if (open) resetForm()
}, { immediate: true })
watch(() => props.domain, resetForm)

function updateLane(lane: SiteIntelligenceLane) {
  form.lane = lane
  laneDefaults(lane)
}

const modalOpen = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})

const canSave = computed(() => Boolean(
  form.clientId
  && form.name.trim()
  && form.origin.trim()
  && form.justification.trim().length >= 10
  && !saving.value
))

function lines(value: string): string[] {
  return [...new Set(value.split('\n').map(line => line.trim()).filter(Boolean))]
}

function displayError(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'The monitored domain could not be saved'
}

async function saveDomain() {
  if (!canSave.value) return
  saving.value = true
  errorMessage.value = null

  const body = {
    clientId: form.clientId,
    lane: form.lane,
    name: form.name.trim(),
    origin: form.origin.trim(),
    justification: form.justification.trim(),
    status: form.status,
    discoveryMode: form.discoveryMode,
    includePatterns: lines(form.includePatterns),
    excludePatterns: lines(form.excludePatterns),
    includeSubdomains: form.includeSubdomains,
    renderMode: form.renderMode,
    pageLimit: Number(form.pageLimit),
    depth: Number(form.depth),
    frequency: form.frequency,
    crawlPurposes: form.aiInputAllowed ? ['search', 'ai-input'] : ['search'],
    aiInputAllowed: form.aiInputAllowed,
    retentionDays: Number(form.retentionDays)
  }

  try {
    const request = props.domain
      ? `/api/agency/site-intelligence/domains/${props.domain.id}`
      : '/api/agency/site-intelligence/domains'
    const response = await $fetch<{ domain: SiteIntelligenceDomain }>(request, {
      method: props.domain ? 'PUT' : 'POST',
      body
    })
    emit('saved', response.domain)
    emit('update:open', false)
  } catch (error: unknown) {
    errorMessage.value = displayError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="modalOpen" :title="domain ? 'Edit monitored domain' : 'Add monitored domain'">
    <template #content>
      <div class="@container p-5 sm:p-6">
        <div class="max-w-2xl">
          <h2 class="text-lg font-semibold text-highlighted">
            {{ domain ? 'Edit monitored domain' : 'Add monitored domain' }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            Set a narrow, reviewable collection boundary. XeroFlow will respect public access controls and declared content-use signals.
          </p>
        </div>

        <UAlert
          v-if="form.lane === 'competitor'"
          class="mt-5"
          color="warning"
          variant="soft"
          icon="i-lucide-shield-check"
          title="Public pages only"
          description="Competitor monitoring records public business facts and changes. It does not collect visitor data or bypass access controls."
        />

        <div class="mt-5 grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Client" required>
            <USelectMenu
              v-model="form.clientId"
              :items="clientOptions"
              value-key="value"
              :disabled="Boolean(domain)"
              class="w-full"
              data-testid="site-domain-client"
            />
          </UFormField>

          <UFormField label="Monitoring lane" required>
            <USelectMenu
              :model-value="form.lane"
              :items="laneOptions"
              value-key="value"
              class="w-full"
              data-testid="site-domain-lane"
              @update:model-value="updateLane($event as SiteIntelligenceLane)"
            />
          </UFormField>

          <UFormField label="Display name" required>
            <UInput
              v-model="form.name"
              class="w-full"
              placeholder="Bravo GWM Haval"
              data-testid="site-domain-name"
            />
          </UFormField>

          <UFormField label="Status" required>
            <USelectMenu
              v-model="form.status"
              :items="statusOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Public website URL"
            description="Enter a public page on the approved domain; XeroFlow stores the canonical origin."
            required
            class="@lg:col-span-2"
          >
            <UInput
              v-model="form.origin"
              type="url"
              class="w-full"
              placeholder="https://www.example.com.au"
              data-testid="site-domain-origin"
            />
          </UFormField>

          <UFormField
            label="Business justification"
            description="Explain why this domain is relevant to the selected client."
            required
            class="@lg:col-span-2"
          >
            <UTextarea
              v-model="form.justification"
              :rows="3"
              class="w-full"
              placeholder="Monitor public automotive offers for the approved competitor set."
              data-testid="site-domain-justification"
            />
          </UFormField>
        </div>

        <UAccordion :items="advancedItems" class="mt-5">
          <template #advanced>
            <div class="grid grid-cols-1 gap-4 pb-2 pt-3 @lg:grid-cols-2">
              <UFormField label="Discovery">
                <USelectMenu
                  v-model="form.discoveryMode"
                  :items="discoveryOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Rendering">
                <USelectMenu
                  v-model="form.renderMode"
                  :items="renderOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Page limit">
                <UInput
                  v-model="form.pageLimit"
                  type="number"
                  :min="1"
                  :max="200"
                  class="w-full"
                  data-testid="site-domain-page-limit"
                />
              </UFormField>
              <UFormField label="Link depth">
                <UInput
                  v-model="form.depth"
                  type="number"
                  :min="0"
                  :max="5"
                  class="w-full"
                  data-testid="site-domain-depth"
                />
              </UFormField>
              <UFormField label="Frequency">
                <USelectMenu
                  v-model="form.frequency"
                  :items="frequencyOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Raw snapshot retention (days)">
                <UInput
                  v-model="form.retentionDays"
                  type="number"
                  :min="1"
                  :max="365"
                  class="w-full"
                  data-testid="site-domain-retention"
                />
              </UFormField>
              <UFormField label="Included URL patterns" description="One Cloudflare wildcard pattern per line." class="@lg:col-span-2">
                <UTextarea v-model="form.includePatterns" :rows="3" class="w-full font-mono text-sm" />
              </UFormField>
              <UFormField label="Excluded URL patterns" description="Exclusions always take priority." class="@lg:col-span-2">
                <UTextarea v-model="form.excludePatterns" :rows="3" class="w-full font-mono text-sm" />
              </UFormField>
              <div class="space-y-3 @lg:col-span-2">
                <UCheckbox v-model="form.includeSubdomains" label="Include explicitly approved subdomains" />
                <UCheckbox
                  v-model="form.aiInputAllowed"
                  label="Allow changed public content to be used as AI input"
                  data-testid="site-domain-ai-input"
                />
                <p class="text-xs text-muted">
                  AI training is never requested. If a site disallows AI input, deterministic collection remains separate and enrichment is skipped.
                </p>
              </div>
            </div>
          </template>
        </UAccordion>

        <UAlert
          v-if="errorMessage"
          class="mt-5"
          color="error"
          variant="soft"
          title="Domain not saved"
          :description="errorMessage"
        />

        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="emit('update:open', false)"
          />
          <UButton
            label="Save monitored domain"
            icon="i-lucide-shield-check"
            :loading="saving"
            :disabled="!canSave"
            data-testid="site-domain-save"
            @click="saveDomain"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
