<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import type { SocialSlot, SocialPlatform } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()
const toast = useToast()

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const slots = ref<SocialSlot[]>([])
const loading = ref(false)

const DOW = [
  { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 }, { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 }, { label: 'Saturday', value: 6 },
]
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 ? '30' : '00'
  return `${h}:${m}`
})
const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' }, { value: 'google-business', label: 'Google Business' },
]

const form = ref({ dayOfWeek: 1, timeOfDay: '09:00', platforms: [] as SocialPlatform[] })

async function load() {
  if (!clientId.value) return
  loading.value = true
  try { slots.value = await api.listSlots(clientId.value) } finally { loading.value = false }
}
watch(clientId, load, { immediate: true })

async function addSlot() {
  if (!clientId.value) return
  try {
    await api.createSlot({ clientId: clientId.value, dayOfWeek: form.value.dayOfWeek, timeOfDay: form.value.timeOfDay, platforms: form.value.platforms })
    toast.add({ title: 'Slot added', color: 'success' })
    form.value.platforms = []
    await load()
  } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
}
const dowLabel = (v: number) => DOW.find(d => d.value === v)?.label ?? v
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <div class="flex items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Planner</h1>
        <p class="text-sm text-muted mt-0.5">Define recurring posting slots. Queued posts fill the next free slot automatically.</p>
      </div>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" label-key="label" icon="i-lucide-building-2" class="w-56" />
    </div>

    <div class="rounded-lg border border-default p-4 mb-6">
      <h2 class="text-sm font-medium mb-3">Add a posting slot</h2>
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
        <UFormField label="Day">
          <USelectMenu v-model="form.dayOfWeek" :items="DOW" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Time">
          <USelectMenu v-model="form.timeOfDay" :items="TIMES" class="w-full" />
        </UFormField>
        <UButton icon="i-lucide-plus" @click="addSlot">Add slot</UButton>
      </div>
      <UFormField label="Networks (optional)" class="mt-4">
        <USelectMenu v-model="form.platforms" :items="PLATFORMS" value-key="value" label-key="label" multiple placeholder="All networks" class="w-full" />
      </UFormField>
    </div>

    <UAlert
      icon="i-lucide-sparkles" color="neutral" variant="subtle" class="mb-5"
      title="AI week planner — coming soon"
      description="Auto-generating a week of posts from slots + brand context is a fast-follow on this slice."
    />

    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!slots.length" class="rounded-lg border border-default p-10 text-center text-muted">No slots yet.</div>
    <div v-else class="space-y-2">
      <div v-for="s in slots" :key="s.id" class="flex items-center gap-3 rounded-lg border border-default p-3">
        <UIcon name="i-lucide-clock" class="size-4 text-muted" />
        <div class="flex-1">
          <span class="text-sm font-medium">{{ dowLabel(s.day_of_week) }} · {{ s.time_of_day?.slice(0, 5) }}</span>
          <span class="text-xs text-muted ml-2">{{ s.timezone }}</span>
        </div>
        <div class="flex gap-1">
          <UBadge v-for="pl in (s.platforms || [])" :key="pl" size="xs" color="neutral" variant="subtle">{{ pl }}</UBadge>
          <UBadge v-if="!s.platforms?.length" size="xs" color="neutral" variant="subtle">all</UBadge>
        </div>
      </div>
    </div>
  </div>
</template>
