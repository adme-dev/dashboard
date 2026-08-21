<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const sections = [
  {
    label: 'Quick start (5-min overview)',
    icon: 'i-lucide-rocket',
    slot: 'quickstart'
  },
  {
    label: 'Set up a Google Ads lead form',
    icon: 'i-lucide-chrome',
    slot: 'google'
  },
  {
    label: 'Set up a Meta (Facebook / Instagram) lead form',
    icon: 'i-lucide-facebook',
    slot: 'meta'
  },
  {
    label: 'Set up inbound lead email',
    icon: 'i-lucide-mail',
    slot: 'email'
  },
  {
    label: 'Other sources — Zapier, Make, n8n, custom webhooks',
    icon: 'i-lucide-webhook',
    slot: 'generic'
  },
  {
    label: 'Configure routing rules + destinations',
    icon: 'i-lucide-list-checks',
    slot: 'rules'
  },
  {
    label: 'Filters, delays, and templates',
    icon: 'i-lucide-filter',
    slot: 'advanced'
  },
  {
    label: 'Manual leads + the client portal',
    icon: 'i-lucide-user-plus',
    slot: 'manual'
  },
  {
    label: 'How retries, retention, and crons work',
    icon: 'i-lucide-cog',
    slot: 'ops'
  },
  {
    label: 'Troubleshooting',
    icon: 'i-lucide-life-buoy',
    slot: 'troubleshoot'
  }
]

// ---- Live webhook credentials (single source of truth for URL + key) ----
interface EndpointItem {
  id: string
  client_id: string
  client_name: string
  url_token: string
  secret_key: string
  lead_count: number | string | null
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string }
) => Promise<T>

const endpointsData = ref<{ items: EndpointItem[] }>({ items: [] })
const endpointsPending = ref(false)
const endpointsError = ref<unknown>(null)

async function refreshEndpoints() {
  endpointsPending.value = true
  endpointsError.value = null
  try {
    endpointsData.value = await apiFetch<{ items: EndpointItem[] }>('/api/leads/endpoints/list')
  } catch (error) {
    endpointsError.value = error
  } finally {
    endpointsPending.value = false
  }
}

const endpointItems = computed(() => endpointsData.value?.items ?? [])
const credsForbidden = computed(() => {
  const code = (endpointsError.value as { statusCode?: number } | null)?.statusCode
  return code === 401 || code === 403
})
const clientItems = computed(() =>
  endpointItems.value.map(e => ({ value: e.client_id, label: e.client_name }))
)
const selectedClientId = ref<string | null>(null)
const selectedEndpoint = computed(() =>
  endpointItems.value.find(e => e.client_id === selectedClientId.value) ?? endpointItems.value[0] ?? null
)

const baseUrl = computed(() =>
  import.meta.client ? window.location.origin : 'https://app.xeroflow.io'
)
const googleWebhookUrl = computed(() =>
  selectedEndpoint.value ? `${baseUrl.value}/api/leads/webhook/google/${selectedEndpoint.value.url_token}` : ''
)
const genericWebhookUrl = computed(() =>
  selectedEndpoint.value ? `${baseUrl.value}/api/leads/webhook/generic/${selectedEndpoint.value.url_token}` : ''
)

const revealed = ref(false)
const confirmingRotate = ref(false)
const rotating = ref(false)
const rotatedClientId = ref<string | null>(null)

function closeGuide() {
  open.value = false
}

function toggleKeyVisibility() {
  revealed.value = !revealed.value
}

function requestKeyRotation() {
  confirmingRotate.value = true
}

function cancelKeyRotation() {
  confirmingRotate.value = false
}

async function copyText(value: string, label: string) {
  if (!value) return
  if (import.meta.client) await navigator.clipboard.writeText(value)
  toast.add({ title: label, color: 'success', icon: 'i-lucide-check' })
}

async function confirmRotate() {
  const ep = selectedEndpoint.value
  if (!ep) return
  rotating.value = true
  try {
    await apiFetch(`/api/leads/endpoints/${ep.id}/rotate`, { method: 'POST' })
    rotatedClientId.value = ep.client_id
    revealed.value = true
    await refreshEndpoints()
    toast.add({ title: 'Key rotated', description: 'Old key valid for 24h', color: 'success' })
  } catch {
    toast.add({ title: 'Rotate failed', color: 'error' })
  } finally {
    rotating.value = false
    confirmingRotate.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    revealed.value = false
    confirmingRotate.value = false
    rotatedClientId.value = null
    refreshEndpoints()
  }
})

