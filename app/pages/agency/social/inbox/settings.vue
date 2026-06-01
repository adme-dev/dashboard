<script setup lang="ts">
import type { SocialSavedReply, SocialSlaPolicy } from '~/types'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()
const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => { const d = clientsData.value as any; return Array.isArray(d) ? d : (d?.clients ?? []) })
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { data: replies, refresh: refreshReplies } = await useFetch<SocialSavedReply[]>('/api/agency/social/inbox/saved-replies', { query: { clientId }, watch: [clientId], default: () => [] })
const { data: policies, refresh: refreshPolicies } = await useFetch<SocialSlaPolicy[]>('/api/agency/social/inbox/sla-policies', { query: { clientId }, watch: [clientId], default: () => [] })

const newReply = reactive({ name: '', content: '', category: '' })
async function addReply() {
  if (!newReply.name.trim() || !newReply.content.trim()) return
  await $fetch('/api/agency/social/inbox/saved-replies', { method: 'POST', body: { ...newReply, client_id: clientId.value } })
  newReply.name = ''; newReply.content = ''; newReply.category = ''
  await refreshReplies(); toast.add({ title: 'Saved reply added', color: 'success' })
}
async function delReply(id: string) { await $fetch(`/api/agency/social/inbox/saved-replies/${id}`, { method: 'DELETE' }); await refreshReplies() }

const ALL_CHANNELS = '__all__'
const newPolicy = reactive({ channel_type: ALL_CHANNELS, target_minutes: 240 })
const CHANNELS = [{ label: 'All channels', value: ALL_CHANNELS }, { label: 'Comments', value: 'comment' }, { label: 'Reviews', value: 'review' }]
async function savePolicy() {
  await $fetch('/api/agency/social/inbox/sla-policies', { method: 'POST', body: { client_id: clientId.value, channel_type: newPolicy.channel_type === ALL_CHANNELS ? null : newPolicy.channel_type, target_minutes: newPolicy.target_minutes } })
  await refreshPolicies(); toast.add({ title: 'SLA policy saved', color: 'success' })
}
async function delPolicy(id: string) { await $fetch(`/api/agency/social/inbox/sla-policies/${id}`, { method: 'DELETE' }); await refreshPolicies() }
</script>

<template>
  <div class="p-6 space-y-8 max-w-3xl">
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">Inbox Settings</h1>
      <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56" />
    </div>

    <section class="space-y-3">
      <h2 class="font-medium">Saved replies</h2>
      <div class="grid grid-cols-[1fr_2fr_auto] gap-2 items-end">
        <UFormField label="Name"><UInput v-model="newReply.name" placeholder="Thanks" class="w-full" /></UFormField>
        <UFormField label="Content ( {{variables}} allowed )"><UInput v-model="newReply.content" placeholder="Thanks {{name}}!" class="w-full" /></UFormField>
        <UButton label="Add" :disabled="!newReply.name.trim() || !newReply.content.trim()" @click="addReply" />
      </div>
      <div class="space-y-1">
        <div v-for="r in replies" :key="r.id" class="flex items-center justify-between rounded border border-default p-2 text-sm">
          <div><span class="font-medium">{{ r.name }}</span> <span class="text-muted">— {{ r.content }}</span> <span class="text-xs text-muted">({{ r.usage_count }} uses)</span></div>
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="delReply(r.id)" />
        </div>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="font-medium">SLA policies</h2>
      <div class="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <UFormField label="Channel"><USelect v-model="newPolicy.channel_type" :items="CHANNELS" value-key="value" class="w-full" /></UFormField>
        <UFormField label="First-response target (min)"><UInput v-model.number="newPolicy.target_minutes" type="number" min="1" class="w-full" /></UFormField>
        <UButton label="Save" @click="savePolicy" />
      </div>
      <div class="space-y-1">
        <div v-for="p in policies" :key="p.id" class="flex items-center justify-between rounded border border-default p-2 text-sm">
          <div>{{ p.channel_type || 'all channels' }} — {{ p.target_minutes }}m {{ p.enabled ? '' : '(disabled)' }}</div>
          <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="delPolicy(p.id)" />
        </div>
      </div>
    </section>
  </div>
</template>
