/**
 * Module-scope composable managing the Meta Ad Upload wizard state.
 * Singleton pattern — same state shared across all step components.
 */
import { FORMATS } from '~/utils/banner-constants'
import { getAspectRatio, getMetaPlacements } from '~/utils/banner-placement-matcher'

// ── Types ──
export interface UploadCreativeItem {
  publishedId: string
  formatKey: string
  width: number
  height: number
  url: string
  aspectRatio: string
  placements: string[]
}

export interface UploadProgressItem {
  publishedId: string
  formatKey: string
  step: 'queued' | 'image' | 'creative' | 'ad' | 'done' | 'error'
  stepLabel: string
  error?: string
}

export interface TextPreset {
  name: string
  primaryTexts: string[]
  headlines: string[]
  descriptions: string[]
  callToAction: string
  linkUrl: string
}

const STEP_LABELS: Record<string, string> = {
  queued: 'Waiting',
  image: 'Uploading Image',
  creative: 'Creating Creative',
  ad: 'Creating Ad',
  done: 'Complete',
  error: 'Failed',
}

// ── CTA options ──
export const CTA_OPTIONS = [
  { label: 'Learn More', value: 'LEARN_MORE' },
  { label: 'Shop Now', value: 'SHOP_NOW' },
  { label: 'Sign Up', value: 'SIGN_UP' },
  { label: 'Contact Us', value: 'CONTACT_US' },
  { label: 'Download', value: 'DOWNLOAD' },
  { label: 'Get Offer', value: 'GET_OFFER' },
  { label: 'Book Now', value: 'BOOK_NOW' },
  { label: 'Apply Now', value: 'APPLY_NOW' },
  { label: 'Subscribe', value: 'SUBSCRIBE' },
  { label: 'Watch More', value: 'WATCH_MORE' },
]

// ── Module-scope state ──
const step = ref(1)
const connectionId = ref('')
const campaignId = ref('')
const campaignName = ref('')
const adSetId = ref('')
const adSetName = ref('')
const pageId = ref('')
const selectedPublishedIds = ref<string[]>([])
const primaryTexts = ref<string[]>([''])
const headlines = ref<string[]>([''])
const descriptions = ref<string[]>([''])
const callToAction = ref('LEARN_MORE')
const linkUrl = ref('')
const adNamePattern = ref('{ProjectName} - {Format} - {Date}')
const adStatus = ref<'PAUSED' | 'ACTIVE'>('PAUSED')

const connections = ref<any[]>([])
const campaigns = ref<any[]>([])
const adSets = ref<any[]>([])
const pages = ref<any[]>([])
const published = ref<any[]>([])
const adPublishes = ref<any[]>([])

const uploadProgress = ref<UploadProgressItem[]>([])
const isUploading = ref(false)
const uploadComplete = ref(false)

// Cache keys to avoid re-fetching
let _cachedConnectionId = ''
let _cachedCampaignId = ''