watch(endpointItems, (items) => {
  if (!selectedClientId.value && items.length) selectedClientId.value = items[0].client_id
})
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-3xl' }">
    <template #content>
      <div class="p-6 max-h-[80vh] overflow-y-auto">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-xl font-semibold">
              Leads engine setup guide
            </h2>
            <p class="text-sm text-muted mt-1">
              How to capture and route Google, Meta, inbound email, webhook, CSV, and manual leads.
            </p>
          </div>
          <UButton
            variant="ghost"
            icon="i-lucide-x"
            aria-label="Close setup guide"
            @click="closeGuide"
          />
        </div>

        <!-- Live webhook credentials — the single place to get a client's URL + key -->
        <UCard class="mb-5" variant="subtle">
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-key-round" class="size-4 text-primary" />
              <h3 class="text-sm font-semibold">Your webhook credentials</h3>
            </div>
          </template>

          <div class="space-y-4">
            <p class="text-sm text-muted">
              Pick a client to reveal their unique webhook URL and secret key. The steps below
              explain where to paste them for Google, Meta, or any other tool.
            </p>

            <UAlert
              v-if="credsForbidden"
              color="warning"
              variant="subtle"
              icon="i-lucide-lock"
              title="Restricted"
              description="Webhook URLs and keys are only visible to owners and admins."
            />

            <template v-else>
              <UFormField label="Client">
                <USelectMenu
                  v-model="selectedClientId"
                  :items="clientItems"
                  value-key="value"
                  placeholder="Select a client"
                  :loading="endpointsPending"
                  class="w-full sm:w-80"
                />
              </UFormField>

              <p v-if="!endpointsPending && endpointItems.length === 0" class="text-sm text-muted">
                No clients with lead endpoints yet. Create a form rule for a client to generate one.
              </p>

              <div v-else-if="selectedEndpoint" class="space-y-3">
                <UFormField label="Google Ads webhook URL">
                  <div class="flex items-center gap-2">
                    <UInput :model-value="googleWebhookUrl" readonly size="sm" class="font-mono flex-1" />
                    <UButton
                      icon="i-lucide-copy"
                      size="sm"
                      variant="ghost"
                      aria-label="Copy Google webhook URL"
                      @click="copyText(googleWebhookUrl, 'Google webhook URL copied')"
                    />
                  </div>
                </UFormField>

                <UFormField label="Generic webhook URL" help="For Meta, Zapier, Make, n8n, or custom forms.">
                  <div class="flex items-center gap-2">
                    <UInput :model-value="genericWebhookUrl" readonly size="sm" class="font-mono flex-1" />
                    <UButton
                      icon="i-lucide-copy"
                      size="sm"
                      variant="ghost"
                      aria-label="Copy generic webhook URL"
                      @click="copyText(genericWebhookUrl, 'Generic webhook URL copied')"
                    />
                  </div>
                </UFormField>

                <UFormField label="Webhook key">
                  <div class="flex items-center gap-2">
                    <UInput
                      :model-value="revealed ? selectedEndpoint.secret_key : '•'.repeat(40)"
                      readonly
                      size="sm"
                      class="font-mono flex-1"
                    />
                    <UButton
                      :icon="revealed ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                      size="sm"
                      variant="ghost"
                      :aria-label="revealed ? 'Hide key' : 'Reveal key'"
                      @click="toggleKeyVisibility"
                    />
                    <UButton
                      icon="i-lucide-copy"
                      size="sm"
                      variant="ghost"
                      aria-label="Copy webhook key"
                      @click="copyText(selectedEndpoint.secret_key, 'Webhook key copied')"
                    />
                    <UButton
                      icon="i-lucide-refresh-cw"
                      size="sm"
                      variant="ghost"
                      color="warning"
                      aria-label="Rotate webhook key"
                      @click="requestKeyRotation"
                    />
                  </div>
                </UFormField>

                <div
                  v-if="confirmingRotate"
                  class="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm space-y-2"
                >
                  <p class="font-medium text-highlighted">Rotate this key?</p>
                  <p class="text-muted">
                    A new key is generated immediately. The old key keeps working for 24 hours, then
                    stops — update {{ selectedEndpoint.client_name }}'s form tool before then.
                  </p>
                  <div class="flex justify-end gap-2">
                    <UButton size="xs" variant="ghost" label="Cancel" @click="cancelKeyRotation" />
                    <UButton size="xs" color="warning" label="Rotate key" :loading="rotating" @click="confirmRotate" />
                  </div>
                </div>

                <UAlert
                  v-if="rotatedClientId === selectedEndpoint.client_id"
                  color="warning"
                  variant="subtle"
                  icon="i-lucide-clock"
                  title="Key rotated"
                  description="The old key keeps working for 24 hours — update your form tool before then."
                />
              </div>
            </template>
          </div>
        </UCard>

        <LeadsConnectorPanel :client-items="clientItems" />

        <UAccordion :items="sections" multiple>
          <template #quickstart>
            <div class="space-y-3 text-sm leading-relaxed">
              <p class="text-muted">
                From zero to your first lead in under 10 minutes.
              </p>
              <ol class="list-decimal list-inside space-y-2">
                <li>
                  <strong>Copy the webhook URL and key.</strong> Use the
                  <strong>webhook credentials</strong> panel at the top of this guide and
                  pick the client. Each client gets a unique URL + secret key.
                </li>
                <li>
                  <strong>Paste into Google Ads.</strong> In the Lead form asset's
                  <em>Webhook integration</em> section, paste the URL and key, then click
                  <em>Send test data</em>. Within 30 seconds the test lead appears in this inbox.
                </li>
                <li>
                  <strong>Configure routing.</strong> On the
                  <span class="font-mono text-xs">Form rules</span> tab, click <em>Configure</em>
                  next to the form to create a rule.
                </li>
                <li>
                  <strong>Add destinations.</strong> Each rule fans leads out to one or more places —
                  Slack, email, an outbound webhook, Google Sheets, the client portal, or auto-assign
                  to an account manager.
                </li>
                <li>
                  <strong>Click "Test fire"</strong> on the rule to send a synthetic lead through
                  every destination and verify the wiring before real leads arrive.
                </li>
              </ol>
              <UAlert
                color="info"
                variant="subtle"
                icon="i-lucide-info"
                title="Operations must enable the scheduler"
                description="Recovery and health run every five minutes, with retention cleanup daily, after an administrator deploys leads-cron and configures the matching runtime token."
              />
            </div>
          </template>

          <template #google>
            <div class="space-y-3 text-sm leading-relaxed">
              <ol class="list-decimal list-inside space-y-3">
                <li>
                  In the <strong>webhook credentials</strong> panel at the top of this guide,
                  pick the client.
                </li>
                <li>
                  Copy the <strong>Google Ads webhook URL</strong> and the webhook key.
                </li>
                <li>
                  In Google Ads, open the lead form asset (Tools &amp; Settings → Assets → Lead form).
                </li>
                <li>
                  Scroll to <em>Webhook integration</em> and paste:
                  <ul class="list-disc list-inside mt-1 ml-4 text-muted">
                    <li><strong>Webhook URL</strong> — the URL you copied</li>
                    <li><strong>Key</strong> — the secret key</li>
                  </ul>
                </li>
                <li>
                  Click <em>Send test data</em>. Google Ads sends a synthetic submission with
                  placeholder field values.
                </li>
                <li>
                  Open the <em>Inbox</em> tab — the test lead should appear within 30 seconds with
                  source <code class="text-xs bg-elevated px-1 py-0.5 rounded">google</code>.
                </li>
              </ol>
              <UAlert
                color="warning"
                variant="subtle"
                icon="i-lucide-alert-triangle"
                title="Rotate the key if it leaks"
                description="Use the Rotate key button in the credentials panel above. The old key keeps working for 24 hours, so update Google Ads with the new value before it stops."
              />
            </div>
          </template>

          <template #meta>
            <div class="space-y-4 text-sm leading-relaxed">
              <UAlert
                color="warning"
                variant="subtle"
                icon="i-lucide-construction"
                title="Meta auto-ingestion is gated by App Review"
                description="Meta requires the leads_retrieval permission for any app to read lead form data. We can't auto-pull until that's approved (typically 2–4 weeks). The interim workflow below uses the CSV importer to bridge the gap."
              />

              <div>
                <h4 class="text-sm font-semibold mb-1.5">
                  Interim workflow (works today)
                </h4>
                <ol class="list-decimal list-inside space-y-2 text-muted">
                  <li>
                    Marketer creates the Meta lead form in Ads Manager as normal.
                    Note the <strong>form ID</strong> from the URL (e.g. <code class="bg-elevated px-1 py-0.5 rounded text-xs">/forms/12345</code>).
                  </li>
                  <li>
                    In <strong>Form rules</strong> → <strong>+ New form rule</strong>, pick the
                    client, set source to <strong>Meta</strong>, toggle <strong>Use a custom form ID</strong>,
                    paste the form ID. Configure destinations (Slack, email, portal) as usual.
                  </li>
                  <li>
                    Daily or after each campaign push:
                    <ul class="list-disc list-inside ml-4 mt-1 space-y-0.5">
                      <li>Open <strong>Meta Business Suite → Leads Center</strong></li>
                      <li>Filter by the form, click <strong>Download leads</strong> → CSV format</li>
                      <li>
                        In our inbox, click <strong>Import CSV</strong> (top-right of the inbox).
                        Pick the client + form, drop the file, confirm preview, import.
                      </li>
                    </ul>
                  </li>
                  <li>
                    Imported leads run through your form rule destinations exactly like webhook
                    leads — Slack pings, email notifications, portal visibility, etc. all fire.
                  </li>
                </ol>
              </div>

              <div>
                <h4 class="text-sm font-semibold mb-1.5">
                  Set up Meta to email leads as a backup
                </h4>
                <p class="text-muted">
                  In <strong>Lead Center → Settings → Email notifications</strong>, add the agency
                  inbox for a human-only backup, or copy the relevant client-scoped address from
                  <strong>Email addresses</strong> if the notification should enter XeroFlow's
                  canonical lead pipeline. Never use one client's address for another client.
                </p>
              </div>

              <div>
                <h4 class="text-sm font-semibold mb-1.5">
                  Webhook handshake (live now, ingestion off)
                </h4>
                <p class="text-muted">
                  The verify endpoint is wired up so Meta App Review can be submitted. Once the
                  permission is granted, reconnect each Meta account for the expanded scope, check
                  its webhook subscription, and complete a live test before treating ingestion as
                  active.
                </p>
                <ol class="list-decimal list-inside space-y-2 mt-2 text-xs text-muted">
                  <li>
                    Get the <strong>Meta verify token</strong> from admin
                    (env var <code class="bg-elevated px-1 py-0.5 rounded">META_LEADGEN_VERIFY_TOKEN</code>).
                  </li>
                  <li>
                    Meta App Dashboard → Webhooks → Page → Add subscription:
                    <ul class="list-disc list-inside ml-4 mt-1">
                      <li>Callback URL: <code class="bg-elevated px-1 py-0.5 rounded">https://app.xeroflow.io/api/leads/webhook/meta</code></li>
                      <li>Verify token: the value from step 1</li>
                      <li>Subscribe field: <code class="bg-elevated px-1 py-0.5 rounded">leadgen</code></li>
                    </ul>
                  </li>
                  <li>
                    Meta sends a verification GET to confirm — we echo the challenge back if the
                    token matches. From that point Meta would forward leadgen events, but until
                    App Review approves <code class="bg-elevated px-1 py-0.5 rounded">leads_retrieval</code>
                    we can only archive the event metadata (not fetch the actual lead data).
                  </li>
                </ol>
              </div>

              <UAlert
                color="info"
                variant="subtle"
                icon="i-lucide-info"
                title="When Meta App Review approves leads_retrieval"
                description="Approval alone does not activate delivery. Reconnect each Meta account in Settings → Social → Meta to obtain the expanded scope, confirm the webhook subscription, then send a live test and verify it in the inbox."
              />
            </div>
          </template>

          <template #email>
            <div class="space-y-4 text-sm leading-relaxed">
              <p class="text-muted">
                Use the dedicated client-scoped address already shown in the
                <strong>Email addresses</strong> tab when a marketplace or website delivers
                enquiries by email instead of webhook. Copy the complete address; never reconstruct
                or share its token separately.
              </p>
              <ol class="list-decimal list-inside space-y-2">
                <li>
                  Open <strong>Email addresses</strong>, create or select the client endpoint, then
                  use <strong>Copy address</strong>.
                </li>
                <li>
                  Add that address to the provider's notification recipients. Keep the incumbent
                  recipient active during pilot and never reuse the address across clients.
                </li>
                <li>
                  In <strong>Form rules</strong>, create an <strong>Inbound email</strong> rule using
                  the form ID shown beside the endpoint, then add the normal portal, notification,
                  webhook, or assignment destinations.
                </li>
                <li>
                  Set expected cadence only when the provider has a real delivery schedule. The
                  first-response SLA is your team's contact target, not a promise that leads arrive
                  on a universal interval.
                </li>
                <li>
                  Send a provider test lead, enable <strong>Show test leads</strong> if needed, and
                  confirm the provider, endpoint label, routing destinations, and CRM result.
                </li>
              </ol>
              <p class="text-muted">
                ADF and recognised provider layouts are parsed deterministically. Optional structured
                AI extraction is a privacy-approved fallback capability, not a customer reply or
                message-writing feature. Every accepted email still enters the same canonical lead,
                form-rule, CRM, notification, measurement, and portal pipeline as other sources.
                Future authenticated transports must reuse that boundary rather than create another
                CRM path.
              </p>
              <UAlert
                color="info"
                variant="subtle"
                icon="i-lucide-shield-check"
                title="Safe inbox metadata"
                description="Inbox and portal views show only provider and endpoint labels. Forwarding tokens, raw email evidence, storage keys, and identity hashes are never exposed."
              />
            </div>
          </template>

          <template #generic>
            <div class="space-y-4 text-sm leading-relaxed">
              <p>
                Anything that can POST JSON can push leads in — Zapier, Make
                (Integromat), n8n, partner CRMs, mobile apps, contact forms on
                your client's own websites, etc. Use the per-client URL + key
                from the <strong>webhook credentials</strong> panel at the top of this guide.
                It is the same key the Google integration uses; one credential covers
                all source types for that client.
              </p>

              <div>
                <p class="font-medium mb-1.5">
                  Endpoint
                </p>
                <pre class="bg-elevated rounded p-3 text-xs font-mono overflow-x-auto"><span class="text-muted">POST</span> https://app.xeroflow.io/api/leads/webhook/generic/<span class="text-primary-500">&lt;url_token&gt;</span></pre>
              </div>

              <div>
                <p class="font-medium mb-1.5">
                  Body
                </p>
                <pre class="bg-elevated rounded p-3 text-xs font-mono overflow-x-auto leading-relaxed">{
  "key": "<span class="text-primary-500">&lt;secret_key&gt;</span>",
  "lead_id": "abc-123",          // optional — used for dedup
  "form_id": "newsletter-signup", // optional
  "form_name": "Newsletter",      // optional
  "source": "webhook",            // 'webhook' | 'meta' | 'csv' | 'manual' | 'google'
  "fields": {
    "full_name": "Sarah Mitchell",
    "email": "sarah@example.com",
    "phone_number": "+61404123456",
    "budget": "75000"
  },
  "attribution": {
    "utm_source": "newsletter",
    "utm_campaign": "spring-sale"
  }
}</pre>
              </div>

              <div>
                <p class="font-medium mb-1.5">
                  Response
                </p>
                <pre class="bg-elevated rounded p-3 text-xs font-mono">{ "ok": true, "lead_id": "..." }
