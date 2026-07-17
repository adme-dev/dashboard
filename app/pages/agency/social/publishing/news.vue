<script setup lang="ts">
import { buildNewsPublishTargets } from '~/utils/socialNewsPublishing'
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
useHead({ title: 'News Inbox' })

interface NewsItem { id: string; source: string; source_url: string | null; title: string; summary: string | null; author: string | null; published_at: string | null; status: string; topics: string[]; make: string | null; relevance_score: number; relevance_reasons: string[]; excluded: boolean }
interface ClientProfile { clientId?: string; clientName?: string; sourceBriefId: string | null; industry: string; targetAudience: string; contentPillars: string[]; includeKeywords: string[]; excludeKeywords: string[]; makes: string[]; brandVoice: string; defaultTone: string; aiInstructions: string; preferredPlatforms: string[]; timezone: string; defaultWorkflow: 'draft' | 'schedule' }
interface GovernanceContext { activePackage: null | { assignmentId: string; packageName: string; packageVersionId: string; version: number; startsOn: string; endsOn: string | null; projectId: string | null; rateCardItemId: string | null; commercialScope: { includedPostVolumes?: Record<string, number>; approvalSlaHours?: number; overagePolicy?: string }; usage: { usedPosts: number; publishedPosts: number }; budget: null | { allocationId: string; state: string } }; evidence: { pendingCount: number; approvedCount: number; approved: Array<{ id: string; evidence_type: string; source_system: string; title: string; summary: string | null }> } }
interface PackageOptions { packages: Array<{ id: string; name: string; versionId: string; version: number }>; projects: Array<{ id: string; name: string; status: string }>; allocations: Array<{ id: string; projectId: string; campaignType: string | null; platform: string | null; amount: number; currency: string; period: string; month: string | null; state: string }>; rateCards: Array<{ id: string; serviceName: string; price: number; priceUnit: string }> }
interface EvidenceReviewItem { id: string; evidenceType: string; sourceSystem: string; sourceId: string | null; sourceUrl: string | null; title: string; content: string; summary: string | null; occurredAt: string | null; reviewStatus: string; projectId: string | null; projectName: string | null }
interface MondayEvidencePreviewItem { sourceId: string; evidenceType: 'plan' | 'discussion'; title: string; content: string; author: string | null; sourceUrl: string | null; occurredAt: string | null; projectId: string; projectName: string; importedStatus: string | null }
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
const accounts = ref<Array<{ id: string; platform: string; account_name: string | null; is_active: boolean }>>([])
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
const draftSaving = ref(false)
const searchQuery = ref('')
const topicFilter = ref('')
const makeFilter = ref('')
const relevantOnly = ref(false)
const showClientProfile = ref(false)
const profileSaving = ref(false)
const profileForm = ref({ industry: '', targetAudience: '', contentPillars: '', includeKeywords: '', excludeKeywords: '', makes: '', brandVoice: '', defaultTone: 'professional', aiInstructions: '', preferredPlatforms: [] as string[], timezone: 'Australia/Melbourne', defaultWorkflow: 'draft' as 'draft' | 'schedule' })
const governance = ref<GovernanceContext | null>(null)
const packageOptions = ref<PackageOptions>({ packages: [], projects: [], allocations: [], rateCards: [] })
const packageSaving = ref(false)
const packageForm = ref({ packageVersionId: '', projectId: '', rateCardItemId: '', budgetAllocationId: '', startsOn: new Date().toISOString().slice(0, 10), endsOn: '' })
const newPackage = ref({ name: '', includedVolumes: 'facebook: 8, instagram: 8, linkedin: 4', approvalSlaHours: 24, overagePolicy: 'warn' })
const evidenceSaving = ref(false)
const evidenceForm = ref({ evidenceType: 'decision', title: '', content: '' })
const pendingEvidence = ref<EvidenceReviewItem[]>([])
const mondayEvidencePreview = ref<MondayEvidencePreviewItem[]>([])
const mondayEvidenceSelected = ref<string[]>([])
const slackImportText = ref('')
const slackImporting = ref(false)
const evidenceTransitionLoading = ref(false)
const evidenceReviewingId = ref('')
const recommendation = ref<{ audience: string | null; timezone: string; platforms: string[]; accounts: Array<{ id: string; platform: string; accountName: string | null; health: string; lastError: string | null }>; nextSlot: string | null; basis: string; approvalRequired: boolean; article: { title: string; relevant: boolean; matchedKeywords: string[]; excludedKeywords: string[] } | null } | null>(null)
const recommendationLoading = ref(false)
let clientLoadSequence = 0
const publishTargetCount = computed(() => buildNewsPublishTargets(accounts.value, accountIds.value, platforms.value).length)

