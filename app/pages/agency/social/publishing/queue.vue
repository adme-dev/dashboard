<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import type { SocialPost } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()
const toast = useToast()

const { clientId } = useSocialPublishingClient()

const queue = ref<SocialPost[]>([])
const loading = ref(false)

async function load() {
  if (!clientId.value) return
  loading.value = true
  try { queue.value = await api.getQueue(clientId.value) } finally { loading.value = false }
}
watch(clientId, load, { immediate: true })

async function persist() {
  if (!clientId.value) return
  await api.reorderQueue(clientId.value, queue.value.map(p => p.id))
  toast.add({ title: 'Queue order saved', color: 'success' })
}
function move(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= queue.value.length) return
  const arr = queue.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  persist()
}
</script>

<template>
  <SocialPublishingShell
    title="Queue"
    subtitle="Posts waiting for the next free posting slot. Reorder to set priority."
  >
    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!queue.length" class="rounded-lg border border-default p-10 text-center text-muted">
      <UIcon name="i-lucide-list" class="size-8 mx-auto mb-2 opacity-50" />
      Queue is empty.
    </div>

    <div v-else class="space-y-2">
      <div v-for="(p, i) in queue" :key="p.id" class="flex items-center gap-3 rounded-lg border border-default p-3">
        <span class="text-xs text-muted w-6 text-center">{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm truncate">{{ p.content || '(no copy)' }}</p>
          <div class="flex gap-1 mt-1">
            <UBadge v-for="pl in p.platforms" :key="pl" size="xs" color="neutral" variant="subtle">{{ pl }}</UBadge>
          </div>
        </div>
        <div class="flex flex-col">
          <UButton icon="i-lucide-chevron-up" size="xs" variant="ghost" color="neutral" :disabled="i === 0" @click="move(i, -1)" />
          <UButton icon="i-lucide-chevron-down" size="xs" variant="ghost" color="neutral" :disabled="i === queue.length - 1" @click="move(i, 1)" />
        </div>
        <UButton :to="{ path: '/agency/social/publishing/compose', query: { edit: p.id } }" icon="i-lucide-pencil" size="xs" variant="ghost" />
      </div>
    </div>
  </SocialPublishingShell>
</template>
