<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const sections = [
  {
    label: 'Quick start (5-min overview)',
    icon: 'i-lucide-rocket',
    slot: 'quickstart',
  },
  {
    label: 'Set up a Google Ads lead form',
    icon: 'i-lucide-chrome',
    slot: 'google',
  },
  {
    label: 'Set up a Meta (Facebook / Instagram) lead form',
    icon: 'i-lucide-facebook',
    slot: 'meta',
  },
  {
    label: 'Configure routing rules + destinations',
    icon: 'i-lucide-list-checks',
    slot: 'rules',
  },
  {
    label: 'Filters, delays, and templates',
    icon: 'i-lucide-filter',
    slot: 'advanced',
  },
  {
    label: 'Manual leads + the client portal',
    icon: 'i-lucide-user-plus',
    slot: 'manual',
  },
  {
    label: 'How retries, retention, and crons work',
    icon: 'i-lucide-cog',
    slot: 'ops',
  },
  {
    label: 'Troubleshooting',
    icon: 'i-lucide-life-buoy',
    slot: 'troubleshoot',
  },
]
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-3xl' }">
    <template #content>
      <div class="p-6 max-h-[80vh] overflow-y-auto">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h2 class="text-xl font-semibold">Leads engine setup guide</h2>
            <p class="text-sm text-muted mt-1">
              How to capture, route, and follow up on Meta + Google ad inquiries.
            </p>
          </div>
          <UButton variant="ghost" icon="i-lucide-x" @click="open = false" />
        </div>

        <UAccordion :items="sections" multiple>
          <template #quickstart>
            <div class="space-y-3 text-sm leading-relaxed">
              <p class="text-muted">From zero to your first lead in under 10 minutes.</p>
              <ol class="list-decimal list-inside space-y-2">
                <li>
                  <strong>Generate a webhook URL.</strong> Go to
                  <span class="font-mono text-xs">Settings → Social → Google → Lead webhooks</span>
                  and click <em>Show URL &amp; key</em> for the client. Each client gets a unique URL
                  + secret key.
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
                title="No setup needed for crons"
                description="Stuck-delivery recovery and old-lead cleanup run automatically. You don't configure these — they're operational."
              />
            </div>
          </template>

          <template #google>
            <div class="space-y-3 text-sm leading-relaxed">
              <ol class="list-decimal list-inside space-y-3">
                <li>
                  In this dashboard, open
                  <span class="font-mono text-xs">Settings → Social → Google → Lead webhooks</span>.
                </li>
                <li>
                  Find the client and click <em>Show URL &amp; key</em>. Copy both.
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
                description="The Lead webhooks settings page has a Rotate button. Old keys stop working immediately — you'll need to update Google Ads with the new value."
              />
            </div>
          </template>

          <template #meta>
            <div class="space-y-3 text-sm leading-relaxed">
              <p class="text-muted">
                Meta lead forms use a shared verify token rather than per-client URLs. The agency
                operator (admin) sets the token once; marketers paste it into each Meta lead form.
              </p>
              <ol class="list-decimal list-inside space-y-2">
                <li>
                  Ask your admin for the <strong>Meta verify token</strong>
                  (env var <code class="text-xs bg-elevated px-1 py-0.5 rounded">META_LEADGEN_VERIFY_TOKEN</code>).
                </li>
                <li>
                  In Meta Business Suite → Lead Center → CRM Integrations, choose
                  <em>Custom CRM</em>.
                </li>
                <li>
                  Set the <strong>Callback URL</strong> to:<br>
                  <code class="text-xs bg-elevated px-2 py-1 rounded">https://agency-dashboard-6cm.pages.dev/api/leads/webhook/meta</code>
                </li>
                <li>
                  Set the <strong>Verify token</strong> to the value from step 1.
                </li>
                <li>
                  Meta sends a verification GET request — the dashboard responds with the
                  challenge if the token matches. Lead capture is then live.
                </li>
              </ol>
              <UAlert
                color="warning"
                variant="subtle"
                icon="i-lucide-construction"
                title="Phase 1 limitation"
                description="The Meta verify endpoint is live and accepts the handshake, but full Meta lead ingestion (subscribing to lead-form events + processing the payload) ships in Phase 2."
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
              <p class="font-medium pt-1">To configure:</p>
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
                        <td class="px-2 py-1.5 font-medium">Slack</td>
                        <td class="px-2 py-1.5 text-muted">Posts a message to a channel via webhook URL</td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">Email</td>
                        <td class="px-2 py-1.5 text-muted">Sends to one or more recipients (comma-separated)</td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">Webhook</td>
                        <td class="px-2 py-1.5 text-muted">POSTs the lead JSON to a custom URL</td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">Google Sheets</td>
                        <td class="px-2 py-1.5 text-muted">Appends a row to a spreadsheet</td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">Portal</td>
                        <td class="px-2 py-1.5 text-muted">Makes the lead visible on the client's portal inbox</td>
                      </tr>
                      <tr>
                        <td class="px-2 py-1.5 font-medium">Assign user</td>
                        <td class="px-2 py-1.5 text-muted">Auto-assigns to an account manager (round-robin or fixed)</td>
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
                <p class="font-medium mb-1">Filters</p>
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
                <p class="font-medium mb-1">Delays</p>
                <p class="text-muted">
                  Each destination can be delayed up to 12 hours. Common pattern: send to Slack
                  immediately, send a follow-up email after 30 minutes if no one's claimed the lead.
                </p>
              </div>
              <div>
                <p class="font-medium mb-1">Email + webhook templates</p>
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
                <p class="font-medium mb-1">Adding a lead manually</p>
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
                <p class="font-medium mb-1">Client portal access</p>
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
                The dashboard runs three background jobs automatically. You don't configure these —
                they exist to keep the system healthy.
              </p>
              <table class="w-full text-xs border border-default rounded">
                <thead class="bg-elevated text-left">
                  <tr>
                    <th class="px-2 py-1.5 font-medium">Job</th>
                    <th class="px-2 py-1.5 font-medium">Schedule</th>
                    <th class="px-2 py-1.5 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-default">
                  <tr>
                    <td class="px-2 py-1.5">Stuck-claim recovery</td>
                    <td class="px-2 py-1.5">Every 5 minutes</td>
                    <td class="px-2 py-1.5 text-muted">Resets deliveries that started but didn't finish — usually means a worker crashed mid-flight.</td>
                  </tr>
                  <tr>
                    <td class="px-2 py-1.5">Ingestion error purge</td>
                    <td class="px-2 py-1.5">Daily at 03:10 UTC</td>
                    <td class="px-2 py-1.5 text-muted">Deletes raw-payload error rows older than 30 days.</td>
                  </tr>
                  <tr>
                    <td class="px-2 py-1.5">Retention purge</td>
                    <td class="px-2 py-1.5">Daily at 03:30 UTC</td>
                    <td class="px-2 py-1.5 text-muted">Soft-deletes leads in terminal states (delivered / archived) older than 18 months.</td>
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
                <p class="font-medium mb-1">"Send test data" works in Google Ads but no lead arrives</p>
                <ul class="list-disc list-inside text-muted space-y-1 ml-2">
                  <li>Check the URL and key are pasted exactly (no trailing whitespace).</li>
                  <li>If you rotated the key, Google Ads still has the old one — paste the new one.</li>
                  <li>Open the Inbox and clear filters — the lead may have arrived but be hidden.</li>
                </ul>
              </div>
              <div>
                <p class="font-medium mb-1">Slack messages aren't arriving</p>
                <ul class="list-disc list-inside text-muted space-y-1 ml-2">
                  <li>Verify the Slack incoming-webhook URL is still active (Slack disables old ones).</li>
                  <li>Check the rule's destination is toggled <em>Active</em>.</li>
                  <li>Click <em>Test fire</em> — if it fails, the error message tells you what's wrong.</li>
                  <li>Open the lead detail and look at <em>Delivery history</em> — failed deliveries show the error.</li>
                </ul>
              </div>
              <div>
                <p class="font-medium mb-1">Email is not delivering</p>
                <ul class="list-disc list-inside text-muted space-y-1 ml-2">
                  <li>Resend (the email provider) requires verified sender domains. Confirm with admin.</li>
                  <li>Check the recipient's spam folder.</li>
                  <li>The email destination uses the agency's main "from" address — admin can change it in Settings.</li>
                </ul>
              </div>
              <div>
                <p class="font-medium mb-1">Want to wipe a lead permanently</p>
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
