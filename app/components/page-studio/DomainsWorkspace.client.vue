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

function validationRecords(domain: DomainRecord) {
  const records: Array<{ purpose: string, name: string, value: string }> = []
  const ownership = domain.ownershipValidation
  if (ownership.type === 'txt' && typeof ownership.name === 'string' && typeof ownership.value === 'string' && ownership.name && ownership.value) {
    records.push({ purpose: 'Verify ownership', name: ownership.name, value: ownership.value })
  }
  for (const certificate of domain.certificateValidation) {
    if (typeof certificate.txt_name === 'string' && typeof certificate.txt_value === 'string' && certificate.txt_name && certificate.txt_value) {
      records.push({ purpose: 'Issue the HTTPS certificate', name: certificate.txt_name, value: certificate.txt_value })
    }
  }
  return records
}

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
  if (refreshingId.value) return
  refreshingId.value = domain.id
  try {
    await $fetch(`${endpoint.value}/${domain.id}/verify`, { method: 'POST' })
    await refresh()
    toast.add({ title: 'DNS state refreshed', color: 'success' })
  } catch {
    toast.add({ title: 'Verification could not be completed', description: 'Your DNS records have not been changed. Try verifying again after checking your provider.', color: 'error' })
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
      title="Connect your website while keeping your email"
      description="Add the verification records at your existing DNS provider. Keep your current MX and email TXT records. Website activation requires verified ownership, an active HTTPS certificate and DNS pointing to XeroFlow."
    />
    <UCard class="@container">
      <template #header>
        <div class="flex flex-col items-start justify-between gap-4 @md:flex-row">
          <div>
            <h2 class="font-semibold text-highlighted">
              Domains and DNS
            </h2><p class="mt-1 text-sm text-muted">
              Ownership, CNAME, certificate and activation status for this site.
            </p>
          </div>
          <UButton
            class="shrink-0"
            label="Connect domain"
            icon="i-lucide-plus"
            @click="showConnectDomain"
          />
        </div>
      </template>
      <div v-if="status === 'pending'" class="space-y-3" aria-busy="true">
        <USkeleton class="h-24" /><USkeleton class="h-24" />
      </div>
      <UAlert v-else-if="error" color="error" title="Unable to load domains" />
      <div v-else-if="domains.length" class="divide-y divide-default">
        <article v-for="domain in domains" :key="domain.id" class="py-5 first:pt-0 last:pb-0">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-highlighted">
                {{ domain.hostname }}
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <UBadge :label="`Lifecycle: ${domain.status}`" :color="badgeColor(domain.status)" variant="subtle" />
                <UBadge :label="`DNS: ${domain.dnsStatus}`" :color="badgeColor(domain.dnsStatus)" variant="subtle" />
                <UBadge :label="`TLS: ${domain.tlsStatus}`" :color="badgeColor(domain.tlsStatus)" variant="subtle" />
              </div>
              <div v-if="validationRecords(domain).length" class="mt-4 space-y-3">
                <p class="text-sm text-muted">
                  Add each TXT record below. Ownership and certificate verification are separate steps.
                </p>
                <div v-for="(record, index) in validationRecords(domain)" :key="`${record.purpose}-${index}`" class="rounded-lg border border-default p-3">
                  <h3 class="text-sm font-medium text-highlighted">
                    {{ record.purpose }}
                  </h3>
                  <dl class="mt-2 space-y-2 text-sm">
                    <div>
                      <dt class="text-muted">
                        Type
                      </dt><dd>TXT</dd>
                    </div>
                    <div>
                      <dt class="text-muted">
                        Name
                      </dt><dd class="break-all font-mono text-highlighted">
                        {{ record.name }}
                      </dd>
                    </div>
                    <div>
                      <dt class="text-muted">
                        Value
                      </dt><dd class="break-all font-mono text-highlighted">
                        {{ record.value }}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <p v-else-if="domain.status !== 'active'" class="mt-3 text-sm text-muted">
                Verification records are not available yet. Use Verify DNS and TLS to check for updated instructions.
              </p>
              <div v-if="domain.ownershipValidation.cnameTarget" class="mt-4 rounded-lg border border-default p-3 text-sm">
                <h3 class="font-medium text-highlighted">
                  Point website traffic to XeroFlow
                </h3>
                <p class="mt-1 text-muted">
                  Before replacing the website record, save its current value for rollback and confirm the new website and HTTPS certificate are ready.
                </p>
                <dl class="mt-2 space-y-2">
                  <div>
                    <dt class="text-muted">
                      Type
                    </dt><dd>CNAME</dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Name
                    </dt><dd class="break-all font-mono">
                      {{ domain.hostname }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Target
                    </dt><dd class="break-all font-mono">
                      {{ domain.ownershipValidation.cnameTarget }}
                    </dd>
                  </div>
                </dl>
                <p class="mt-2 text-muted">
                  For a root domain, check your DNS provider’s supported setup before changing records.
                </p>
              </div>
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
              :disabled="refreshingId !== null"
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
