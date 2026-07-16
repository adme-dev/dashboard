<script setup lang="ts">
import { buildNewsPublishTargets } from '~/utils/socialNewsPublishing'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
useHead({ title: 'News Inbox' })

interface NewsItem { id: string; source: string; source_url: string | null; title: string; summary: string | null; author: string | null; published_at: string | null; status: string; topics: string[]; make: string | null; relevance_score: number; relevance_reasons: string[]; excluded: boolean }
interface ClientProfile { clientId?: string; clientName?: string; sourceBriefId: string | null; industry: string; targetAudience: string; contentPillars: string[]; includeKeywords: string[]; excludeKeywords: string[]; makes: string[]; brandVoice: string; defaultTone: string; aiInstructions: string; preferredPlatforms: string[]; timezone: string; defaultWorkflow: 'draft' | 'schedule' }
const apiFetch = $fetch as <T = unknown>(url: string, options?: Record<string, unknown>) => Promise<T>
const items = ref<NewsItem[]>([])
const status = ref('unread')
const pending = ref(false)
const error = ref<string | null>(null)
const selected = ref<string[]>([])
const toast = useToast()
const { isAdmin } = useAuth()
const clients = ref<Array<{ id: string; name: string }>>([])
const clientId = ref('')
const accounts = ref<Array<{ id: string; platform: string; account_name: string | null }>>([])
const accountIds = ref<string[]>([])
const platforms = ref<string[]>(['facebook'])
const rewrite = ref(false)
const tone = ref('professional')
const showDraftOptions = ref(false)
const showSourceSettings = ref(false)
const sourceKey = ref('mcp_news')
const sourceUrl = ref('')
const sourceEnabled = ref(true)
const sourceSaving = ref(false)
const scheduledAt = ref('')
const scheduleMode = ref<'draft' | 'exact' | 'next-slot'>('draft')
const searchQuery = ref('')
const topicFilter = ref('')
const makeFilter = ref('')
const relevantOnly = ref(false)
const showClientProfile = ref(false)
const profileSaving = ref(false)
const profileForm = ref({ industry: '', targetAudience: '', contentPillars: '', includeKeywords: '', excludeKeywords: '', makes: '', brandVoice: '', defaultTone: 'professional', aiInstructions: '', preferredPlatforms: [] as string[], timezone: 'Australia/Melbourne', defaultWorkflow: 'draft' as 'draft' | 'schedule' })
let clientLoadSequence = 0

function toList(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean) }
function toCsv(value: string[] | undefined) { return (value || []).join(', ') }

