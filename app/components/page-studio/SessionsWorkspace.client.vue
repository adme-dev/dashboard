<script setup lang="ts">
interface SessionRecord {
  expiresAt: string
  id: string
  issuedAt: string
  revokedAt?: string | null
  role: string
  status: string
  userId: string
}

const props = defineProps<{ siteId: string }>()
const toast = useToast()
const revoking = ref<string | null>(null)
const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/editor-sessions`)
const { data, status, error, refresh } = await useFetch<{ sessions: SessionRecord[] }>(endpoint)
const sessions = computed(() => data.value?.sessions ?? [])

async function refreshSessions() {
  await refresh()
}

async function revoke(session: SessionRecord) {
  revoking.value = session.id
  try {
    await $fetch(`${endpoint.value}/${encodeURIComponent(session.id)}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Studio session revoked', color: 'success' })
  } finally {
    revoking.value = null
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold text-highlighted">
            Editor sessions
          </h2><p class="mt-1 text-sm text-muted">
            Short-lived signed sessions. Tokens are never stored.
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          label="Refresh"
          color="neutral"
          variant="outline"
          :loading="status === 'pending'"
          @click="refreshSessions"
        />
      </div>
    </template>
    <UAlert v-if="error" color="error" title="Unable to load editor sessions" />
    <div v-else-if="sessions.length" class="divide-y divide-default">
      <div v-for="session in sessions" :key="session.id" class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ session.userId }}
            </p><UBadge :label="session.status" :color="session.status === 'active' ? 'success' : 'neutral'" variant="subtle" />
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ session.role }} · expires {{ new Date(session.expiresAt).toLocaleString('en-AU') }}
          </p>
        </div>
        <UButton
          v-if="session.status === 'active'"
          label="Revoke"
          icon="i-lucide-ban"
          color="error"
          variant="soft"
          size="xs"
          :loading="revoking === session.id"
          @click="revoke(session)"
        />
      </div>
    </div>
    <p v-else class="text-sm text-muted">
      No editor sessions have been issued for this site.
    </p>
  </UCard>
</template>
