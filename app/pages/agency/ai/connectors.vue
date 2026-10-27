<script setup lang="ts">
definePageMeta({ layout: 'agency' })

interface McpTool { name: string, description: string, requiresWriteScope?: boolean }
interface MyToolsResponse {
  enabled: boolean
  workerOrigin: string
  role: string
  authority?: 'god_mode'
  preview: { assumedScopes: string[], projection: 'owner' | 'management' | 'staff' }
  marketingCapabilities?: string[]
  access?: {
    permissionGroups: string[]
    readOnly: boolean
    clientScope: { mode: 'assigned' | 'all_active', assignedClientCount: number | null }
  }
  tools: McpTool[]
}

const { data, pending, error, refresh } = useFetch<MyToolsResponse>('/api/agency/ai/mcp/my-tools', { lazy: true })
const refreshFailed = ref(false)
const loadFailed = computed(() => Boolean(error.value) || refreshFailed.value)
async function refreshTools() {
  refreshFailed.value = false
  try {
    await refresh()
  } catch {
    refreshFailed.value = true
  }
}

const isGodMode = computed(() => data.value?.authority === 'god_mode')
const tools = computed(() => data.value?.tools ?? [])
const connectorUrl = computed(() => {
  const origin = (data.value?.workerOrigin || 'https://mcp-server.adme-dev.workers.dev').replace(/\/$/, '')
  return `${origin}/mcp`
})
const clientScopeLabel = computed(() => {
  const scope = data.value?.access?.clientScope
  if (!scope) return 'Client scope unavailable'
  if (scope.mode === 'all_active') return 'All active clients'
  if (!scope.assignedClientCount) return 'No active client assignments'
  return `${scope.assignedClientCount} assigned active ${scope.assignedClientCount === 1 ? 'client' : 'clients'}`
})
const { copy, copied } = useClipboard({ source: connectorUrl })
const toast = useToast()
async function copyUrl() {
  try {
    await copy(connectorUrl.value)
    toast.add({ title: 'Connector URL copied', color: 'success' })
  } catch {
    toast.add({ title: 'Could not copy URL', description: 'Select and copy the URL shown here.', color: 'error' })
  }
}
function toolTitle(name: string) {
  const words = name.replace(/^get_/, '').replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const host = ref<'claude' | 'cursor' | 'chatgpt'>('claude')
const hostTabs = [
  { label: 'Claude', value: 'claude', icon: 'i-lucide-sparkles' },
  { label: 'ChatGPT', value: 'chatgpt', icon: 'i-lucide-message-square' },
  { label: 'Cursor', value: 'cursor', icon: 'i-lucide-square-terminal' },
]
const hostGuides = {
  claude: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
  chatgpt: 'https://developers.openai.com/plugins/deploy/connect-chatgpt',
  cursor: 'https://cursor.com/docs/mcp',
}
const steps = {
  claude: [
    'On Pro/Max, open Customize → Connectors → + Add → Add custom connector. Enter the name and connector URL.',
    'On Team/Enterprise, an authorized owner first adds the custom Web connector in Organization settings → Connectors. Members then open Customize → Connectors and choose Connect.',
    'Sign in with your own XeroFlow account. Review the requested OAuth scopes and tool approvals; enable only the tools you need in your conversation.',
  ],
  chatgpt: [
    'On the web, open Plugins → + → Add custom MCP server. Enter the connection details and the full connector URL.',
    'Review authentication and the risk notice, create the plugin, then install it. Sign in with your own XeroFlow account and review the requested permissions.',
    'Start a new Work chat, type @ and select the plugin. Review any action confirmations shown. After tool or authentication changes, open the plugin and select Refresh.',
  ],
  cursor: [
    'Open Cursor’s Customize page to manage MCP servers, or follow the official guide to add a remote server URL in mcp.json.',
    'Use the full connector URL with Streamable HTTP and complete XeroFlow OAuth using your own account.',
    'Review the available tools and requested approvals before asking the agent to use XeroFlow.'
  ],
}
</script>

<template>
  <div class="flex-1 min-w-0 min-h-0">
    <UDashboardPanel :ui="{ root: 'max-h-svh' }">
      <UDashboardNavbar title="Connect AI Assistants">
        <template #trailing>
          <UBadge v-if="data && !pending && !loadFailed" :color="data.enabled ? 'success' : 'neutral'" variant="subtle">
            {{ data.enabled ? 'Server enabled' : 'Server unavailable' }}
          </UBadge>
        </template>
      </UDashboardNavbar>
      <div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
        <div class="max-w-3xl space-y-8">
          <div class="space-y-2">
            <h1 class="text-lg font-semibold text-highlighted">
              Bring your assigned work into your AI assistant
            </h1>
            <p class="text-sm text-muted leading-relaxed">
              Connect with your XeroFlow login to read permitted campaign data and prepare reviewed work.
              Your current permissions, client assignments and capability grants determine the tools you can use.
            </p>
          </div>

          <section aria-labelledby="setup-heading" class="space-y-4">
            <h2 id="setup-heading" class="font-semibold text-highlighted">Connect your assistant</h2>
            <p class="text-sm text-muted">Use this full URL in your assistant’s remote MCP setup.</p>
            <div class="flex flex-wrap items-center gap-2">
              <code class="flex-1 min-w-0 break-all rounded-md border border-default bg-elevated px-3 py-2 text-sm text-highlighted">{{ connectorUrl }}</code>
              <UButton
                :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                color="neutral"
                variant="subtle"
                :label="copied ? 'Copied' : 'Copy'"
                @click="copyUrl"
              />
            </div>
            <UTabs v-model="host" :items="hostTabs" :content="false" />
            <ol class="list-decimal space-y-3 pl-5 text-sm text-default leading-relaxed">
              <li v-for="step in steps[host]" :key="step" class="pl-1">
                {{ step }}
              </li>
            </ol>
            <p v-if="host === 'claude'" class="text-sm text-muted">
              Custom remote connectors are available on Free (one connector), Pro, Max, Team and Enterprise.
              Organization controls apply. Review “Allow always” carefully; disable write tools when using Research.
            </p>
            <p v-else-if="host === 'chatgpt'" class="text-sm text-muted">
              Full modify/write MCP support depends on your plan, workspace policy and rollout.
              Check official availability before enabling writes; this page does not verify your ChatGPT plan.
            </p>
            <UButton
              :to="hostGuides[host]"
              target="_blank"
              rel="noopener noreferrer"
              color="neutral"
              variant="link"
              icon="i-lucide-external-link"
              label="Official setup guide"
            />
          </section>

          <section aria-labelledby="access-heading" class="border-t border-default pt-6 space-y-4" :aria-busy="pending">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 id="access-heading" class="font-semibold text-highlighted">Your access preview</h2>
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-refresh-cw"
                :loading="pending"
                label="Refresh access"
                @click="refreshTools"
              />
            </div>
            <div v-if="pending" role="status" class="flex items-center gap-2 text-sm text-muted">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin motion-reduce:animate-none" />
              Loading your access preview…
            </div>
            <div v-else-if="loadFailed" role="alert" class="space-y-3">
              <UAlert
                color="error"
                variant="subtle"
                title="Could not load your access preview"
                description="Retry to check your current permissions. If this continues, sign in again or ask an administrator to check your account."
              />
              <UButton
                color="neutral"
                variant="outline"
                label="Retry"
                @click="refreshTools"
              />
            </div>
            <template v-else-if="data">
              <p class="text-sm text-muted">
                This is a preview, not a live OAuth grant or a test of your assistant connection.
                Actual host tools can be narrower. XeroFlow checks current authority again on every request.
              </p>
              <p class="text-xs text-muted">
                Assumed scopes: {{ data.preview.assumedScopes.join(', ') }}
              </p>
              <UAlert
                v-if="!data.enabled"
                color="warning"
                variant="subtle"
                title="Connector is currently turned off"
                description="An administrator must enable the MCP server before connections work. The preview below describes configured access only."
              />
              <UAlert
                v-if="isGodMode"
                color="warning"
                variant="subtle"
                title="Owner God mode is active"
                description="This separate owner preview includes the registered catalog and audited write suites. Provider gates and dedicated execution boundaries still apply; it is not evidence of an external host grant or a successful action."
              />
              <template v-else>
                <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
                  <div>
                    <dt class="text-muted">
                      Current role
                    </dt><dd class="mt-1 text-highlighted">
                      {{ data.role || 'No role' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Client scope
                    </dt><dd class="mt-1 text-highlighted">
                      {{ clientScopeLabel }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Effective permission groups
                    </dt><dd class="mt-1 text-highlighted">
                      {{ data.access?.permissionGroups.join(', ') || 'None' }}
                    </dd>
                  </div>
                  <div>
                    <dt class="text-muted">
                      Write policy
                    </dt><dd class="mt-1 text-highlighted">
                      {{ data.access?.readOnly ? 'Read-only policy' : 'Writes still require a grant, scope and operation checks' }}
                    </dd>
                  </div>
                  <div class="sm:col-span-2">
                    <dt class="text-muted">
                      Marketing capability grants
                    </dt><dd class="mt-1 text-highlighted">
                      {{ data.marketingCapabilities?.join(', ') || 'No marketing capabilities granted' }}
                    </dd>
                  </div>
                </dl>
                <p v-if="data.access?.clientScope.mode === 'assigned' && !data.access.clientScope.assignedClientCount" class="text-sm text-muted">
                  Ask an administrator to assign your active clients. No assignments means no client data access.
                </p>
              </template>
              <p v-if="!tools.length" class="text-sm text-muted">
                No tools are available in this preview. Ask an administrator to check your permissions, assignments and grants.
              </p>
              <div v-else class="space-y-3">
                <p class="text-sm font-medium text-highlighted">
                  {{ tools.length }} tools in this preview
                </p>
                <ul class="divide-y divide-default">
                  <li v-for="tool in tools" :key="tool.name" class="py-3 space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-highlighted">{{ toolTitle(tool.name) }}</span>
                      <UBadge
                        v-if="tool.requiresWriteScope"
                        color="warning"
                        variant="subtle"
                        size="sm"
                      >
                        Requires mcp:write
                      </UBadge>
                    </div>
                    <p class="text-xs text-muted leading-relaxed">
                      {{ tool.description }}
                    </p>
                  </li>
                </ul>
                <p v-if="tools.some(tool => tool.name === 'get_campaign_breakdown')" class="text-sm text-muted">
                  Try: “Show stored campaign performance for one of my assigned clients, including the reporting period and coverage gaps.”
                </p>
                <p v-if="tools.some(tool => tool.name === 'create_social_post_draft')" class="text-sm text-muted">
                  Try: “Prepare a social draft for my assigned client, then submit the exact revision for independent review.”
                </p>
              </div>
            </template>
          </section>

          <section aria-labelledby="readiness-heading" class="border-t border-default pt-6 space-y-3">
            <h2 id="readiness-heading" class="font-semibold text-highlighted">Check each provider separately</h2>
            <p class="text-sm text-muted leading-relaxed">
              Connecting ChatGPT, Claude or Cursor authorizes access to XeroFlow. Provider OAuth is separate.
              A connected account can support one operation while another is unavailable. Stored reports do not refresh providers.
            </p>
            <p class="text-sm text-muted leading-relaxed">
              Social drafts require an independent owner/admin to approve the exact revision in XeroFlow before dispatch.
              Edits, expiry or revoked access can require a new review. TikTok publishing remains unavailable pending product eligibility and app approval; OAuth alone cannot enable it.
            </p>
            <p class="text-sm text-muted leading-relaxed">
              Owner MCP mutations use a dedicated execution boundary; ordinary browser GTM controls do not depend on this MCP path.
              Open the tracking manager to use your existing browser controls.
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                to="/agency/tracking"
                color="neutral"
                variant="outline"
                label="Tracking manager"
              />
              <UButton
                to="/agency/social/publishing/accounts"
                color="neutral"
                variant="outline"
                label="Publishing account readiness"
              />
              <UButton
                to="/agency/social"
                color="neutral"
                variant="outline"
                label="Advertising connections"
              />
            </div>
          </section>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
