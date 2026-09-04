<script setup lang="ts">
interface DomainRecord {
  certificateValidation: Array<Record<string, unknown>>
  dnsStatus: string
  failureSummary?: string | null
  hostname: string
  hostnameStatus: string
  id: string
  ownershipValidation: Record<string, unknown>
  status: string
  tlsStatus: string
}

const props = defineProps<{ siteId: string }>()
const toast = useToast()
const open = ref(false)
const hostname = ref('')
const saving = ref(false)
const refreshingId = ref<string | null>(null)
const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/domains`)
const { data, status, error, refresh } = await useFetch<{ domains: DomainRecord[] }>(endpoint)
const domains = computed(() => data.value?.domains ?? [])

function showConnectDomain() {
  open.value = true
}

function closeConnectDomain() {
  open.value = false
}

function badgeColor(value: string) {
  return value === 'active' || value === 'verified' ? 'success' : value === 'failed' ? 'error' : 'warning'
}

async function attach() {
  if (!hostname.value.trim() || saving.value) return
  saving.value = true
  try {
    await $fetch(endpoint.value, { method: 'POST', body: { hostname: hostname.value } })
    hostname.value = ''
    open.value = false
    await refresh()
    toast.add({ title: 'Domain attached', description: 'Complete the displayed DNS records, then verify.', color: 'success' })
  } catch (failure: unknown) {
    const candidate = failure as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Domain could not be attached', description: candidate.data?.statusMessage || candidate.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function verify(domain: DomainRecord) {
  refreshingId.value = domain.id
  try {
    await $fetch(`${endpoint.value}/${domain.id}/verify`, { method: 'POST' })
    await refresh()
    toast.add({ title: 'DNS state refreshed', color: 'success' })
  } finally {
    refreshingId.value = null
  }
}
</script>

<template>
  <div class="space-y-4 pt-5">
    <UAlert
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-check"
      title="Activation is fail-closed"
      description="A domain becomes active only after Cloudflare confirms hostname and TLS state. DNS-only verification remains visible but cannot activate production delivery."
    />
    <UCard>
      <template #header>
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="font-semibold text-highlighted">
              Domains and DNS
            </h2><p class="mt-1 text-sm text-muted">
              Ownership, CNAME, certificate and activation status for this site.
            </p>
          </div>
          <UButton label="Connect domain" icon="i-lucide-plus" @click="showConnectDomain" />
        </div>
      </template>
      <div v-if="status === 'pending'" class="space-y-3" aria-busy="true">
        <USkeleton class="h-24" /><USkeleton class="h-24" />
      </div>
      <UAlert v-else-if="error" color="error" title="Unable to load domains" />
      <div v-else-if="domains.length" class="divide-y divide-default">
        <article v-for="domain in domains" :key="domain.id" class="py-5 first:pt-0 last:pb-0">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">
                {{ domain.hostname }}
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <UBadge :label="`Lifecycle: ${domain.status}`" :color="badgeColor(domain.status)" variant="subtle" />
                <UBadge :label="`DNS: ${domain.dnsStatus}`" :color="badgeColor(domain.dnsStatus)" variant="subtle" />
                <UBadge :label="`TLS: ${domain.tlsStatus}`" :color="badgeColor(domain.tlsStatus)" variant="subtle" />
              </div>
              <p v-if="domain.ownershipValidation.cnameTarget" class="mt-3 text-sm text-muted">
                CNAME target: <code class="text-highlighted">{{ domain.ownershipValidation.cnameTarget }}</code>
              </p>
              <p v-if="domain.failureSummary" class="mt-2 text-sm text-error">
                {{ domain.failureSummary }}
              </p>
            </div>
            <UButton
              label="Verify DNS and TLS"
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              :loading="refreshingId === domain.id"
              @click="verify(domain)"
            />
          </div>
        </article>
      </div>
      <p v-else class="py-8 text-center text-sm text-muted">
        No custom domains are connected to this site.
      </p>
    </UCard>

    <UModal v-model:open="open" title="Connect custom domain" description="The hostname must not already be attached to another Page Studio site.">
      <template #content>
        <div class="space-y-5 p-6">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Connect custom domain
            </h2><p class="mt-1 text-sm text-muted">
              Cloudflare will issue the ownership and certificate records when provider credentials are configured.
            </p>
          </div>
          <UFormField label="Hostname" help="Use a hostname such as www.example.com. Do not include https://.">
            <UInput
              v-model="hostname"
              class="w-full"
              placeholder="www.example.com"
              autocomplete="off"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              :disabled="saving"
              @click="closeConnectDomain"
            />
            <UButton
              label="Connect domain"
              icon="i-lucide-globe-2"
              :loading="saving"
              :disabled="!hostname.trim()"
              @click="attach"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
