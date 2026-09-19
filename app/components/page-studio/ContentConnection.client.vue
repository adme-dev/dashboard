<script setup lang="ts">
const props = defineProps<{ audience: 'agency' | 'portal', siteId: string }>()
const emit = defineEmits<{ connected: [] }>()
interface Connection {
  status: 'connected' | 'unconnected' | 'connecting' | 'retry' | 'disabled' | 'reconciliation'
  body?: { requestId: string, expectedCheckpointId: string }
}
const endpoint = computed(() => `/api/${props.audience}/page-studio/sites/${encodeURIComponent(props.siteId)}/content-connection`)
const { data, pending, error, refresh } = await useFetch<Connection>(endpoint)
const connecting = ref(false)
const failure = ref('')
let active = true
onUnmounted(() => {
  active = false
})
const { pause, resume } = useIntervalFn(() => refresh(), 5000, { immediate: false })
watch(() => data.value?.status, (status, previous) => {
  if (status === 'connecting') resume()
  else pause()
  if (active && status === 'connected' && previous && previous !== 'connected') emit('connected')
}, { immediate: true })
const message = computed(() => {
  if (error.value) return { title: 'Connection status unavailable', description: 'We could not check CMS setup. Try checking again.' }
  switch (data.value?.status) {
    case 'connecting': return { title: 'Connecting CMS', description: 'Keep this page open while setup completes.' }
    case 'retry': return { title: 'CMS setup paused', description: 'Retry to continue this website’s existing setup.' }
    case 'disabled': return { title: 'CMS connection disabled', description: 'Contact your agency to review this website’s connection.' }
    case 'reconciliation': return { title: 'CMS setup needs attention', description: 'The previous setup cannot be resumed from your current sign-in. Your agency can help reconcile it.' }
    default: return { title: 'Connect this website’s CMS', description: 'Connect content storage to start adding collections and entries for this website.' }
  }
})
async function connect() {
  if (!data.value?.body || connecting.value) return
  connecting.value = true
  failure.value = ''
  pause()
  try {
    await $fetch(endpoint.value, { method: 'POST', body: data.value.body })
    if (active) await refresh()
  } catch {
    if (active) {
      failure.value = 'Setup could not finish. Check its current status before retrying.'
      await refresh()
    }
  } finally {
    if (active) {
      connecting.value = false
      if (data.value?.status === 'connecting') resume()
    }
  }
}
</script>

<template>
  <div v-if="data?.status !== 'connected' && error?.statusCode !== 403" class="mb-6">
    <USkeleton v-if="pending && !data" class="h-24 w-full" aria-label="Checking CMS connection" />
    <UAlert
      v-else
      color="neutral"
      icon="i-lucide-database"
      :title="message.title"
      :description="failure || message.description"
    >
      <template #actions>
        <UButton
          v-if="data?.body && ['unconnected', 'retry'].includes(data.status)"
          :label="data.status === 'retry' ? 'Retry setup' : 'Connect CMS'"
          :loading="connecting"
          :disabled="pending || !!error"
          @click="connect"
        />
        <UButton
          v-if="error || failure || data?.status === 'connecting'"
          label="Check status"
          color="neutral"
          variant="outline"
          :loading="pending"
          :disabled="connecting"
          @click="refresh()"
        />
      </template>
    </UAlert>
  </div>
</template>
