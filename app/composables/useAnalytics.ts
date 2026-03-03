/**
 * Analytics composable — manages filter state, API calls, and formatting helpers
 * for the cross-platform marketing analytics dashboard.
 */

export interface AnalyticsFilters {
  startDate: string
  endDate: string
  platforms: string[]
  clientId: string | null
  groupBy: 'day' | 'week' | 'month'
  metric: string
}

const ALL_PLATFORM_KEYS = ['meta', 'google_ads', 'tiktok', 'linkedin', 'pinterest', 'snapchat', 'twitter', 'microsoft_ads']

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok: 'TikTok Ads',
  linkedin: 'LinkedIn Ads',
  pinterest: 'Pinterest Ads',
  snapchat: 'Snapchat Ads',
  twitter: 'X (Twitter) Ads',
  microsoft_ads: 'Microsoft Ads',
}

const PLATFORM_COLORS: Record<string, string> = {
  meta: '#1877F2',
  google_ads: '#4285F4',
  tiktok: '#010101',
  linkedin: '#0A66C2',
  pinterest: '#E60023',
  snapchat: '#FFFC00',
  twitter: '#1DA1F2',
  microsoft_ads: '#00A4EF',
}

const PLATFORM_ICONS: Record<string, string> = {
  meta: 'i-lucide-facebook',
  google_ads: 'i-lucide-chrome',
  tiktok: 'i-lucide-music',
  linkedin: 'i-lucide-linkedin',
  pinterest: 'i-lucide-pin',
  snapchat: 'i-lucide-ghost',
  twitter: 'i-lucide-twitter',
  microsoft_ads: 'i-lucide-monitor',
}

export function useAnalytics() {
  const route = useRoute()
  const router = useRouter()

  // Default date range: last 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)

  const filters = useState<AnalyticsFilters>('analytics-filters', () => ({
    startDate: (route.query.startDate as string) || formatDateISO(thirtyDaysAgo),
    endDate: (route.query.endDate as string) || formatDateISO(now),
    platforms: route.query.platform ? (route.query.platform as string).split(',') : [],
    clientId: (route.query.clientId as string) || null,
    groupBy: (route.query.groupBy as AnalyticsFilters['groupBy']) || 'day',
    metric: (route.query.metric as string) || 'spend',
  }))

  // Build query params for API calls
  const apiQuery = computed(() => {
    const q: Record<string, string> = {
      startDate: filters.value.startDate,
      endDate: filters.value.endDate,
    }
    if (filters.value.platforms.length > 0) {
      q.platform = filters.value.platforms.join(',')
    }
    if (filters.value.clientId) {
      q.clientId = filters.value.clientId
    }
    return q
  })

  // Update URL query params when filters change
  function updateFilters(partial: Partial<AnalyticsFilters>) {
    filters.value = { ...filters.value, ...partial }
    const query: Record<string, string> = {}
    if (filters.value.startDate) query.startDate = filters.value.startDate
    if (filters.value.endDate) query.endDate = filters.value.endDate
    if (filters.value.platforms.length > 0) query.platform = filters.value.platforms.join(',')
    if (filters.value.clientId) query.clientId = filters.value.clientId
    if (filters.value.groupBy !== 'day') query.groupBy = filters.value.groupBy
    if (filters.value.metric !== 'spend') query.metric = filters.value.metric
    router.replace({ query })
  }

  // Formatting helpers
  function fmtCurrency(value: number | null | undefined, decimals = 0): string {
    if (value == null) return '-'
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value)
  }

  function fmtNumber(value: number | null | undefined): string {
    if (value == null) return '-'
    return new Intl.NumberFormat('en-AU').format(Math.round(value))
  }

  function fmtCompact(value: number | null | undefined): string {
    if (value == null) return '-'
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toFixed(0)
  }

  function fmtPercent(value: number | null | undefined, decimals = 2): string {
    if (value == null) return '-'
    return `${value.toFixed(decimals)}%`
  }

  function fmtMetric(value: number | null | undefined, metric: string): string {
    if (value == null) return '-'
    switch (metric) {
      case 'spend':
      case 'revenue':
      case 'cpc':
      case 'cpm':
      case 'costPerConversion':
        return fmtCurrency(value, 2)
      case 'ctr':
        return fmtPercent(value)
      case 'roas':
        return value.toFixed(2) + 'x'
      case 'impressions':
      case 'clicks':
      case 'conversions':
        return fmtCompact(value)
      default:
        return fmtNumber(value)
    }
  }

  function getPlatformLabel(key: string): string {
    return PLATFORM_LABELS[key] || key
  }

  function getPlatformColor(key: string): string {
    return PLATFORM_COLORS[key] || '#6B7280'
  }

  function getPlatformIcon(key: string): string {
    return PLATFORM_ICONS[key] || 'i-lucide-globe'
  }

  // Date presets
  function setDatePreset(preset: string) {
    const today = new Date()
    let start: Date
    switch (preset) {
      case '7d':
        start = new Date(today)
        start.setDate(today.getDate() - 7)
        break
      case '30d':
        start = new Date(today)
        start.setDate(today.getDate() - 30)
        break
      case '90d':
        start = new Date(today)
        start.setDate(today.getDate() - 90)
        break
      case 'mtd':
        start = new Date(today.getFullYear(), today.getMonth(), 1)
        break
      case 'last-month': {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        const end = new Date(today.getFullYear(), today.getMonth(), 0)
        updateFilters({ startDate: formatDateISO(start), endDate: formatDateISO(end) })
        return
      }
      case 'ytd':
        start = new Date(today.getFullYear(), 0, 1)
        break
      default:
        start = new Date(today)
        start.setDate(today.getDate() - 30)
    }
    updateFilters({ startDate: formatDateISO(start), endDate: formatDateISO(today) })
  }

  return {
    filters,
    apiQuery,
    updateFilters,
    setDatePreset,
    fmtCurrency,
    fmtNumber,
    fmtCompact,
    fmtPercent,
    fmtMetric,
    getPlatformLabel,
    getPlatformColor,
    getPlatformIcon,
    ALL_PLATFORM_KEYS,
    PLATFORM_LABELS,
    PLATFORM_COLORS,
    PLATFORM_ICONS,
  }
}

function formatDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
