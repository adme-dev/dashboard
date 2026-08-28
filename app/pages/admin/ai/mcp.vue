<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['role-admin'] })

interface McpAdminStatus {
  enabled: boolean
  workerOrigin: string
  authority: 'god_mode' | 'governed'
  role: string
  toolCount: number
  tools: Array<{ name: string, description: string }>
  suites: Array<{ key: string }>
  suiteFlags: Record<string, boolean>
  safeguards: {
    writeScopeRequired: boolean
    emergencyDisabled: boolean
    internalSecretConfigured: boolean
    requestSigningSecretConfigured: boolean
    internalExecutionSecretConfigured: boolean
  }
  recentAudit: Array<{ id: string, tool: string, phase: string, outcome: string, createdAt: string }>
}

const apiFetch = $fetch as <T>(request: string) => Promise<T>
const toast = useToast()
const data = ref<McpAdminStatus | null>(null)
const pending = ref(false)

const auditColumns = [
  { accessorKey: 'createdAt', header: 'Time' },
  { accessorKey: 'tool', header: 'Tool' },
  { accessorKey: 'phase', header: 'Phase' },
  { accessorKey: 'outcome', header: 'Outcome' }
]
type Audit = McpAdminStatus['recentAudit'][number]
const auditRow = (row: unknown): Audit => ((row as { original?: Audit }).original ?? row) as Audit

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function title(value: string) {
  return value.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as { data?: { statusMessage?: string }, message?: string }
  return candidate.data?.statusMessage || candidate.message || fallback
}

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<McpAdminStatus>('/api/admin/ai/mcp/status')
  } catch (error: unknown) {
    toast.add({ title: 'MCP status could not be loaded', description: errorMessage(error, 'Try again.'), color: 'error' })
  } finally {
    pending.value = false
  }
}

await refresh()

const secretHealth = computed(() => data.value
  ? [
      data.value.safeguards.internalSecretConfigured,
      data.value.safeguards.requestSigningSecretConfigured,
      data.value.safeguards.internalExecutionSecretConfigured
    ].filter(Boolean).length
  : 0)
</script>