async function refresh() {
  pending.value = true; error.value = null
  try {
    const query = new URLSearchParams({ status: status.value })
    if (clientId.value) query.set('clientId', clientId.value)
    if (searchQuery.value.trim()) query.set('q', searchQuery.value.trim())
    if (topicFilter.value.trim()) query.set('topic', topicFilter.value.trim())
    if (makeFilter.value.trim()) query.set('make', makeFilter.value.trim())
    if (relevantOnly.value) query.set('relevantOnly', 'true')
    items.value = await apiFetch<NewsItem[]>(`/api/agency/social/news?${query}`)
  }
  catch (e: any) { error.value = e?.data?.statusMessage || 'Could not load the news inbox' }
  finally { pending.value = false }
}
async function refreshSource() {
  pending.value = true
  try { await apiFetch('/api/agency/social/news/refresh', { method: 'POST' } as any); await refresh(); toast.add({ title: 'News refreshed', color: 'success' }) }
  catch (e: any) { toast.add({ title: 'Could not refresh news', description: e?.data?.statusMessage || 'Check the source settings', color: 'error' }) }
  finally { pending.value = false }
}
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(x => x !== id) : [...selected.value, id] }
function fmtDate(value: string | null) { return value ? new Date(value).toLocaleString() : 'Date unknown' }
watch(status, refresh)
watch(relevantOnly, refresh)
async function loadSourceSettings() {
  const result = await apiFetch<{ sources: Array<{ sourceKey: string; endpointUrl: string; enabled: boolean }> }>('/api/agency/social/news/sources')
  const source = result.sources.find(s => s.sourceKey === sourceKey.value) || result.sources[0]
  if (source) { sourceKey.value = source.sourceKey; sourceUrl.value = source.endpointUrl; sourceEnabled.value = source.enabled }
}
async function saveSourceSettings() {
  sourceSaving.value = true
  try { await apiFetch(`/api/agency/social/news/sources/${sourceKey.value}`, { method: 'PATCH', body: { endpointUrl: sourceUrl.value, enabled: sourceEnabled.value } } as any); toast.add({ title: 'News source saved', color: 'success' }); showSourceSettings.value = false }
  catch (e: any) { toast.add({ title: 'Could not save source', description: e?.data?.statusMessage || 'Check the HTTPS URL', color: 'error' }) }
  finally { sourceSaving.value = false }
}
onMounted(async () => {
  const response = await apiFetch<any>('/api/agency/clients?limit=200')
  clients.value = Array.isArray(response) ? response : (response?.clients ?? [])
  clientId.value = clients.value[0]?.id ?? ''
})
async function loadClientProfile(id: string) {
  const value = await apiFetch<ClientProfile>(`/api/agency/social/news/profiles/${id}`)
  profileForm.value = {
    industry: value.industry,
    targetAudience: value.targetAudience,
    contentPillars: toCsv(value.contentPillars),
    includeKeywords: toCsv(value.includeKeywords),
    excludeKeywords: toCsv(value.excludeKeywords),
    makes: toCsv(value.makes),
    brandVoice: value.brandVoice,
    defaultTone: value.defaultTone,
    aiInstructions: value.aiInstructions,
    preferredPlatforms: [...value.preferredPlatforms],
    timezone: value.timezone,
    defaultWorkflow: value.defaultWorkflow,
  }
  tone.value = value.defaultTone
  scheduleMode.value = value.defaultWorkflow === 'schedule' ? 'next-slot' : 'draft'
  if (value.preferredPlatforms.length) platforms.value = [...value.preferredPlatforms]
}
watch(clientId, async (id) => {
  if (!id) return
  const sequence = ++clientLoadSequence
  const [loadedAccounts] = await Promise.all([
    apiFetch<any[]>(`/api/agency/social/publishing/accounts?clientId=${id}`),
    loadClientProfile(id),
  ])
  if (sequence !== clientLoadSequence || id !== clientId.value) return
  accounts.value = loadedAccounts
  accountIds.value = accounts.value.filter(a => a.is_active).map(a => a.id)
  await refresh()
})
async function saveClientProfile() {
  if (!clientId.value) return
  profileSaving.value = true
  try {
    await apiFetch<ClientProfile>(`/api/agency/social/news/profiles/${clientId.value}`, {
      method: 'PUT',
      body: {
        ...profileForm.value,
        contentPillars: toList(profileForm.value.contentPillars),
        includeKeywords: toList(profileForm.value.includeKeywords),
        excludeKeywords: toList(profileForm.value.excludeKeywords),
        makes: toList(profileForm.value.makes),
      },
    } as any)
    toast.add({ title: 'Client content profile saved', description: 'News relevance and AI rewrites will use this brief.', color: 'success' })
    showClientProfile.value = false
    await refresh()
  } catch (e: any) { toast.add({ title: 'Could not save client profile', description: e?.data?.statusMessage, color: 'error' }) }
  finally { profileSaving.value = false }
}
async function createDrafts() {
  try {
    const targets = buildNewsPublishTargets(accounts.value, accountIds.value, platforms.value)
    if (!targets.length) throw new Error('Choose at least one connected account on a selected platform')
    const result = await apiFetch<{ postIds: string[] }>('/api/agency/social/news/drafts', { method: 'POST', body: { newsIds: selected.value, clientId: clientId.value, platforms: platforms.value, accountIds: accountIds.value, targets, rewrite: rewrite.value, tone: tone.value, scheduleMode: scheduleMode.value, scheduledAt: scheduleMode.value === 'exact' && scheduledAt.value ? new Date(scheduledAt.value).toISOString() : null } } as any)
    toast.add({ title: 'Drafts created', description: `${result.postIds.length} item(s) sent to Compose / Approvals`, color: 'success' })
    selected.value = []; showDraftOptions.value = false; status.value = 'used'; await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create drafts', description: e?.data?.statusMessage || 'Check connected accounts', color: 'error' }) }
}
</script>

<template>
  <SocialPublishingShell title="News Inbox" subtitle="Cherry-pick MCP news, rewrite it if needed, and send it to selected accounts and platforms.">
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <USelectMenu v-model="clientId" :items="clients.map(c => ({ label: c.name, value: c.id }))" value-key="value" placeholder="Client" class="w-52" />
      <USelectMenu v-model="status" :items="[{ label: 'Unread', value: 'unread' }, { label: 'Selected', value: 'selected' }, { label: 'Used', value: 'used' }, { label: 'Dismissed', value: 'dismissed' }]" value-key="value" class="w-36" />
      <UInput v-model="searchQuery" icon="i-lucide-search" placeholder="Search news" class="w-48" @keyup.enter="refresh" />
      <UInput v-model="topicFilter" placeholder="Topic" class="w-32" @keyup.enter="refresh" />
      <UInput v-model="makeFilter" placeholder="Make / brand" class="w-36" @keyup.enter="refresh" />
      <UCheckbox v-model="relevantOnly" label="Relevant only" />
      <UButton icon="i-lucide-filter" color="neutral" variant="subtle" label="Apply" @click="refresh" />
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="subtle" label="Refresh source" :loading="pending" @click="refreshSource" />
      <UButton v-if="isAdmin && clientId" icon="i-lucide-book-open-text" color="neutral" variant="subtle" label="Client content profile" @click="showClientProfile = true" />
      <UButton v-if="isAdmin" icon="i-lucide-settings-2" color="neutral" variant="subtle" label="Source settings" @click="showSourceSettings = true; loadSourceSettings()" />
      <span class="text-sm text-muted ml-auto">{{ selected.length }} selected</span>
      <UButton icon="i-lucide-send" label="Create drafts" :disabled="!selected.length" @click="showDraftOptions = true" />
    </div>
    <div v-if="showClientProfile" class="rounded-lg border border-primary/30 bg-default p-4 mb-5 space-y-4">
      <div>
        <div class="font-medium">Client social content profile</div>
        <p class="text-sm text-muted">Controls explainable news relevance and supplies approved context to AI rewrites.</p>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <UInput v-model="profileForm.industry" placeholder="Industry" />
        <UInput v-model="profileForm.targetAudience" placeholder="Target audience" />
        <UInput v-model="profileForm.contentPillars" placeholder="Content pillars, comma separated" />
        <UInput v-model="profileForm.includeKeywords" placeholder="Include keywords, comma separated" />
        <UInput v-model="profileForm.excludeKeywords" placeholder="Exclude keywords, comma separated" />
        <UInput v-model="profileForm.makes" placeholder="Makes / brands, comma separated" />
        <UInput v-model="profileForm.brandVoice" placeholder="Brand voice" />
        <UInput v-model="profileForm.defaultTone" placeholder="Default AI tone" />
        <UInput v-model="profileForm.timezone" placeholder="Timezone" />
        <USelectMenu v-model="profileForm.defaultWorkflow" :items="[{ label: 'Create drafts', value: 'draft' }, { label: 'Schedule explicitly', value: 'schedule' }]" value-key="value" />
      </div>
      <UTextarea v-model="profileForm.aiInstructions" placeholder="Additional client AI instructions" :rows="3" />
      <div class="flex flex-wrap gap-3">
        <UCheckbox v-for="p in ['facebook','instagram','linkedin','tiktok','youtube','google-business']" :key="p" v-model="profileForm.preferredPlatforms" :value="p" :label="p" />
      </div>
      <p class="text-xs text-muted">All generated posts remain subject to XeroFlow's approval gate before publishing.</p>
      <div class="flex gap-2"><UButton label="Save profile" :loading="profileSaving" @click="saveClientProfile" /><UButton label="Cancel" color="neutral" variant="ghost" @click="showClientProfile = false" /></div>
    </div>
    <div v-if="showSourceSettings" class="rounded-lg border border-default bg-default p-4 mb-5 space-y-3">
      <div class="text-sm font-medium">News source plug-in</div>
      <UInput v-model="sourceUrl" label="Endpoint URL" class="w-full" />
      <UCheckbox v-model="sourceEnabled" label="Enabled" />
      <div class="flex gap-2"><UButton label="Save" :loading="sourceSaving" @click="saveSourceSettings" /><UButton label="Cancel" color="neutral" variant="ghost" @click="showSourceSettings = false" /></div>
    </div>
    <div v-if="showDraftOptions" class="rounded-lg border border-primary/30 bg-default p-4 mb-5 space-y-3">
      <div class="flex flex-wrap gap-3 items-center">
        <USelectMenu v-model="clientId" :items="clients.map(c => ({ label: c.name, value: c.id }))" value-key="value" placeholder="Target client" class="w-52" />
        <UCheckbox v-for="p in ['facebook','instagram','linkedin','tiktok','youtube','google-business']" :key="p" v-model="platforms" :value="p" :label="p" />
        <UCheckbox v-model="rewrite" label="Rewrite with AI" />
        <UInput v-if="rewrite" v-model="tone" placeholder="Tone" class="w-36" />
        <USelectMenu v-model="scheduleMode" :items="[{ label: 'Save as draft', value: 'draft' }, { label: 'Choose date and time', value: 'exact' }, { label: 'Use next client slot', value: 'next-slot' }]" value-key="value" class="w-52" />
        <UInput v-if="scheduleMode === 'exact'" v-model="scheduledAt" type="datetime-local" class="w-56" aria-label="Publish time" />
      </div>
      <div class="flex flex-wrap gap-2">
        <UCheckbox v-for="a in accounts" :key="a.id" v-model="accountIds" :value="a.id" :label="`${a.platform}: ${a.account_name || 'account'}`" />
      </div>
      <div class="flex gap-2"><UButton label="Create drafts" :loading="pending" :disabled="!clientId || !platforms.length" @click="createDrafts" /><UButton label="Cancel" color="neutral" variant="ghost" @click="showDraftOptions = false" /></div>
    </div>
    <div v-if="error" class="rounded-lg border border-error/40 p-4 text-sm text-error">{{ error }}</div>
    <div v-else-if="pending" class="text-sm text-muted">Loading news…</div>
    <div v-else-if="!items.length" class="rounded-lg border border-dashed border-default p-10 text-center text-sm text-muted">No news items in this view.</div>
    <div v-else class="space-y-3">
      <article v-for="item in items" :key="item.id" class="rounded-lg border border-default bg-default p-4 flex gap-3">
        <UCheckbox :model-value="selected.includes(item.id)" class="mt-1" @update:model-value="toggle(item.id)" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 text-xs text-muted mb-1"><UBadge color="primary" variant="subtle" size="xs">{{ item.source }}</UBadge><span>{{ fmtDate(item.published_at) }}</span></div>
          <h2 class="font-medium">{{ item.title }}</h2>
          <p v-if="item.summary" class="text-sm text-muted mt-1 line-clamp-3">{{ item.summary }}</p>
          <div class="flex flex-wrap gap-1.5 mt-2">
            <UBadge v-if="item.relevance_score > 0" color="success" variant="subtle" size="xs">Relevance {{ item.relevance_score }}</UBadge>
            <UBadge v-for="reason in item.relevance_reasons" :key="reason" :color="item.excluded ? 'error' : 'neutral'" variant="subtle" size="xs">{{ reason }}</UBadge>
            <UBadge v-for="topic in item.topics" :key="topic" color="neutral" variant="outline" size="xs">{{ topic }}</UBadge>
          </div>
          <p v-if="item.author" class="text-xs text-muted mt-2">{{ item.author }}</p>
        </div>
        <UButton v-if="item.source_url" :to="item.source_url" target="_blank" icon="i-lucide-external-link" variant="ghost" size="xs" aria-label="Open source" />
      </article>
    </div>
  </SocialPublishingShell>
</template>
