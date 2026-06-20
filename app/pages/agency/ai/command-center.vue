<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'

definePageMeta({ layout: 'agency' })

interface Overview {
  proposals: Array<{ id: string, toolName: string, proposedBy: string, createdAt: string, expiresAt: string, summary: string }>
  openProposalCount: number
  audit: Array<{ id: string, toolName: string, riskTier: string, proposedBy: string, confirmedBy: string | null, outcome: string, resultRef: string | null, clientScoped: boolean, createdAt: string }>
  auditByTool: Array<{ toolName: string, executed: number, failed: number, total: number }>
  usage: { turns: number, costUsd: number, tokens: number }
  memory: { total: number, users: number }
}

const { data, pending, error, refresh } = await useFetch<Overview>('/api/agency/ai/command-center/overview')

const rel = (d: string) => {
  const t = new Date(d)
  return Number.isNaN(+t) ? d : formatDistanceToNow(t, { addSuffix: true })
}
const prettyTool = (t: string) => t.replace(/^propose_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const outcomeColor: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = {
  executed: 'success', failed: 'error', rolled_back: 'warning',
}
const riskColor: Record<string, 'neutral' | 'warning' | 'error'> = {
  auto: 'neutral', confirm: 'warning', rich_confirm: 'error',
}

const cards = computed(() => [
  { label: 'Open proposals', value: data.value?.openProposalCount ?? 0, icon: 'i-lucide-inbox' },
  { label: 'Turns (30d)', value: data.value?.usage.turns ?? 0, icon: 'i-lucide-messages-square' },
  { label: 'Spend (30d)', value: `$${(data.value?.usage.costUsd ?? 0).toFixed(2)}`, icon: 'i-lucide-dollar-sign' },
  { label: 'Tokens (30d)', value: (data.value?.usage.tokens ?? 0).toLocaleString(), icon: 'i-lucide-cpu' },
  { label: 'Memories', value: `${data.value?.memory.total ?? 0} · ${data.value?.memory.users ?? 0} ppl`, icon: 'i-lucide-brain' },
])
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header class="flex items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">AI Command Center</h1>
        <p class="text-sm text-muted">Observe — proposals, action audit, usage and memory across the co-pilot fleet.</p>
      </div>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="pending" @click="refresh()">Refresh</UButton>
    </header>

    <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert"
      title="Couldn’t load the Command Center" :description="(error as any)?.data?.statusMessage || 'You may not have access.'" />

    <template v-else>
      <!-- Summary cards -->
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <UCard v-for="c in cards" :key="c.label" :ui="{ body: 'p-4' }">
          <div class="flex items-center gap-2 text-muted">
            <UIcon :name="c.icon" class="size-4" />
            <span class="text-[10px] font-semibold uppercase tracking-wider">{{ c.label }}</span>
          </div>
          <p class="mt-1.5 text-lg font-semibold text-highlighted">{{ c.value }}</p>
        </UCard>
      </div>

      <!-- Open proposals -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-highlighted">Open proposals</h2>
            <UBadge color="neutral" variant="soft">{{ data?.openProposalCount ?? 0 }}</UBadge>
          </div>
        </template>
        <div v-if="!data?.proposals.length" class="py-6 text-center text-sm text-muted">No open proposals.</div>
        <ul v-else class="divide-y divide-default">
          <li v-for="p in data!.proposals" :key="p.id" class="flex items-center justify-between gap-3 py-2.5">
            <div class="min-w-0">
              <p class="truncate text-sm text-default"><span class="font-medium text-highlighted">{{ prettyTool(p.toolName) }}</span> — {{ p.summary || '—' }}</p>
              <p class="text-xs text-muted">by {{ p.proposedBy }} · {{ rel(p.createdAt) }}</p>
            </div>
            <UBadge color="warning" variant="soft" size="sm">awaiting confirm</UBadge>
          </li>
        </ul>
      </UCard>

      <!-- Action audit feed -->
      <UCard>
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">Action audit</h2>
        </template>
        <div v-if="!data?.audit.length" class="py-6 text-center text-sm text-muted">No actions executed yet.</div>
        <table v-else class="w-full text-sm">
          <thead>
            <tr class="text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
              <th class="pb-2 pr-3">Action</th>
              <th class="pb-2 pr-3">Risk</th>
              <th class="pb-2 pr-3">Proposed</th>
              <th class="pb-2 pr-3">Confirmed</th>
              <th class="pb-2 pr-3">Outcome</th>
              <th class="pb-2">When</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="a in data!.audit" :key="a.id">
              <td class="py-2 pr-3">
                <span class="font-medium text-default">{{ prettyTool(a.toolName) }}</span>
                <UBadge v-if="a.clientScoped" color="info" variant="soft" size="sm" class="ml-1">client</UBadge>
              </td>
              <td class="py-2 pr-3"><UBadge :color="riskColor[a.riskTier] || 'neutral'" variant="soft" size="sm">{{ a.riskTier }}</UBadge></td>
              <td class="py-2 pr-3 text-muted">{{ a.proposedBy }}</td>
              <td class="py-2 pr-3 text-muted">{{ a.confirmedBy || '—' }}</td>
              <td class="py-2 pr-3"><UBadge :color="outcomeColor[a.outcome] || 'neutral'" variant="soft" size="sm">{{ a.outcome }}</UBadge></td>
              <td class="py-2 text-muted">{{ rel(a.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <!-- Per-tool tally -->
      <UCard v-if="data?.auditByTool.length">
        <template #header>
          <h2 class="text-sm font-semibold text-highlighted">By tool</h2>
        </template>
        <ul class="divide-y divide-default">
          <li v-for="t in data!.auditByTool" :key="t.toolName" class="flex items-center justify-between py-2 text-sm">
            <span class="font-medium text-default">{{ prettyTool(t.toolName) }}</span>
            <span class="flex items-center gap-3 text-xs">
              <span class="text-success">{{ t.executed }} ok</span>
              <span v-if="t.failed" class="text-error">{{ t.failed }} failed</span>
              <span class="text-muted">{{ t.total }} total</span>
            </span>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>