<template>
  <UDashboardPanel>
    <UDashboardNavbar title="AI & MCP operations">
      <template #leading>
        <UDashboardSidebarCollapse />
      </template>
      <template #trailing>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          label="Refresh"
          :loading="pending"
          @click="refresh"
        />
      </template>
    </UDashboardNavbar>

    <div class="flex-1 overflow-y-auto p-4 sm:p-6">
      <div class="mx-auto max-w-6xl space-y-6">
        <section v-if="data" class="overflow-hidden rounded-xl border border-default bg-default">
          <div class="border-b border-default bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div class="max-w-3xl">
                <p class="text-sm font-medium text-primary">
                  External assistant gateway
                </p>
                <h1 class="mt-1 text-2xl font-semibold tracking-tight text-highlighted">
                  Registered capability, exact authority
                </h1>
                <p class="mt-2 text-sm leading-6 text-muted">
                  Every tools list is projected fresh inside XeroFlow. Owner authority expands the registered catalog; it never turns unregistered API routes into tools.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UBadge :color="data.enabled ? 'success' : 'error'" variant="subtle">
                  {{ data.enabled ? 'MCP active' : 'MCP disabled' }}
                </UBadge>
                <UBadge :color="data.authority === 'god_mode' ? 'warning' : 'neutral'" variant="subtle">
                  {{ data.authority === 'god_mode' ? 'God mode' : 'Governed' }}
                </UBadge>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 divide-y divide-default sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <div class="p-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Registered suites
              </p><p class="mt-2 text-2xl font-semibold text-highlighted">
                {{ data.suites.length }}
              </p>
            </div>
            <div class="p-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Available tools
              </p><p class="mt-2 text-2xl font-semibold text-highlighted">
                {{ data.toolCount }}
              </p>
            </div>
            <div class="p-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Secret boundaries
              </p><p class="mt-2 text-2xl font-semibold text-highlighted">
                {{ secretHealth }}/3
              </p>
            </div>
            <div class="p-4">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Emergency control
              </p><p class="mt-2 text-lg font-semibold" :class="data.safeguards.emergencyDisabled ? 'text-error' : 'text-success'">
                {{ data.safeguards.emergencyDisabled ? 'Disabled' : 'Clear' }}
              </p>
            </div>
          </div>
        </section>

        <div v-if="data" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UCard>
            <template #header>
              <div>
                <h2 class="font-semibold text-highlighted">
                  Capability suites
                </h2><p class="mt-1 text-sm text-muted">
                  The single authoritative MCP registry.
                </p>
              </div>
            </template>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div v-for="suite in data.suites" :key="suite.key" class="flex items-center gap-3 rounded-lg border border-default p-3">
                <div class="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
                  <UIcon name="i-lucide-box" class="size-4" />
                </div>
                <span class="text-sm font-medium text-highlighted">{{ title(suite.key) }}</span>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <h2 class="font-semibold text-highlighted">
                  Runtime safeguards
                </h2><p class="mt-1 text-sm text-muted">
                  Presence checks only. Secret values never leave deployment storage.
                </p>
              </div>
            </template>
            <div class="space-y-3">
              <div
                v-for="item in [
                  { label: 'Worker service authentication', ok: data.safeguards.internalSecretConfigured, ready: 'Ready', missing: 'Missing' },
                  { label: 'Exact-request signing', ok: data.safeguards.requestSigningSecretConfigured, ready: 'Ready', missing: 'Missing' },
                  { label: 'Internal owner execution', ok: data.safeguards.internalExecutionSecretConfigured, ready: 'Ready', missing: 'Missing' },
                  { label: 'Ordinary-user write scope', ok: data.safeguards.writeScopeRequired, ready: 'Required', missing: 'Optional' }
                ]"
                :key="item.label"
                class="flex items-center justify-between gap-4 rounded-lg bg-elevated p-3"
              >
                <span class="text-sm text-highlighted">{{ item.label }}</span>
                <UBadge :color="item.ok || item.missing === 'Optional' ? 'success' : 'warning'" variant="subtle">
                  {{ item.ok ? item.ready : item.missing }}
                </UBadge>
              </div>
            </div>
          </UCard>
        </div>

        <UCard v-if="data">
          <template #header>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Operator links
                </h2><p class="mt-1 text-sm text-muted">
                  Inspect the current user projection or connect an external assistant.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  to="/agency/ai/connectors"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-plug"
                  label="Connect AI assistant"
                />
                <UButton
                  to="/agency/ai/my-assistant"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-user-cog"
                  label="My Assistant"
                />
                <UButton
                  to="/admin/ai/model-ops"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-brain-circuit"
                  label="Model Ops"
                />
              </div>
            </div>
          </template>
          <div class="rounded-lg border border-default bg-elevated/50 p-3 font-mono text-xs text-muted">
            {{ data.workerOrigin.replace(/\/$/, '') }}/mcp
          </div>
        </UCard>

        <UCard v-if="data">
          <template #header>
            <div class="flex items-center justify-between gap-4">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Recent owner MCP audit
                </h2><p class="mt-1 text-sm text-muted">
                  Immutable attempt and terminal events. Arguments and secrets are not shown.
                </p>
              </div><UBadge color="neutral" variant="subtle">
                {{ data.recentAudit.length }}
              </UBadge>
            </div>
          </template>
          <UTable :columns="auditColumns" :data="data.recentAudit">
            <template #createdAt-cell="{ row }">
              <span class="text-sm text-muted">{{ formatDate(auditRow(row).createdAt) }}</span>
            </template>
            <template #tool-cell="{ row }">
              <code class="text-xs text-highlighted">{{ auditRow(row).tool }}</code>
            </template>
            <template #phase-cell="{ row }">
              <UBadge :color="auditRow(row).phase === 'failed' ? 'error' : auditRow(row).phase === 'succeeded' ? 'success' : 'neutral'" variant="subtle">
                {{ auditRow(row).phase }}
              </UBadge>
            </template>
            <template #outcome-cell="{ row }">
              <span class="text-sm text-muted">{{ title(auditRow(row).outcome) }}</span>
            </template>
          </UTable>
        </UCard>
      </div>
    </div>
  </UDashboardPanel>
</template>