// or for duplicate lead_ids:
{ "ok": true, "skipped": true }</pre>
              </div>

              <div>
                <p class="font-medium mb-1.5">
                  Quick test with curl
                </p>
                <pre class="bg-elevated rounded p-3 text-xs font-mono overflow-x-auto leading-relaxed">curl -X POST \
  https://app.xeroflow.io/api/leads/webhook/generic/&lt;token&gt; \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "&lt;secret_key&gt;",
    "fields": { "full_name": "Test", "email": "t@example.com" }
  }'</pre>
              </div>

              <div>
                <p class="font-medium mb-1.5">
                  Recipes by tool
                </p>
                <table class="w-full text-xs border border-default rounded">
                  <thead class="bg-elevated text-left">
                    <tr>
                      <th class="px-2 py-1.5 font-medium">
                        Tool
                      </th>
                      <th class="px-2 py-1.5 font-medium">
                        How
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr>
                      <td class="px-2 py-1.5 font-medium align-top">
                        Zapier
                      </td>
                      <td class="px-2 py-1.5 text-muted">
                        Trigger: Facebook Lead Ads (or any source). Action: <em>Webhooks by Zapier → POST</em>.
                        URL = our generic endpoint. Payload Type = JSON. Map the trigger fields into a
                        nested <code class="bg-elevated px-1 py-0.5 rounded">fields</code> object.
                      </td>
                    </tr>
                    <tr>
                      <td class="px-2 py-1.5 font-medium align-top">
                        Make / Integromat
                      </td>
                      <td class="px-2 py-1.5 text-muted">
                        Module: <em>HTTP → Make a request</em>. Method POST, URL = endpoint, Body type = JSON.
                        Use <em>Set multiple variables</em> upstream to assemble the <code class="bg-elevated px-1 py-0.5 rounded">fields</code> object.
                      </td>
                    </tr>
                    <tr>
                      <td class="px-2 py-1.5 font-medium align-top">
                        n8n
                      </td>
                      <td class="px-2 py-1.5 text-muted">
                        Node: <em>HTTP Request</em>. Method POST, JSON body, paste the schema above and
                        wire field values via expressions.
                      </td>
                    </tr>
                    <tr>
                      <td class="px-2 py-1.5 font-medium align-top">
                        Custom code
                      </td>
                      <td class="px-2 py-1.5 text-muted">
                        Any HTTP client (axios, fetch, Python requests, Postman, curl). Endpoint accepts
                        up to 200 requests/minute per token; deduped by <code class="bg-elevated px-1 py-0.5 rounded">lead_id</code> if set.
                      </td>
                    </tr>
                    <tr>
                      <td class="px-2 py-1.5 font-medium align-top">
                        Embedded contact form
                      </td>
                      <td class="px-2 py-1.5 text-muted">
                        Form action = endpoint, fields named <code class="bg-elevated px-1 py-0.5 rounded">key</code>,
                        <code class="bg-elevated px-1 py-0.5 rounded">fields[full_name]</code>, etc. Or use a
                        small JS submit handler that builds the JSON body.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <UAlert
                color="info"
                variant="subtle"
                icon="i-lucide-info"
                title="This is the recommended Meta workaround"
                description="Until Meta App Review approves leads_retrieval, point a Zapier 'Facebook Lead Ads' trigger at this endpoint. Zapier already has the App Review for that flow. Trade-off: per-task billing on Zapier; we don't pull yet."
              />
            </div>
          </template>

          <template #rules>
            <div class="space-y-3 text-sm leading-relaxed">
              <p>
                A <strong>form rule</strong> ties an incoming lead form to one or more destinations.
                Each destination is a place leads get sent — Slack, email, an outbound webhook,
                Google Sheets, the client portal, or an auto-assignment to a user.
              </p>
              <p class="font-medium pt-1">
                To configure:
              </p>
              <ol class="list-decimal list-inside space-y-2">
                <li>Open the <em>Form rules</em> tab.</li>
                <li>
                  The first time a form sends a lead, it appears here as <em>Unconfigured</em>.
                  Click <em>Configure</em> to create a rule.
                </li>
                <li>
                  Click <em>+ Add destination</em> and choose a type:
                  <table class="w-full mt-2 text-xs border border-default rounded">
                    <tbody class="divide-y divide-default">
                      <tr>
                        <td class="px-2 py-1.5 font-medium">
                          Slack
                        </td>
                        <td class="px-2 py-1.5 text-muted">
                          Posts a message to a channel via webhook URL
                        </td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">
                          Email
                        </td>
                        <td class="px-2 py-1.5 text-muted">
                          Sends to one or more recipients (comma-separated)
                        </td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">
                          Webhook
                        </td>
                        <td class="px-2 py-1.5 text-muted">
                          POSTs the lead JSON to a custom URL
                        </td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">
                          Google Sheets
                        </td>
                        <td class="px-2 py-1.5 text-muted">
                          Appends a row to a spreadsheet
                        </td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">
                          Portal
                        </td>
                        <td class="px-2 py-1.5 text-muted">
                          Makes the lead visible on the client's portal inbox
                        </td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">
                          Assign user
                        </td>
                        <td class="px-2 py-1.5 text-muted">
                          Auto-assigns to an account manager (round-robin or fixed)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </li>
                <li>
                  Save the rule, then click <em>Test fire</em> on the destination to send a
                  synthetic lead through it. Confirm it arrived in Slack / email / etc.
                </li>
                <li>
                  Toggle the destination <em>Active</em> when ready. Inactive destinations skip
                  silently — useful for staged rollouts.
                </li>
              </ol>
            </div>
          </template>

          <template #advanced>
            <div class="space-y-4 text-sm leading-relaxed">
              <div>
                <p class="font-medium mb-1">
                  Filters
                </p>
                <p class="text-muted mb-2">
                  Filters narrow which leads fire a destination. Each destination can have its own
                  filter set — useful for "only Slack the high-value ones, but always email everyone."
                </p>
                <p class="text-muted text-xs">
                  Filter syntax: <code class="bg-elevated px-1 py-0.5 rounded">field_data.budget gt 5000</code>
                  or <code class="bg-elevated px-1 py-0.5 rounded">utm_source eq facebook</code>.
                  Operators: <code class="bg-elevated px-1 py-0.5 rounded">eq</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">neq</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">gt</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">gte</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">lt</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">lte</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">contains</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">exists</code>.
                </p>
              </div>
              <div>
                <p class="font-medium mb-1">
                  Delays
                </p>
                <p class="text-muted">
                  Each destination can be delayed up to 12 hours. Common pattern: send to Slack
                  immediately, send a follow-up email after 30 minutes if no one's claimed the lead.
                </p>
              </div>
              <div>
                <p class="font-medium mb-1">
                  Email + webhook templates
                </p>
                <p class="text-muted">
                  Email subject/body and webhook payloads support
                  <code v-pre class="bg-elevated px-1 py-0.5 rounded">{{ field_data.email }}</code>
                  variables. Standard fields:
                  <code class="bg-elevated px-1 py-0.5 rounded">lead.id</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">lead.source</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">lead.submitted_at</code>,
                  <code class="bg-elevated px-1 py-0.5 rounded">field_data.&lt;name&gt;</code>.
                </p>
              </div>
            </div>
          </template>

          <template #manual>
            <div class="space-y-3 text-sm leading-relaxed">
              <div>
                <p class="font-medium mb-1">
                  Adding a lead manually
                </p>
                <p class="text-muted">
                  For phone calls, in-person inquiries, or migrating leads from elsewhere — click
                  <em>+ Manual lead</em> in the inbox header. Pick the client, fill in the standard
                  fields (email, name, phone) plus any custom fields, then submit. The lead appears
                  in the inbox with source <code class="bg-elevated px-1 py-0.5 rounded">manual</code>.
                </p>
                <p class="text-muted mt-1">
                  Manual leads <strong>do not</strong> trigger form rules by default — they bypass
                  the routing engine. If you want a manual lead to fire destinations, use the
                  <em>Run rules</em> toggle in the modal.
                </p>
              </div>
              <div>
                <p class="font-medium mb-1">
                  Client portal access
                </p>
                <p class="text-muted">
                  Clients with a portal login can view their own leads at <code class="bg-elevated px-1 py-0.5 rounded">/portal/leads</code>.
                  They see a read-only inbox, can mark leads as <em>contacted</em>, and can export
                  their own CSV. Only leads on a rule with a <em>Portal</em> destination are visible —
                  the client sees nothing by default.
                </p>
              </div>
            </div>
          </template>

          <template #ops>
            <div class="space-y-3 text-sm leading-relaxed">
              <p class="text-muted">
                An administrator must deploy <strong>leads-cron</strong> and configure the same
                internal token on the scheduler and Pages runtime. The jobs below are then automatic.
              </p>
              <table class="w-full text-xs border border-default rounded">
                <caption class="sr-only">
                  Lead recovery, health, and retention jobs managed by the leads-cron Worker
                </caption>
                <thead class="bg-elevated text-left">
                  <tr>
                    <th scope="col" class="px-2 py-1.5 font-medium">
                      Job
                    </th>
                    <th scope="col" class="px-2 py-1.5 font-medium">
                      Schedule
                    </th>
                    <th scope="col" class="px-2 py-1.5 font-medium">
                      Purpose
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr>
                    <td class="px-2 py-1.5">
                      Stuck-claim recovery
                    </td>
                    <td class="px-2 py-1.5">
                      Every 5 minutes
                    </td>
                    <td class="px-2 py-1.5 text-muted">
                      Recovers stuck rule deliveries and separately claims staged email evidence.
                      The email pass also evaluates endpoint health and alert state.
                    </td>
                  </tr>
                  <tr>
                    <td class="px-2 py-1.5">
                      Ingestion error purge
                    </td>
                    <td class="px-2 py-1.5">
                      Daily at 03:10 UTC
                    </td>
                    <td class="px-2 py-1.5 text-muted">
                      Deletes ingestion errors older than 30 days, expired signature nonces, and
                      bounded residual staged-email evidence.
                    </td>
                  </tr>
                  <tr>
                    <td class="px-2 py-1.5">
                      Retention purge
                    </td>
                    <td class="px-2 py-1.5">
                      Daily at 03:30 UTC
                    </td>
                    <td class="px-2 py-1.5 text-muted">
                      Soft-deletes leads in terminal states (delivered / archived) older than 18 months.
                    </td>
                  </tr>
                </tbody>
              </table>
              <p class="text-xs text-muted">
                <strong>Retries.</strong> Failed deliveries retry automatically up to 3 times with
                exponential backoff (1 min, 5 min, 15 min). After 3 attempts the delivery is marked
                <em>failed</em> — you'll see it in the lead detail's Delivery history. Click
                <em>Retry</em> to try again manually.
              </p>
              <p class="text-xs text-muted">
                <strong>Idempotency.</strong> The same lead submitted twice (same source +
                source_lead_id) is deduped — only one row is created. Safe to retry the webhook
                without creating dupes.
              </p>
            </div>
          </template>

          <template #troubleshoot>
            <div class="space-y-3 text-sm leading-relaxed">
              <div>
                <p class="font-medium mb-1">
                  "Send test data" works in Google Ads but no lead arrives
                </p>
                <ul class="list-disc list-inside text-muted space-y-1 ml-2">
                  <li>Check the URL and key are pasted exactly (no trailing whitespace).</li>
                  <li>If you rotated the key, Google Ads still has the old one — paste the new one.</li>
                  <li>Open the Inbox, clear filters, and enable <strong>Show test leads</strong>.</li>
                </ul>
              </div>
              <div>
                <p class="font-medium mb-1">
                  Slack messages aren't arriving
                </p>
                <ul class="list-disc list-inside text-muted space-y-1 ml-2">
                  <li>Verify the Slack incoming-webhook URL is still active (Slack disables old ones).</li>
                  <li>Check the rule's destination is toggled <em>Active</em>.</li>
                  <li>Click <em>Test fire</em> — if it fails, the error message tells you what's wrong.</li>
                  <li>Open the lead detail and look at <em>Delivery history</em> — failed deliveries show the error.</li>
                </ul>
              </div>
              <div>
                <p class="font-medium mb-1">
                  Email is not delivering
                </p>
                <ul class="list-disc list-inside text-muted space-y-1 ml-2">
                  <li>Resend (the email provider) requires verified sender domains. Confirm with admin.</li>
                  <li>Check the recipient's spam folder.</li>
                  <li>The email destination uses the agency's main "from" address — admin can change it in Settings.</li>
                </ul>
              </div>
              <div>
                <p class="font-medium mb-1">
                  Want to wipe a lead permanently
                </p>
                <p class="text-muted">
                  Soft-delete from the inbox just hides it. Admins can hard-delete via
                  <span class="font-mono text-xs">DELETE /api/leads/&lt;id&gt;/purge</span> for
                  GDPR/privacy-of-personal-data requests.
                </p>
              </div>
            </div>
          </template>
        </UAccordion>
      </div>
    </template>
  </UModal>
</template>