export function useMetaAdUpload() {
  // ── Computed ──
  const metaConnections = computed(() =>
    connections.value.filter((c: any) => c.platform === 'meta'),
  )

  const selectedConnection = computed(() =>
    metaConnections.value.find((c: any) => c.id === connectionId.value),
  )

  const hasAdsManagement = computed(() => {
    const conn = selectedConnection.value
    if (!conn) return false
    const scopes: string[] = conn.scopes || []
    return scopes.includes('ads_management')
  })

  const livePublished = computed(() =>
    (published.value || []).filter((p: any) => p.isLive || p.publishedAt),
  )

  const publishedByProject = computed(() => {
    const groups: Record<string, { projectName: string; items: any[] }> = {}
    for (const p of livePublished.value) {
      const pid = p.projectId || 'unknown'
      if (!groups[pid]) {
        groups[pid] = { projectName: p.projectName || 'Unknown Project', items: [] }
      }
      groups[pid].items.push(p)
    }
    return groups
  })

  const groupedCreatives = computed(() => {
    const groups: Record<string, UploadCreativeItem[]> = {}
    for (const p of livePublished.value) {
      const ratio = getAspectRatio(p.width, p.height)
      const placements = getMetaPlacements(p.width, p.height)
      const item: UploadCreativeItem = {
        publishedId: p.id,
        formatKey: p.formatKey,
        width: p.width,
        height: p.height,
        url: p.url,
        aspectRatio: ratio,
        placements,
      }
      if (!groups[ratio]) groups[ratio] = []
      groups[ratio].push(item)
    }
    return groups
  })

  const selectedCreatives = computed(() =>
    livePublished.value.filter((p: any) => selectedPublishedIds.value.includes(p.id)),
  )

  const overallProgress = computed(() => {
    if (!uploadProgress.value.length) return 0
    const done = uploadProgress.value.filter(p => p.step === 'done' || p.step === 'error').length
    return Math.round((done / uploadProgress.value.length) * 100)
  })

  const canProceedStep1 = computed(() => connectionId.value && hasAdsManagement.value)
  const canProceedStep2 = computed(() => campaignId.value && adSetId.value)
  const canProceedStep3 = computed(() => selectedPublishedIds.value.length > 0)
  const canProceedStep4 = computed(() => {
    const hasText = primaryTexts.value.some(t => t.trim().length > 0)
    const hasHeadline = headlines.value.some(t => t.trim().length > 0)
    const hasCta = !!callToAction.value
    const hasUrl = !!linkUrl.value && /^https?:\/\/.+/.test(linkUrl.value)
    const hasPage = !!pageId.value
    return hasText && hasHeadline && hasCta && hasUrl && hasPage
  })

  // ── Fetchers ──
  async function fetchConnections() {
    try {
      const data = await $fetch<any[]>('/api/agency/social/connections')
      connections.value = data || []
    } catch {
      connections.value = []
    }
  }

  async function fetchCampaigns() {
    if (!connectionId.value) return
    if (_cachedConnectionId === connectionId.value && campaigns.value.length) return
    try {
      const data = await $fetch<{ campaigns: any[] }>(
        `/api/agency/banner-studio/ad-publish/meta/campaigns`,
        { query: { connectionId: connectionId.value } },
      )
      campaigns.value = data.campaigns || []
      _cachedConnectionId = connectionId.value
    } catch {
      campaigns.value = []
    }
  }

  async function fetchAdSets() {
    if (!connectionId.value || !campaignId.value) return
    if (_cachedCampaignId === campaignId.value && adSets.value.length) return
    try {
      const data = await $fetch<{ adSets: any[] }>(
        `/api/agency/banner-studio/ad-publish/meta/adsets`,
        { query: { connectionId: connectionId.value, campaignId: campaignId.value } },
      )
      adSets.value = data.adSets || []
      _cachedCampaignId = campaignId.value
    } catch {
      adSets.value = []
    }
  }

  async function fetchPages() {
    if (!connectionId.value || pages.value.length) return
    try {
      const data = await $fetch<{ pages: any[] }>(
        `/api/agency/banner-studio/ad-publish/meta/pages`,
        { query: { connectionId: connectionId.value } },
      )
      pages.value = data.pages || []
    } catch {
      pages.value = []
    }
  }

  async function fetchPublished(projectId: string) {
    try {
      const data = await $fetch<any[]>(
        `/api/agency/banner-studio/published/by-project/${projectId}`,
      )
      published.value = data || []
    } catch {
      published.value = []
    }
  }

  async function fetchAllPublished(limit = 200) {
    try {
      const data = await $fetch<any[]>(
        `/api/agency/banner-studio/published/with-projects`,
        { query: { limit } },
      )
      published.value = data || []
    } catch {
      published.value = []
    }
  }

  async function fetchAdPublishes(projectId: string) {
    try {
      const data = await $fetch<any[]>(
        `/api/agency/banner-studio/ad-publish?projectId=${projectId}`,
      )
      adPublishes.value = data || []
    } catch {
      adPublishes.value = []
    }
  }

  // ── Upload flow ──
  async function uploadAll(projectId: string) {
    if (isUploading.value) return
    isUploading.value = true
    uploadComplete.value = false

    // Build progress items
    uploadProgress.value = selectedCreatives.value.map((p: any) => ({
      publishedId: p.id,
      formatKey: p.formatKey,
      step: 'queued' as const,
      stepLabel: STEP_LABELS.queued,
    }))

    const cleanTexts = primaryTexts.value.filter(t => t.trim())
    const cleanHeadlines = headlines.value.filter(t => t.trim())
    const cleanDescriptions = descriptions.value.filter(t => t.trim())

    for (let i = 0; i < uploadProgress.value.length; i++) {
      const progress = uploadProgress.value[i]
      const pub = selectedCreatives.value.find((p: any) => p.id === progress.publishedId)
      if (!pub) continue

      const formatName = FORMATS[progress.formatKey]?.name || progress.formatKey
      const date = new Date().toISOString().slice(0, 10)
      const adName = adNamePattern.value
        .replace('{ProjectName}', 'Banner')
        .replace('{Format}', formatName)
        .replace('{Date}', date)

      // Update step: image
      progress.step = 'image'
      progress.stepLabel = STEP_LABELS.image

      try {
        await $fetch('/api/agency/banner-studio/ad-publish/meta', {
          method: 'POST',
          body: {
            publishedId: progress.publishedId,
            connectionId: connectionId.value,
            campaignId: campaignId.value,
            adSetId: adSetId.value,
            pageId: pageId.value,
            primaryTexts: cleanTexts,
            headlines: cleanHeadlines,
            descriptions: cleanDescriptions,
            callToAction: callToAction.value,
            linkUrl: linkUrl.value,
            adName,
            status: adStatus.value,
          },
        })

        progress.step = 'done'
        progress.stepLabel = STEP_LABELS.done
      } catch (err: any) {
        progress.step = 'error'
        progress.stepLabel = STEP_LABELS.error
        progress.error = err?.data?.statusMessage || err.message || 'Upload failed'
      }

      // Rate limit spacing between uploads
      if (i < uploadProgress.value.length - 1) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    isUploading.value = false
    uploadComplete.value = true
    await fetchAdPublishes(projectId)
  }

  async function uploadAllBulk() {
    if (isUploading.value) return
    isUploading.value = true
    uploadComplete.value = false

    uploadProgress.value = selectedCreatives.value.map((p: any) => ({
      publishedId: p.id,
      formatKey: p.formatKey,
      step: 'queued' as const,
      stepLabel: STEP_LABELS.queued,
    }))

    const cleanTexts = primaryTexts.value.filter(t => t.trim())
    const cleanHeadlines = headlines.value.filter(t => t.trim())
    const cleanDescriptions = descriptions.value.filter(t => t.trim())

    for (let i = 0; i < uploadProgress.value.length; i++) {
      const progress = uploadProgress.value[i]
      const pub = selectedCreatives.value.find((p: any) => p.id === progress.publishedId)
      if (!pub) continue

      const formatName = FORMATS[progress.formatKey]?.name || progress.formatKey
      const projectName = pub.projectName || 'Banner'
      const date = new Date().toISOString().slice(0, 10)
      const adName = adNamePattern.value
        .replace('{ProjectName}', projectName)
        .replace('{Format}', formatName)
        .replace('{Date}', date)

      progress.step = 'image'
      progress.stepLabel = STEP_LABELS.image

      try {
        await $fetch('/api/agency/banner-studio/ad-publish/meta', {
          method: 'POST',
          body: {
            publishedId: progress.publishedId,
            connectionId: connectionId.value,
            campaignId: campaignId.value,
            adSetId: adSetId.value,
            pageId: pageId.value,
            primaryTexts: cleanTexts,
            headlines: cleanHeadlines,
            descriptions: cleanDescriptions,
            callToAction: callToAction.value,
            linkUrl: linkUrl.value,
            adName,
            status: adStatus.value,
          },
        })

        progress.step = 'done'
        progress.stepLabel = STEP_LABELS.done
      } catch (err: any) {
        progress.step = 'error'
        progress.stepLabel = STEP_LABELS.error
        progress.error = err?.data?.statusMessage || err.message || 'Upload failed'
      }

      if (i < uploadProgress.value.length - 1) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    isUploading.value = false
    uploadComplete.value = true
  }

  // ── Text presets (localStorage) ──
  function saveTextPreset(name: string) {
    const presets = loadTextPresets()
    presets.push({
      name,
      primaryTexts: [...primaryTexts.value],
      headlines: [...headlines.value],
      descriptions: [...descriptions.value],
      callToAction: callToAction.value,
      linkUrl: linkUrl.value,
    })
    localStorage.setItem('meta-ad-text-presets', JSON.stringify(presets))
  }

  function loadTextPresets(): TextPreset[] {
    try {
      return JSON.parse(localStorage.getItem('meta-ad-text-presets') || '[]')
    } catch {
      return []
    }
  }

  function applyTextPreset(preset: TextPreset) {
    primaryTexts.value = [...preset.primaryTexts]
    headlines.value = [...preset.headlines]
    descriptions.value = [...preset.descriptions]
    callToAction.value = preset.callToAction
    linkUrl.value = preset.linkUrl
  }

  function deleteTextPreset(name: string) {
    const presets = loadTextPresets().filter(p => p.name !== name)
    localStorage.setItem('meta-ad-text-presets', JSON.stringify(presets))
  }

  // ── Reset ──
  function reset() {
    step.value = 1
    connectionId.value = ''
    campaignId.value = ''
    campaignName.value = ''
    adSetId.value = ''
    adSetName.value = ''
    pageId.value = ''
    selectedPublishedIds.value = []
    primaryTexts.value = ['']
    headlines.value = ['']
    descriptions.value = ['']
    callToAction.value = 'LEARN_MORE'
    linkUrl.value = ''
    adNamePattern.value = '{ProjectName} - {Format} - {Date}'
    adStatus.value = 'PAUSED'
    campaigns.value = []
    adSets.value = []
    pages.value = []
    uploadProgress.value = []
    isUploading.value = false
    uploadComplete.value = false
    _cachedConnectionId = ''
    _cachedCampaignId = ''
  }

  // ── Navigation ──
  function nextStep() {
    if (step.value < 5) step.value++
  }

  function prevStep() {
    if (step.value > 1) step.value--
  }

  function goToStep(s: number) {
    if (s >= 1 && s <= 5) step.value = s
  }

  return {
    // State
    step,
    connectionId,
    campaignId,
    campaignName,
    adSetId,
    adSetName,
    pageId,
    selectedPublishedIds,
    primaryTexts,
    headlines,
    descriptions,
    callToAction,
    linkUrl,
    adNamePattern,
    adStatus,
    connections,
    campaigns,
    adSets,
    pages,
    published,
    adPublishes,
    uploadProgress,
    isUploading,
    uploadComplete,

    // Computed
    metaConnections,
    selectedConnection,
    hasAdsManagement,
    livePublished,
    publishedByProject,
    groupedCreatives,
    selectedCreatives,
    overallProgress,
    canProceedStep1,
    canProceedStep2,
    canProceedStep3,
    canProceedStep4,

    // Actions
    fetchConnections,
    fetchCampaigns,
    fetchAdSets,
    fetchPages,
    fetchPublished,
    fetchAllPublished,
    fetchAdPublishes,
    uploadAll,
    uploadAllBulk,
    saveTextPreset,
    loadTextPresets,
    applyTextPreset,
    deleteTextPreset,
    reset,
    nextStep,
    prevStep,
    goToStep,
  }
}