function toList(value: string) { return value.split(',').map(item => item.trim()).filter(Boolean) }
function toCsv(value: string[] | undefined) { return (value || []).join(', ') }
function parseIncludedVolumes(value: string) {
  return Object.fromEntries(value.split(',').map(entry => entry.trim().split(':').map(part => part.trim())).filter(([platform, count]) => platform && Number.isInteger(Number(count)) && Number(count) >= 0).map(([platform, count]) => [platform, Number(count)]))
}
async function openClientProfile() {
  showClientProfile.value = true
  if (isAdmin.value) {
    try { await Promise.all([reloadGovernance(), loadPendingEvidence()]) }
    catch (e: any) { toast.add({ title: 'Could not load package settings', description: e?.data?.statusMessage, color: 'error' }) }
  }
}
function closeClientProfile() { showClientProfile.value = false }
async function openSourceSettings() { showSourceSettings.value = true; await loadSourceSettings() }
function closeSourceSettings() { showSourceSettings.value = false }
function openDraftOptions() { showDraftOptions.value = true }
function closeDraftOptions() { showDraftOptions.value = false }
async function loadRecommendation() {
  if (!clientId.value) return
  recommendationLoading.value = true
  try {
    recommendation.value = await apiFetch<typeof recommendation.value>(`/api/agency/social/news/recommendations?clientId=${clientId.value}&newsId=${selected.value[0] || ''}&platforms=${platforms.value.join(',')}`)
  } catch (e: any) { toast.add({ title: 'Could not load recommendation', description: e?.data?.statusMessage || 'Try again later', color: 'error' }) }
  finally { recommendationLoading.value = false }
}

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
  pendingEvidence.value = []
  mondayEvidencePreview.value = []
  mondayEvidenceSelected.value = []
  try {
    const [loadedAccounts, , loadedGovernance, loadedPackageOptions] = await Promise.all([
      apiFetch<any[]>(`/api/agency/social/publishing/accounts?clientId=${id}`),
      loadClientProfile(id),
      apiFetch<GovernanceContext>(`/api/agency/social/news/profiles/${id}/context`),
      isAdmin.value ? apiFetch<PackageOptions>(`/api/agency/social/news/profiles/${id}/package-options`) : Promise.resolve(null),
    ])
    if (sequence !== clientLoadSequence || id !== clientId.value) return
    accounts.value = loadedAccounts
    governance.value = loadedGovernance
    hydratePackageForm(loadedGovernance)
    if (loadedPackageOptions) packageOptions.value = loadedPackageOptions
    accountIds.value = accounts.value.filter(a => a.is_active).map(a => a.id)
    if (showClientProfile.value && isAdmin.value) await loadPendingEvidence(id)
    await refresh()
  } catch (e: any) {
    if (sequence !== clientLoadSequence || id !== clientId.value) return
    items.value = []
    error.value = e?.data?.statusMessage || 'Could not load this client’s news publishing context'
  }
})
async function reloadGovernance() {
  if (!clientId.value) return
  governance.value = await apiFetch<GovernanceContext>(`/api/agency/social/news/profiles/${clientId.value}/context`)
  hydratePackageForm(governance.value)
  if (isAdmin.value) packageOptions.value = await apiFetch<PackageOptions>(`/api/agency/social/news/profiles/${clientId.value}/package-options`)
}
function hydratePackageForm(context: GovernanceContext | null) {
  const active = context?.activePackage
  if (!active) return
  packageForm.value = {
    packageVersionId: active.packageVersionId,
    projectId: active.projectId || '',
    rateCardItemId: active.rateCardItemId || '',
    budgetAllocationId: active.budget?.allocationId || '',
    startsOn: String(active.startsOn).slice(0, 10),
    endsOn: active.endsOn ? String(active.endsOn).slice(0, 10) : '',
  }
}
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
async function createPackageFromProfile() {
  if (!newPackage.value.name.trim()) return
  packageSaving.value = true
  try {
    const created = await apiFetch<{ version_id: string }>('/api/agency/social/news/packages', {
      method: 'POST',
      body: {
        name: newPackage.value.name,
        industry: profileForm.value.industry,
        profileDefaults: {
          ...profileForm.value,
          contentPillars: toList(profileForm.value.contentPillars),
          includeKeywords: toList(profileForm.value.includeKeywords),
          excludeKeywords: toList(profileForm.value.excludeKeywords),
          makes: toList(profileForm.value.makes),
        },
        commercialScope: { includedPostVolumes: parseIncludedVolumes(newPackage.value.includedVolumes), approvalSlaHours: newPackage.value.approvalSlaHours, overagePolicy: newPackage.value.overagePolicy },
      },
    } as any)
    await reloadGovernance()
    packageForm.value.packageVersionId = created.version_id
    toast.add({ title: 'Content package created', description: 'Version 1 is published and ready to assign.', color: 'success' })
  } catch (e: any) { toast.add({ title: 'Could not create package', description: e?.data?.statusMessage, color: 'error' }) }
  finally { packageSaving.value = false }
}
async function assignPackage() {
  if (!clientId.value || !packageForm.value.packageVersionId) return
  packageSaving.value = true
  try {
    await apiFetch(`/api/agency/social/news/profiles/${clientId.value}/package`, { method: 'PUT', body: {
      packageVersionId: packageForm.value.packageVersionId,
      projectId: packageForm.value.projectId || null,
      rateCardItemId: packageForm.value.rateCardItemId || null,
      budgetAllocationId: packageForm.value.budgetAllocationId || null,
      startsOn: packageForm.value.startsOn,
      endsOn: packageForm.value.endsOn || null,
    } } as any)
    await reloadGovernance()
    toast.add({ title: 'Package assigned', description: 'New news drafts will count against this immutable client package assignment.', color: 'success' })
  } catch (e: any) { toast.add({ title: 'Could not assign package', description: e?.data?.statusMessage, color: 'error' }) }
  finally { packageSaving.value = false }
}
async function saveCanonicalEvidence() {
  if (!clientId.value || !evidenceForm.value.title.trim() || !evidenceForm.value.content.trim()) return
  evidenceSaving.value = true
  try {
    await apiFetch(`/api/agency/social/news/profiles/${clientId.value}/evidence`, { method: 'POST', body: { ...evidenceForm.value, sourceSystem: 'xeroflow', reviewStatus: 'approved' } } as any)
    evidenceForm.value = { evidenceType: 'decision', title: '', content: '' }
    await reloadGovernance()
    toast.add({ title: 'Client guidance approved', description: 'The dashboard AI can now cite this XeroFlow decision.', color: 'success' })
  } catch (e: any) { toast.add({ title: 'Could not save client guidance', description: e?.data?.statusMessage, color: 'error' }) }
  finally { evidenceSaving.value = false }
}
async function loadPendingEvidence(requestedClientId = clientId.value) {
  if (!requestedClientId || !isAdmin.value) return
  const response = await apiFetch<{ data: EvidenceReviewItem[] }>(`/api/agency/social/news/profiles/${requestedClientId}/evidence?reviewStatus=pending&pageSize=100`)
  if (requestedClientId !== clientId.value) return
  pendingEvidence.value = response.data
}
async function loadMondayEvidencePreview(requestedClientId: string, announce: boolean) {
  const response = await apiFetch<{ data: MondayEvidencePreviewItem[]; totalItems: number }>(`/api/agency/social/news/profiles/${requestedClientId}/evidence/imports/monday/preview?limit=100`)
  if (requestedClientId !== clientId.value) return
  mondayEvidencePreview.value = response.data
  mondayEvidenceSelected.value = response.data.filter(item => !item.importedStatus).map(item => item.sourceId)
  if (announce) {
    toast.add({
      title: 'Monday evidence preview ready',
      description: response.totalItems ? `${response.totalItems} mapped plan or discussion item(s) found.` : 'No mapped Monday evidence was found for this client.',
      color: response.totalItems ? 'success' : 'neutral',
    })
  }
}
async function previewMondayEvidence() {
  const requestedClientId = clientId.value
  if (!requestedClientId) return
  evidenceTransitionLoading.value = true
  try {
    await loadMondayEvidencePreview(requestedClientId, true)
  } catch (e: any) { toast.add({ title: 'Could not preview Monday evidence', description: e?.data?.statusMessage, color: 'error' }) }
  finally { evidenceTransitionLoading.value = false }
}
async function importMondayEvidence() {
  const requestedClientId = clientId.value
  const sourceIds = [...mondayEvidenceSelected.value]
  if (!requestedClientId || !sourceIds.length) return
  evidenceTransitionLoading.value = true
  try {
    const result = await apiFetch<{ imported: number; skipped: number }>(`/api/agency/social/news/profiles/${requestedClientId}/evidence/imports/monday`, {
      method: 'POST', body: { sourceIds },
    } as any)
    if (requestedClientId !== clientId.value) return
    await Promise.all([reloadGovernance(), loadPendingEvidence(requestedClientId), loadMondayEvidencePreview(requestedClientId, false)])
    toast.add({ title: 'Monday evidence imported for review', description: `${result.imported} item(s) are pending. ${result.skipped} approved or unavailable item(s) were preserved.`, color: 'success' })
  } catch (e: any) { toast.add({ title: 'Could not import Monday evidence', description: e?.data?.statusMessage, color: 'error' }) }
  finally { evidenceTransitionLoading.value = false }
}
async function importSlackEvidence() {
  if (!clientId.value || !slackImportText.value.trim()) return
  let items: unknown
  try { items = JSON.parse(slackImportText.value) } catch { toast.add({ title: 'Invalid Slack export', description: 'Paste a JSON array of message objects.', color: 'error' }); return }
  if (!Array.isArray(items)) { toast.add({ title: 'Invalid Slack export', description: 'Paste a JSON array of message objects.', color: 'error' }); return }
  slackImporting.value = true
  try {
    const result = await apiFetch<{ imported: number; reviewStatus: string }>(`/api/agency/social/news/profiles/${clientId.value}/evidence/imports/slack`, { method: 'POST', body: { items } } as any)
    slackImportText.value = ''
    await Promise.all([reloadGovernance(), loadPendingEvidence(clientId.value)])
    toast.add({ title: 'Slack export imported for review', description: `${result.imported} item(s) are pending approval.`, color: 'success' })
  } catch (e: any) { toast.add({ title: 'Could not import Slack export', description: e?.data?.statusMessage || 'Check the export format', color: 'error' }) }
  finally { slackImporting.value = false }
}
async function reviewEvidence(evidenceId: string, reviewStatus: 'approved' | 'rejected') {
  const requestedClientId = clientId.value
  if (!requestedClientId || evidenceReviewingId.value) return
  evidenceReviewingId.value = evidenceId
  try {
    const body = reviewStatus === 'approved' ? { reviewStatus: 'approved' } : { reviewStatus: 'rejected' }
    await apiFetch(`/api/agency/social/news/profiles/${requestedClientId}/evidence/${evidenceId}`, { method: 'PATCH', body } as any)
    if (requestedClientId !== clientId.value) return
    await Promise.all([reloadGovernance(), loadPendingEvidence(requestedClientId)])
    toast.add({
      title: reviewStatus === 'approved' ? 'Evidence approved for AI' : 'Evidence rejected',
      description: reviewStatus === 'approved' ? 'This XeroFlow-reviewed item can now inform client recommendations.' : 'This item will not be used as client guidance.',
      color: reviewStatus === 'approved' ? 'success' : 'neutral',
    })
  } catch (e: any) { toast.add({ title: 'Could not review evidence', description: e?.data?.statusMessage, color: 'error' }) }
  finally { evidenceReviewingId.value = '' }
}
async function createDrafts() {
  if (draftSaving.value) return
  draftSaving.value = true
  try {
    const targets = buildNewsPublishTargets(accounts.value, accountIds.value, platforms.value)
    if (!targets.length) throw new Error('Choose at least one connected account on a selected platform')
    const result = await apiFetch<{ postIds: string[] }>('/api/agency/social/news/drafts', { method: 'POST', body: { newsIds: selected.value, clientId: clientId.value, platforms: platforms.value, accountIds: accountIds.value, targets, rewrite: rewrite.value, tone: tone.value, scheduleMode: scheduleMode.value, scheduledAt: scheduleMode.value === 'exact' && scheduledAt.value ? new Date(scheduledAt.value).toISOString() : null } } as any)
    toast.add({ title: 'Drafts created', description: `${result.postIds.length} item(s) sent to Compose / Approvals`, color: 'success' })
    selected.value = []; showDraftOptions.value = false; status.value = 'used'; await refresh()
  } catch (e: any) { toast.add({ title: 'Could not create drafts', description: e?.data?.statusMessage || 'Check connected accounts', color: 'error' }) }
  finally { draftSaving.value = false }
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
      <UButton v-if="isAdmin && clientId" icon="i-lucide-book-open-text" color="neutral" variant="subtle" label="Client content profile" @click="openClientProfile" />
      <UButton v-if="isAdmin" icon="i-lucide-settings-2" color="neutral" variant="subtle" label="Source settings" @click="openSourceSettings" />
      <span class="text-sm text-muted ml-auto">{{ selected.length }} selected</span>
      <UButton icon="i-lucide-send" label="Create drafts" :disabled="!selected.length" @click="openDraftOptions" />
    </div>
    <div v-if="governance?.activePackage" class="rounded-lg border border-primary/25 bg-primary/5 p-3 mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <div><span class="text-muted">Active package</span> <strong>{{ governance.activePackage.packageName }}</strong> <UBadge color="neutral" variant="subtle" size="xs">v{{ governance.activePackage.version }}</UBadge></div>
      <div><span class="text-muted">Usage</span> {{ governance.activePackage.usage.usedPosts }} posts ({{ governance.activePackage.usage.publishedPosts }} published)</div>
      <div v-if="governance.activePackage.commercialScope.includedPostVolumes"><span class="text-muted">Included</span> {{ Object.entries(governance.activePackage.commercialScope.includedPostVolumes).map(([platform, volume]) => `${platform}: ${volume}`).join(' · ') }}</div>
      <UBadge v-if="governance.activePackage.commercialScope.overagePolicy" color="warning" variant="subtle" size="xs">Overage: {{ governance.activePackage.commercialScope.overagePolicy }}</UBadge>
      <UBadge v-if="governance.activePackage.commercialScope.approvalSlaHours" color="neutral" variant="subtle" size="xs">Approval SLA: {{ governance.activePackage.commercialScope.approvalSlaHours }}h</UBadge>
      <div v-if="governance.activePackage.budget"><UBadge color="success" variant="subtle" size="xs">Budget linked · {{ governance.activePackage.budget.state }}</UBadge></div>
      <div v-if="governance.evidence.approvedCount"><span class="text-muted">Approved guidance</span> {{ governance.evidence.approvedCount }}</div>
      <div v-if="governance.evidence.pendingCount"><UBadge color="warning" variant="subtle" size="xs">{{ governance.evidence.pendingCount }} imported item(s) awaiting review</UBadge></div>
    </div>
    <div v-if="showClientProfile" class="rounded-lg border border-primary/30 bg-default p-4 mb-5 space-y-4">
      <div>
        <div class="font-medium">Client social content profile</div>
        <p class="text-sm text-muted">Controls explainable news relevance and supplies approved context to AI rewrites.</p>
      </div>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
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
        <UTextarea v-model="profileForm.aiInstructions" class="w-full col-span-full" placeholder="Additional client AI instructions" :rows="3" />
      </div>
      <div class="flex flex-wrap gap-3">
        <UCheckbox v-for="p in ['facebook','instagram','linkedin','tiktok','youtube','google-business']" :key="p" v-model="profileForm.preferredPlatforms" :value="p" :label="p" />
      </div>
      <p class="text-xs text-muted">All generated posts remain subject to XeroFlow's approval gate before publishing.</p>
      <div class="flex gap-2"><UButton label="Save profile" :loading="profileSaving" @click="saveClientProfile" /><UButton label="Cancel" color="neutral" variant="ghost" @click="closeClientProfile" /></div>
      <template v-if="isAdmin">
        <USeparator />
        <div class="space-y-3">
          <div>
            <div class="font-medium">Content package and budget link</div>
            <p class="text-sm text-muted">The package is versioned here; commercial value stays in the linked XeroFlow project, rate card, and job budget.</p>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <USelectMenu v-model="packageForm.packageVersionId" :items="packageOptions.packages.map(p => ({ label: `${p.name} · v${p.version}`, value: p.versionId }))" value-key="value" placeholder="Package version" />
            <USelectMenu v-model="packageForm.projectId" :items="[{ label: 'No project link', value: '' }, ...packageOptions.projects.map(p => ({ label: `${p.name} · ${p.status}`, value: p.id }))]" value-key="value" placeholder="Project / retainer" />
            <USelectMenu v-model="packageForm.budgetAllocationId" :items="[{ label: 'No budget allocation', value: '' }, ...packageOptions.allocations.filter(a => !packageForm.projectId || a.projectId === packageForm.projectId).map(a => ({ label: `${a.platform || a.campaignType || 'Social'} · ${a.currency} ${a.amount} ${a.period}`, value: a.id }))]" value-key="value" placeholder="Budget allocation" />
            <USelectMenu v-model="packageForm.rateCardItemId" :items="[{ label: 'No rate-card item', value: '' }, ...packageOptions.rateCards.map(r => ({ label: `${r.serviceName} · $${r.price}/${r.priceUnit}`, value: r.id }))]" value-key="value" placeholder="Rate-card item" />
            <UInput v-model="packageForm.startsOn" type="date" aria-label="Package starts" />
            <UInput v-model="packageForm.endsOn" type="date" aria-label="Package ends" />
          </div>
          <UButton label="Assign package" icon="i-lucide-package-check" :loading="packageSaving" :disabled="!packageForm.packageVersionId" @click="assignPackage" />
        </div>
        <div class="rounded-md border border-default p-3 space-y-3">
          <div class="text-sm font-medium">Create a reusable package from this profile</div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <UInput v-model="newPackage.name" placeholder="Package name" />
            <UInput v-model="newPackage.includedVolumes" placeholder="facebook: 8, linkedin: 4" />
            <UInput v-model.number="newPackage.approvalSlaHours" type="number" min="0" placeholder="Approval SLA hours" />
            <USelectMenu v-model="newPackage.overagePolicy" :items="[{ label: 'Warn', value: 'warn' }, { label: 'Block', value: 'block' }, { label: 'Quote before work', value: 'quote-before-work' }, { label: 'Allow', value: 'allow' }]" value-key="value" />
          </div>
          <UButton label="Create package version" color="neutral" variant="subtle" :loading="packageSaving" :disabled="!newPackage.name.trim()" @click="createPackageFromProfile" />
        </div>
        <USeparator />
        <section class="space-y-3" aria-labelledby="pending-evidence-heading">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div id="pending-evidence-heading" class="font-medium">Pending evidence review</div>
              <p class="text-sm text-muted">Preview mapped Monday work, import only what matters, then approve it before the client AI can use it.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton label="Preview Monday evidence" icon="i-lucide-scan-search" color="neutral" variant="subtle" :loading="evidenceTransitionLoading" @click="previewMondayEvidence" />
              <UButton v-if="mondayEvidencePreview.length" :label="`Import ${mondayEvidenceSelected.length} for review`" icon="i-lucide-import" :loading="evidenceTransitionLoading" :disabled="!mondayEvidenceSelected.length" @click="importMondayEvidence" />
            </div>
          </div>
          <div v-if="mondayEvidencePreview.length" class="max-h-72 overflow-y-auto rounded-md border border-default divide-y divide-default" aria-label="Monday evidence preview">
            <label v-for="item in mondayEvidencePreview" :key="item.sourceId" class="flex gap-3 p-3">
              <UCheckbox v-model="mondayEvidenceSelected" :value="item.sourceId" :disabled="Boolean(item.importedStatus)" class="mt-0.5" />
              <span class="min-w-0 flex-1">
                <span class="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <UBadge color="neutral" variant="subtle" size="xs">{{ item.evidenceType }}</UBadge>
                  <span>{{ item.projectName }}</span>
                  <UBadge v-if="item.importedStatus" :color="item.importedStatus === 'approved' ? 'success' : 'warning'" variant="subtle" size="xs">{{ item.importedStatus }}</UBadge>
                </span>
                <span class="mt-1 block text-sm font-medium">{{ item.title }}</span>
                <span class="mt-1 block text-xs text-muted line-clamp-2">{{ item.content }}</span>
              </span>
            </label>
          </div>
          <div v-if="pendingEvidence.length" class="max-h-96 overflow-y-auto rounded-md border border-warning/30 divide-y divide-default" aria-live="polite">
            <article v-for="item in pendingEvidence" :key="item.id" class="p-3">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <UBadge color="warning" variant="subtle" size="xs">{{ item.sourceSystem }}</UBadge>
                    <UBadge color="neutral" variant="outline" size="xs">{{ item.evidenceType }}</UBadge>
                    <span v-if="item.projectName">{{ item.projectName }}</span>
                    <span>{{ fmtDate(item.occurredAt) }}</span>
                  </div>
                  <div class="mt-1 text-sm font-medium">{{ item.title }}</div>
                  <p class="mt-1 text-sm text-muted line-clamp-3">{{ item.content }}</p>
                </div>
                <div class="flex shrink-0 gap-2">
                  <UButton label="Approve for AI" icon="i-lucide-badge-check" size="xs" :loading="evidenceReviewingId === item.id" :disabled="Boolean(evidenceReviewingId)" @click="reviewEvidence(item.id, 'approved')" />
                  <UButton label="Reject" icon="i-lucide-ban" color="neutral" variant="subtle" size="xs" :disabled="Boolean(evidenceReviewingId)" @click="reviewEvidence(item.id, 'rejected')" />
                  <UButton v-if="item.sourceUrl" :to="item.sourceUrl" target="_blank" icon="i-lucide-external-link" color="neutral" variant="ghost" size="xs" aria-label="Open Monday source" />
                </div>
              </div>
            </article>
          </div>
          <div v-else class="rounded-md border border-dashed border-default px-4 py-5 text-sm text-muted">No imported evidence is waiting for review.</div>
          <p class="text-xs text-muted">Slack stays disconnected until an approved OAuth connection or export is provided. Monday and Slack never become live AI dependencies.</p>
          <div v-if="isAdmin" class="rounded-md border border-default p-3 space-y-2">
            <div class="text-sm font-medium">Import Slack export for review</div>
            <p class="text-xs text-muted">Paste a JSON array of exported messages. Imports remain pending until an admin approves them.</p>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <UTextarea v-model="slackImportText" class="w-full col-span-full" :rows="4" placeholder='[{"title":"Decision","content":"...","sourceId":"slack-123"}]' />
              <div class="col-span-full">
                <UButton label="Import Slack evidence" icon="i-lucide-upload" color="neutral" variant="subtle" :loading="slackImporting" :disabled="!slackImportText.trim()" @click="importSlackEvidence" />
              </div>
            </div>
          </div>
        </section>
        <USeparator />
        <div class="space-y-3">
          <div>
            <div class="font-medium">Approved client guidance</div>
            <p class="text-sm text-muted">Capture decisions in XeroFlow so this platform—not Monday or Slack—becomes the authoritative brief for recommendations.</p>
          </div>
          <div v-if="governance?.evidence.approved.length" class="space-y-1">
            <div v-for="item in governance.evidence.approved" :key="item.id" class="text-sm"><UBadge color="neutral" variant="subtle" size="xs">{{ item.evidence_type }}</UBadge> {{ item.title }}</div>
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <USelectMenu v-model="evidenceForm.evidenceType" :items="[{ label: 'Decision', value: 'decision' }, { label: 'Approved brief', value: 'brief' }, { label: 'Plan', value: 'plan' }, { label: 'Performance finding', value: 'performance' }]" value-key="value" />
            <UInput v-model="evidenceForm.title" placeholder="Guidance title" />
            <UTextarea v-model="evidenceForm.content" class="w-full col-span-full" :rows="3" placeholder="Approved instruction, decision, or finding" />
            <div class="col-span-full">
              <UButton label="Approve into XeroFlow guidance" icon="i-lucide-badge-check" :loading="evidenceSaving" :disabled="!evidenceForm.title.trim() || !evidenceForm.content.trim()" @click="saveCanonicalEvidence" />
            </div>
          </div>
        </div>
      </template>
    </div>
    <div v-if="showSourceSettings" class="rounded-lg border border-default bg-default p-4 mb-5 space-y-3">
      <div class="text-sm font-medium">News source plug-in</div>
      <UInput v-model="sourceUrl" label="Endpoint URL" class="w-full" />
      <UCheckbox v-model="sourceEnabled" label="Enabled" />
      <div class="flex gap-2"><UButton label="Save" :loading="sourceSaving" @click="saveSourceSettings" /><UButton label="Cancel" color="neutral" variant="ghost" @click="closeSourceSettings" /></div>
    </div>
    <div v-if="showDraftOptions" class="rounded-lg border border-primary/30 bg-default p-4 mb-5 space-y-3">
      <div class="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"><span class="font-medium">AI planning inputs</span><span v-if="recommendation">{{ recommendation.platforms.join(', ') || 'No matching platforms' }}<span v-if="recommendation.audience"> · audience: {{ recommendation.audience }}</span><span v-if="recommendation.nextSlot"> · next slot: {{ new Date(recommendation.nextSlot).toLocaleString() }}</span><UBadge v-if="recommendation.article" :color="recommendation.article.relevant ? 'success' : 'warning'" variant="subtle" size="xs">{{ recommendation.article.relevant ? 'Matches client brief' : 'Review relevance' }}</UBadge><span v-for="account in recommendation.accounts" :key="account.id" class="inline-flex items-center gap-1"><UBadge :color="account.health === 'ready' ? 'success' : 'error'" variant="subtle" size="xs">{{ account.platform }} {{ account.health }}</UBadge></span></span><span v-else class="text-muted">Use the selected article, client brief, and engagement history to suggest a starting point.</span><UButton label="Suggest" size="xs" color="neutral" variant="subtle" :loading="recommendationLoading" @click="loadRecommendation" /></div>
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
      <div class="flex flex-wrap items-center gap-2"><UButton label="Create drafts" :loading="draftSaving" :disabled="!clientId || !platforms.length || !publishTargetCount || draftSaving" @click="createDrafts" /><span v-if="clientId && platforms.length && !publishTargetCount" class="text-xs text-warning">Select at least one connected account for the chosen platform(s).</span><UButton label="Cancel" color="neutral" variant="ghost" @click="closeDraftOptions" /></div>
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
