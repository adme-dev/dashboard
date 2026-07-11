<script setup lang="ts">
definePageMeta({ title: 'Monday Evidence Preview', middleware: ['auth'] })

type Evidence = { mondayBoardId: string; mondayItemId: string; taskId: string | null; title: string; assigneeId: string | null; dueDate: string | null; taskStatus: string | null; isBlocked: boolean; sourceCreatedAt: string | null }
const toast = useToast()
const loading = ref(true)
const result = ref<{ active: boolean; reason?: string; evidence: Evidence[]; limitations: string[] } | null>(null)
onMounted(async () => {
  try { result.value = await $fetch('/api/agency/hr/monday/evidence') as typeof result.value }
  catch (error: any) { toast.add({ title: 'Evidence preview unavailable', description: error?.data?.statusMessage, color: 'error' }) }
  finally { loading.value = false }
})
</script>

<template>
  <main class="h-full min-h-0 overflow-y-auto bg-default">
    <header class="border-b border-default bg-elevated/30"><div class="mx-auto max-w-7xl px-5 py-8 sm:px-8"><p class="font-mono text-xs uppercase tracking-[0.18em] text-primary">Owner-only preview</p><h1 class="mt-2 text-3xl font-semibold text-highlighted">Monday evidence</h1><p class="mt-3 max-w-3xl text-sm leading-6 text-muted">A bounded view of already-synced task metadata. This screen does not import records, inspect communications, or score people.</p></div></header>
    <section class="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">
      <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Evidence scope" to="/agency/hr/monday" />
      <div v-if="loading" class="flex min-h-48 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
      <UAlert v-else-if="!result?.active" color="warning" variant="soft" icon="i-lucide-shield-alert" title="No approved scope" :description="result?.reason ?? 'An owner-approved scope is required.'" />
      <template v-else>
        <section class="rounded-xl border border-default bg-default p-5"><div class="flex flex-wrap items-center justify-between gap-3"><div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Bounded result</p><h2 class="mt-1 text-xl font-semibold text-highlighted">{{ result.evidence.length }} records</h2></div><UBadge color="success" variant="subtle" label="Read-only" /></div><div class="mt-4 grid gap-3 sm:grid-cols-3"><div v-for="limitation in result.limitations" :key="limitation" class="rounded-lg bg-elevated/40 p-3 text-xs leading-5 text-muted">{{ limitation }}</div></div></section>
        <section class="overflow-hidden rounded-xl border border-default bg-default"><div class="border-b border-default bg-elevated/30 px-5 py-4"><h2 class="font-semibold text-highlighted">Synced task metadata</h2></div><div v-if="result.evidence.length" class="divide-y divide-default"><div v-for="item in result.evidence" :key="item.mondayItemId" class="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_180px_140px]"><div class="min-w-0"><p class="truncate font-medium text-highlighted">{{ item.title }}</p><p class="mt-1 text-xs text-muted">Monday item {{ item.mondayItemId }} · board {{ item.mondayBoardId }}</p></div><p class="text-sm text-muted">{{ item.taskStatus ?? 'Status not allowlisted' }}</p><p class="text-sm" :class="item.isBlocked ? 'text-error' : 'text-muted'">{{ item.isBlocked ? 'Blocked' : item.dueDate ?? 'No due date' }}</p></div></div><p v-else class="px-5 py-8 text-sm text-muted">No records matched the approved scope.</p></section>
      </template>
    </section>
  </main>
</template>
