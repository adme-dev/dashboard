<script setup lang="ts">
definePageMeta({ layout: 'agency' })

interface McpTool { name: string, description: string }
interface MyToolsResponse {
  enabled: boolean
  workerOrigin: string
  role: string
  authority?: 'god_mode'
  tools: McpTool[]
}

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const data = ref<MyToolsResponse | null>(null)
const pending = ref(false)

async function refreshTools() {
  pending.value = true
  try {
    data.value = await apiFetch<MyToolsResponse>('/api/agency/ai/mcp/my-tools')
  } finally {
    pending.value = false
  }
}

await refreshTools()

const enabled = computed(() => data.value?.enabled ?? false)
const role = computed(() => data.value?.role ?? '')
const tools = computed(() => data.value?.tools ?? [])
const isGodMode = computed(() => data.value?.authority === 'god_mode')

const connectorUrl = computed(() => {
  const origin = (data.value?.workerOrigin || 'https://mcp-server.adme-dev.workers.dev').replace(/\/$/, '')
  return `${origin}/mcp`
})

const { copy, copied } = useClipboard({ source: connectorUrl })
const toast = useToast()
function copyUrl() {
  copy(connectorUrl.value)
  toast.add({ title: 'Connector URL copied', color: 'success' })
}

// Friendly label from a tool's snake_case name, e.g. get_finance_snapshot → Finance snapshot
function toolTitle(name: string) {
  const words = name.replace(/^get_/, '').replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const host = ref<'claude' | 'cursor' | 'chatgpt'>('claude')
const hostTabs = [
  { label: 'Claude', value: 'claude', icon: 'i-lucide-sparkles' },
  { label: 'Cursor', value: 'cursor', icon: 'i-lucide-square-terminal' },
  { label: 'ChatGPT', value: 'chatgpt', icon: 'i-lucide-message-square' },
]

const steps: Record<string, string[]> = {
  claude: [
    'Open Claude, then go to Settings → Connectors.',
    'Click “Add custom connector”.',
    'Paste the connector URL above and save.',
    'Click Connect, sign in with your XeroFlow account, and approve access.',
    'In a chat, ask: “Using XeroFlow, show me the finance snapshot.”',
  ],
  cursor: [
    'Open Cursor, then go to Settings → Tools & Integrations.',
    'Add a new MCP server and paste the connector URL above.',
    'Sign in with your XeroFlow account when prompted, and approve access.',
    'The XeroFlow tools now appear in the agent’s tool list.',
  ],
  chatgpt: [
    'Open Settings → Connectors (Developer Mode must be enabled by a workspace admin).',
    'Add a connector and paste the connector URL above.',
    'Sign in with your XeroFlow account and approve access.',
    'Ask ChatGPT to use a XeroFlow tool, e.g. “show me a client overview”.',
  ],
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Connect AI Assistants">
        <template #trailing>
          <UBadge
            :color="enabled ? 'success' : 'neutral'"
            :variant="enabled ? 'subtle' : 'outline'"
            :icon="enabled ? 'i-lucide-circle-check' : 'i-lucide-circle-pause'"
          >
            {{ enabled ? 'Active' : 'Unavailable' }}
          </UBadge>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <div class="max-w-3xl mx-auto space-y-6">
          <!-- Intro -->
          <div class="space-y-2">
            <h1 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">
              Use XeroFlow from inside Claude, Cursor, or ChatGPT
            </h1>
            <p class="text-sm text-[var(--ui-text-muted)] leading-relaxed">
              Connect your AI assistant to XeroFlow and ask it about your work in plain language —
              finance, ad spend, tasks, clients, briefs and more. Ordinary connections see only the
              role-scoped tools available to that user. Owners with active God mode also receive the
              registered write-capable suites, including audited Google Tag Manager operations.
            </p>
          </div>

          <UAlert
            v-if="isGodMode"
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-alert"
            title="Owner God mode is active"
            description="This connector includes audited mutation tools. Live Google Tag Manager publishing and rollback use exact resource IDs, provider read-back, idempotency and the dedicated God-mode execution ledger."
          />

          <UAlert
            v-if="!enabled"
            color="warning"
            variant="subtle"
            icon="i-lucide-circle-pause"
            title="Connector is currently turned off"
            description="An administrator needs to enable the MCP server before connections will work. Steps below still apply once it’s on."
          />

          <!-- Connector URL — the signature block -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-plug" class="w-5 h-5 text-[var(--ui-text-muted)]" />
                <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Connector URL</h2>
              </div>
            </template>

            <div class="space-y-3">
              <p class="text-sm text-[var(--ui-text-muted)]">
                Paste this into your assistant’s custom-connector setup.
              </p>
              <div class="flex items-stretch gap-2">
                <div
                  class="flex-1 min-w-0 flex items-center gap-2 rounded-md border border-[var(--ui-border)] bg-[var(--ui-bg-muted)] px-3 py-2"
                >
                  <span class="size-2 rounded-full shrink-0" :class="enabled ? 'bg-emerald-500' : 'bg-[var(--ui-text-dimmed)]'" />
                  <code class="truncate font-mono text-sm text-[var(--ui-text-highlighted)]">{{ connectorUrl }}</code>
                </div>
                <UButton
                  :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
                  :color="copied ? 'success' : 'neutral'"
                  variant="subtle"
                  :label="copied ? 'Copied' : 'Copy'"
                  @click="copyUrl"
                />
              </div>
              <p class="text-xs text-[var(--ui-text-dimmed)]">
                Works with Claude (Pro, Max, Team, Enterprise) and Cursor today. ChatGPT needs a
                Team, Business, or Enterprise workspace with Developer Mode enabled by an admin —
                it isn’t available on Plus or Pro.
              </p>
            </div>
          </UCard>

          <!-- Setup steps -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-list-checks" class="w-5 h-5 text-[var(--ui-text-muted)]" />
                <h2 class="font-semibold text-[var(--ui-text-highlighted)]">Set it up</h2>
              </div>
            </template>

            <div class="space-y-4">
              <UTabs v-model="host" :items="hostTabs" :content="false" />
              <ol class="space-y-3">
                <li
                  v-for="(step, i) in steps[host]"
                  :key="i"
                  class="flex gap-3 text-sm"
                >
                  <span
                    class="shrink-0 size-6 rounded-full grid place-items-center text-xs font-semibold bg-[var(--ui-bg-elevated)] text-[var(--ui-text-highlighted)] ring-1 ring-[var(--ui-border)]"
                  >{{ i + 1 }}</span>
                  <span class="text-[var(--ui-text)] leading-relaxed pt-0.5">{{ step }}</span>
                </li>
              </ol>
            </div>
          </UCard>

          <!-- What you can do (live, role-scoped) -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-wrench" class="w-5 h-5 text-[var(--ui-text-muted)]" />
                  <h2 class="font-semibold text-[var(--ui-text-highlighted)]">What your assistant can do</h2>
                </div>
                <div class="flex items-center gap-2">
                  <UBadge v-if="role" color="neutral" variant="subtle" class="capitalize">{{ role }}</UBadge>
                  <UBadge color="primary" variant="subtle">{{ tools.length }} tools</UBadge>
                </div>
              </div>
            </template>

            <div class="space-y-3">
              <p class="text-sm text-[var(--ui-text-muted)]">
                These are the exact tools available to this connection.
                <template v-if="isGodMode">
                  Owner God mode exposes the complete registered catalog, including separately
                  audited write suites. Google Tag Manager changes still follow draft, publish,
                  verify and rollback boundaries.
                </template>
                <template v-else>
                  Most look up your data; creative roles also get owned-media generation and video
                  discovery. Platform mutation suites are not exposed.
                </template>
              </p>

              <div v-if="pending" class="text-sm text-[var(--ui-text-dimmed)]">Loading your tools…</div>
              <div v-else-if="!tools.length" class="text-sm text-[var(--ui-text-dimmed)]">
                Your role doesn’t have any AI tools enabled yet.
              </div>
              <div v-else class="grid sm:grid-cols-2 gap-2">
                <div
                  v-for="t in tools"
                  :key="t.name"
                  class="rounded-md border border-[var(--ui-border)] p-3"
                >
                  <div class="flex items-center gap-2">
                    <UIcon name="i-lucide-circle-check" class="w-4 h-4 text-emerald-500 shrink-0" />
                    <span class="text-sm font-medium text-[var(--ui-text-highlighted)]">{{ toolTitle(t.name) }}</span>
                  </div>
                  <p class="mt-1 text-xs text-[var(--ui-text-muted)] leading-relaxed line-clamp-2">{{ t.description }}</p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- How it stays safe -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-[var(--ui-text-muted)]" />
                <h2 class="font-semibold text-[var(--ui-text-highlighted)]">How it stays safe</h2>
              </div>
            </template>

            <ul class="space-y-2.5 text-sm text-[var(--ui-text)]">
              <li class="flex gap-2.5">
                <UIcon name="i-lucide-user-check" class="w-4 h-4 mt-0.5 text-[var(--ui-text-muted)] shrink-0" />
                <span><span class="font-medium">Signs in as you.</span> The assistant connects with your own XeroFlow login and sees only what your role allows.</span>
              </li>
              <li class="flex gap-2.5">
                <UIcon name="i-lucide-eye" class="w-4 h-4 mt-0.5 text-[var(--ui-text-muted)] shrink-0" />
                <span v-if="isGodMode"><span class="font-medium">Writes cross a dedicated boundary.</span> Owner mutations run through the trusted God-mode coordinator and its external-provider dispatch ledger; ordinary browser GTM controls do not depend on this MCP path.</span>
                <span v-else><span class="font-medium">No platform writes.</span> It looks things up and can generate permitted owned media, but registered mutation suites are not exposed.</span>
              </li>
              <li class="flex gap-2.5">
                <UIcon name="i-lucide-scroll-text" class="w-4 h-4 mt-0.5 text-[var(--ui-text-muted)] shrink-0" />
                <span><span class="font-medium">Every request is logged.</span> Each tool call is recorded in the AI audit trail for accountability.</span>
              </li>
              <li class="flex gap-2.5">
                <UIcon name="i-lucide-clock" class="w-4 h-4 mt-0.5 text-[var(--ui-text-muted)] shrink-0" />
                <span><span class="font-medium">Access is explicit.</span> Tool availability is projected from the signed-in identity, current role, suite flags and active owner authority on every connection.</span>
              </li>
            </ul>
          </UCard>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
