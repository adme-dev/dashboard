import { computed, readonly, ref } from 'vue'
import { bannerFontFamily, matchingBannerFontWeight, parseBannerFontTags as parseFontTags } from '~~/shared/banner/fonts'

// Google Fonts + Custom Font integration for Banner Studio
// Embeds curated list of 120+ popular fonts with on-demand loading
// Supports custom font uploads via R2 with @font-face injection

export interface GoogleFont {
  family: string
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace' | 'custom'
  weights: number[]
}

export interface CustomFont {
  id: string
  clientId: string | null
  sha256: string | null
  name: string // font-family name (used as font-family in @font-face)
  mimeType: string
  fileSize: number
  r2Key: string
  url: string // R2 public URL for @font-face src
  tags: string[] // TEXT[] from DB: ['font', 'weight:400', 'format:woff2']
  uploadedBy: string
  createdAt: string
}

export { parseBannerFontTags as parseFontTags } from '~~/shared/banner/fonts'

/** Validate URL is safe for CSS injection */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://placeholder.com')
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || url.startsWith('/api/')
  } catch {
    return false
  }
}

// Module-scope state (singleton)
const loadedFonts = new Set<string>()
const loadedCustomFonts = new Map<string, HTMLStyleElement>()

function customFontKey(font: CustomFont): string {
  return String(font.id).toLowerCase()
}

function unloadCustomFont(font: CustomFont) {
  const key = customFontKey(font)
  loadedCustomFonts.get(key)?.remove()
  loadedCustomFonts.delete(key)
}
const recentFonts = ref<string[]>([])
const customFonts = ref<CustomFont[]>([])
let recentLoaded = false
const customFontsFetch = new Map<string, Promise<void>>()
let lastCatalogRequest: Promise<void> | null = null

function loadRecentFromStorage() {
  if (recentLoaded) return
  recentLoaded = true
  try {
    const stored = localStorage.getItem('banner-recent-fonts')
    if (stored) {
      const data = JSON.parse(stored)
      if (Array.isArray(data)) recentFonts.value = data
    }
  } catch {
    // Storage may be unavailable; font selection still works in memory.
  }
}

function saveRecent() {
  try {
    localStorage.setItem('banner-recent-fonts', JSON.stringify(recentFonts.value))
  } catch {
    // Storage may be unavailable; font selection still works in memory.
  }
}

// Top 120+ Google Fonts by popularity — compact embedded list
const GOOGLE_FONTS: GoogleFont[] = [
  // Sans-Serif
  { family: 'Inter', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Roboto', category: 'sans-serif', weights: [300, 400, 500, 700, 900] },
  { family: 'Open Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Montserrat', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Lato', category: 'sans-serif', weights: [300, 400, 700, 900] },
  { family: 'Poppins', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Nunito', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Nunito Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Raleway', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Ubuntu', category: 'sans-serif', weights: [300, 400, 500, 700] },
  { family: 'Rubik', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Work Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Manrope', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'DM Sans', category: 'sans-serif', weights: [400, 500, 700] },
  { family: 'Barlow', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Barlow Condensed', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Barlow Semi Condensed', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Source Sans 3', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'PT Sans', category: 'sans-serif', weights: [400, 700] },
  { family: 'Karla', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Cabin', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Outfit', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Figtree', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Archivo', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Archivo Black', category: 'sans-serif', weights: [400] },
  { family: 'Oswald', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Titillium Web', category: 'sans-serif', weights: [300, 400, 600, 700, 900] },
  { family: 'Mukta', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Quicksand', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Mulish', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Noto Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Fira Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Fira Sans Condensed', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Lexend', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Overpass', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Exo 2', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'IBM Plex Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Roboto Condensed', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Bebas Neue', category: 'sans-serif', weights: [400] },
  { family: 'Anton', category: 'sans-serif', weights: [400] },
  { family: 'Kanit', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  // Serif
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900] },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'PT Serif', category: 'serif', weights: [400, 700] },
  { family: 'Noto Serif', category: 'serif', weights: [400, 700] },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Crimson Text', category: 'serif', weights: [400, 600, 700] },
  { family: 'EB Garamond', category: 'serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Bitter', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'DM Serif Display', category: 'serif', weights: [400] },
  { family: 'Josefin Slab', category: 'serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Spectral', category: 'serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Fraunces', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Bodoni Moda', category: 'serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Source Serif 4', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'IBM Plex Serif', category: 'serif', weights: [300, 400, 500, 600, 700] },
  // Display
  { family: 'Abril Fatface', category: 'display', weights: [400] },
  { family: 'Righteous', category: 'display', weights: [400] },
  { family: 'Bungee', category: 'display', weights: [400] },
  { family: 'Alfa Slab One', category: 'display', weights: [400] },
  { family: 'Passion One', category: 'display', weights: [400, 700, 900] },
  { family: 'Black Ops One', category: 'display', weights: [400] },
  { family: 'Teko', category: 'display', weights: [300, 400, 500, 600, 700] },
  { family: 'Fredoka', category: 'display', weights: [300, 400, 500, 600, 700] },
  { family: 'Comfortaa', category: 'display', weights: [300, 400, 500, 600, 700] },
  { family: 'Staatliches', category: 'display', weights: [400] },
  { family: 'Russo One', category: 'display', weights: [400] },
  { family: 'Permanent Marker', category: 'display', weights: [400] },
  { family: 'Lilita One', category: 'display', weights: [400] },
  { family: 'Lobster', category: 'display', weights: [400] },
  { family: 'Pacifico', category: 'display', weights: [400] },
  { family: 'Monoton', category: 'display', weights: [400] },
  { family: 'Ultra', category: 'display', weights: [400] },
  { family: 'Bowlby One SC', category: 'display', weights: [400] },
  { family: 'Bungee Shade', category: 'display', weights: [400] },
  { family: 'Audiowide', category: 'display', weights: [400] },
  // Handwriting
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700] },
  { family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700] },
  { family: 'Great Vibes', category: 'handwriting', weights: [400] },
  { family: 'Sacramento', category: 'handwriting', weights: [400] },
  { family: 'Kalam', category: 'handwriting', weights: [300, 400, 700] },
  { family: 'Indie Flower', category: 'handwriting', weights: [400] },
  { family: 'Satisfy', category: 'handwriting', weights: [400] },
  { family: 'Covered By Your Grace', category: 'handwriting', weights: [400] },
  { family: 'Shadows Into Light', category: 'handwriting', weights: [400] },
  { family: 'Alex Brush', category: 'handwriting', weights: [400] },
  // Monospace
  { family: 'Fira Code', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { family: 'JetBrains Mono', category: 'monospace', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Source Code Pro', category: 'monospace', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Roboto Mono', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { family: 'Space Mono', category: 'monospace', weights: [400, 700] },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { family: 'Inconsolata', category: 'monospace', weights: [300, 400, 500, 600, 700, 800, 900] }
]

// System fonts (always available, no loading needed)
const SYSTEM_FONTS: GoogleFont[] = [
  { family: 'Arial', category: 'sans-serif', weights: [400, 700] },
  { family: 'Helvetica', category: 'sans-serif', weights: [400, 700] },
  { family: 'Georgia', category: 'serif', weights: [400, 700] },
  { family: 'Times New Roman', category: 'serif', weights: [400, 700] },
  { family: 'Courier New', category: 'monospace', weights: [400, 700] },
  { family: 'Verdana', category: 'sans-serif', weights: [400, 700] },
  { family: 'Trebuchet MS', category: 'sans-serif', weights: [400, 700] },
  { family: 'Impact', category: 'sans-serif', weights: [400] }
]

const SYSTEM_FONT_FAMILIES = new Set(SYSTEM_FONTS.map(f => f.family))

export const FONT_CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Custom', value: 'custom' },
  { label: 'Sans', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Display', value: 'display' },
  { label: 'Script', value: 'handwriting' },
  { label: 'Mono', value: 'monospace' },
  { label: 'System', value: 'system' }
] as const

export type FontCategory = typeof FONT_CATEGORIES[number]['value']

export function useBannerFonts(clientScope?: () => string | null | undefined) {
  const apiFetch = <T = unknown>(request: string, options?: { method?: string, body?: unknown, query?: Record<string, string> }) => ($fetch as (request: string, options?: unknown) => Promise<T>)(request, options)
  loadRecentFromStorage()
  const visibleFonts = computed(() => {
    const clientId = clientScope?.()
    return clientId === undefined
      ? customFonts.value
      : customFonts.value.filter(font => !font.clientId || font.clientId === clientId)
          .sort((a, b) => Number(b.clientId === clientId) - Number(a.clientId === clientId))
  })

  /** Custom fonts as GoogleFont entries for unified search */
  const customFontEntries = computed<GoogleFont[]>(() => {
    const families = new Map<string, Set<number>>()
    for (const font of visibleFonts.value) {
      if (!families.has(font.name)) families.set(font.name, new Set())
      families.get(font.name)!.add(parseFontTags(font.tags).weight)
    }
    return [...families].map(([family, weights]) => ({
      family, category: 'custom', weights: [...weights].sort((a, b) => a - b)
    }))
  })

  const allFonts = computed(() => [...customFontEntries.value, ...GOOGLE_FONTS, ...SYSTEM_FONTS])

  /** Check if a font family is a custom upload */
  function isCustomFont(family: string): boolean {
    return visibleFonts.value.some(cf => cf.name === family)
  }

  /** Get custom font record by family name */
  function getCustomFont(family: string, weight?: number): CustomFont | undefined {
    const familyFaces = visibleFonts.value.filter(face => face.name === family)
    const matchedWeight = matchingBannerFontWeight(familyFaces.map(face => parseFontTags(face.tags).weight), weight)
    return familyFaces.find(face => parseFontTags(face.tags).weight === matchedWeight)
  }

  function searchFonts(query: string, category: FontCategory = 'all'): GoogleFont[] {
    let list: GoogleFont[]
    if (category === 'system') {
      list = SYSTEM_FONTS
    } else if (category === 'custom') {
      list = customFontEntries.value
    } else if (category === 'all') {
      list = allFonts.value
    } else {
      list = allFonts.value.filter(f => f.category === category)
    }

    if (!query) return list

    const q = query.toLowerCase()
    return list.filter(f => f.family.toLowerCase().includes(q))
  }

  function getFont(family: string): GoogleFont | undefined {
    return allFonts.value.find(f => f.family === family)
  }

  function isSystemFont(family: string): boolean {
    return SYSTEM_FONT_FAMILIES.has(family)
  }

  /** Load a custom font by injecting @font-face CSS */
  function loadCustomFont(cf: CustomFont): Promise<void> {
    const family = cf.name
    const key = customFontKey(cf)
    if (!isSafeUrl(cf.url)) return Promise.resolve()
    const { weight, format } = parseFontTags(cf.tags)
    const winner = visibleFonts.value.find(font => font.name === family && parseFontTags(font.tags).weight === weight)
    const names = new Set([bannerFontFamily(family, cf.id)])
    // Legacy layers retain their family lookup; exact faces always have their own alias.
    if (winner?.id === cf.id) names.add(family)
    const css = [...names].map((name) => {
      const escapedFamily = name.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
      return `@font-face { font-family: '${escapedFamily}'; src: url('${cf.url}') format('${format}'); font-weight: ${weight}; font-display: swap; }`
    }).join('\n')
    const style = loadedCustomFonts.get(key) || document.createElement('style')
    style.textContent = css
    if (!style.parentNode) document.head.appendChild(style)
    loadedCustomFonts.set(key, style)
    return Promise.resolve()
  }

  /** Load a Google Font by injecting a <link> element. Returns a promise that resolves when loaded. */
  function loadFont(family: string, weights?: number[]): Promise<void> {
    // Every recorded weight is needed when the editor changes text weight later.
    const custom = getUsedCustomFonts([{ fontFamily: family }])
    if (custom.length) return Promise.all(custom.map(loadCustomFont)).then(() => {})
    if (SYSTEM_FONT_FAMILIES.has(family)) return Promise.resolve()

    const key = JSON.stringify([family, weights?.length ? weights : [400, 700]])
    if (loadedFonts.has(key)) return Promise.resolve()
    loadedFonts.add(key)

    const wts = weights?.length ? weights : [400, 700]
    const familyParam = family.replace(/ /g, '+')
    const wgts = wts.join(';')
    const url = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${wgts}&display=swap`

    return new Promise<void>((resolve) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = url
      link.onload = () => resolve()
      link.onerror = () => resolve() // graceful degradation
      document.head.appendChild(link)
    })
  }

  /** Track recently used fonts */
  function trackRecent(family: string) {
    const idx = recentFonts.value.indexOf(family)
    if (idx > -1) recentFonts.value.splice(idx, 1)
    recentFonts.value.unshift(family)
    if (recentFonts.value.length > 10) recentFonts.value.pop()
    saveRecent()
  }

  /** Load + track a font selection */
  function selectFont(family: string) {
    const font = getFont(family)
    if (font) loadFont(family, font.weights)
    else loadFont(family)
    trackRecent(family)
  }

  /** Refresh the shared catalog before import reuse; callers must handle lookup failures. */
  function refreshCustomFonts(clientId = clientScope?.()): Promise<CustomFont[]> {
    const scope = clientId === undefined ? '__all__' : clientId || '__agency__'
    const previous = lastCatalogRequest
    let response: CustomFont[] = []
    const request = (async () => {
      if (previous) await previous.catch(() => undefined)
      response = await apiFetch<CustomFont[]>('/api/agency/banner-studio/fonts', {
        query: clientId === undefined ? undefined : { clientId: clientId || '__agency__' }
      }) || []
      const retained = clientId === undefined ? [] : customFonts.value.filter(font => font.clientId && font.clientId !== clientId)
      customFonts.value = [...response, ...retained.filter(font => !response.some(item => item.id === font.id))]
      for (const [key, style] of loadedCustomFonts) {
        if (!customFonts.value.some(font => String(font.id).toLowerCase() === key)) {
          style.remove()
          loadedCustomFonts.delete(key)
        }
      }
      for (const font of customFonts.value) loadCustomFont(font)
    })()
    lastCatalogRequest = request
    customFontsFetch.set(scope, request)
    void request.catch(() => {
      if (customFontsFetch.get(scope) === request) customFontsFetch.delete(scope)
    })
    return request.then(() => response)
  }

  /** Editor previews share a cached request and degrade gracefully on lookup failure. */
  async function fetchCustomFonts(clientId = clientScope?.()): Promise<void> {
    const scope = clientId === undefined ? '__all__' : clientId || '__agency__'
    try {
      const pending = customFontsFetch.get(scope)
      if (pending) await pending
      else await refreshCustomFonts(clientId)
    } catch (error) {
      console.warn('Failed to fetch custom fonts:', error)
    }
  }

  /** Upload a custom font file */
  async function uploadCustomFont(file: File, familyName?: string, weight?: number, clientId?: string | null): Promise<CustomFont | null> {
    const formData = new FormData()
    formData.append('file', file)
    if (familyName) formData.append('family', familyName)
    if (weight !== undefined) formData.append('weight', String(weight))
    if (clientId) formData.append('clientId', clientId)

    try {
      const result = await apiFetch<CustomFont>('/api/agency/banner-studio/fonts/upload', {
        method: 'POST',
        body: formData
      })
      // An initial catalog request may contain a stale snapshot from before this upload.
      await Promise.allSettled([...customFontsFetch.values()])
      customFonts.value = [result, ...customFonts.value.filter(font => font.id !== result.id)]
      for (const font of customFonts.value) loadCustomFont(font)
      return result
    } catch (e) {
      console.error('Font upload failed:', e)
      throw e
    }
  }

  /** Delete a custom font */
  async function deleteCustomFont(id: string): Promise<void> {
    await apiFetch(`/api/agency/banner-studio/fonts/${id}`, { method: 'DELETE' })
    const idx = customFonts.value.findIndex(f => f.id === id)
    if (idx > -1) {
      const removed = customFonts.value[idx]
      customFonts.value.splice(idx, 1)
      unloadCustomFont(removed)
      const replacement = customFonts.value.find(font => customFontKey(font) === customFontKey(removed))
      if (replacement) loadCustomFont(replacement)
    }
  }

  /** Get unique Google font families from a layer set (excludes custom + system) */
  function getUsedFonts(layers: { fontFamily?: string, fontWeight?: number, fontAssetId?: string }[]): Map<string, Set<number>> {
    const fonts = new Map<string, Set<number>>()
    for (const l of layers) {
      if (!l.fontFamily || l.fontAssetId) continue
      if (SYSTEM_FONT_FAMILIES.has(l.fontFamily)) continue
      if (isCustomFont(l.fontFamily)) continue // custom fonts handled separately
      if (!fonts.has(l.fontFamily)) fonts.set(l.fontFamily, new Set())
      fonts.get(l.fontFamily)!.add(l.fontWeight || 400)
    }
    return fonts
  }

  /** Get custom fonts used in layers (for HTML export @font-face generation) */
  function getUsedCustomFonts(layers: { fontFamily?: string, fontAssetId?: string }[]): CustomFont[] {
    const families = new Set(layers.filter(layer => !layer.fontAssetId).map(layer => layer.fontFamily).filter(Boolean))
    const ids = new Set(layers.map(layer => layer.fontAssetId?.toLowerCase()).filter(Boolean))
    const used: CustomFont[] = []
    const seen = new Set<string>()
    for (const font of visibleFonts.value) {
      const legacyKey = JSON.stringify([font.name, parseFontTags(font.tags).weight])
      if (families.has(font.name) && !seen.has(legacyKey)) {
        used.push(font)
        seen.add(legacyKey)
      }
    }
    for (const font of customFonts.value) {
      if (ids.has(font.id.toLowerCase()) && !used.some(face => face.id === font.id)) used.push(font)
    }
    return used
  }

  /** Get custom fonts used in layers, formatted for HTML export options */
  function getExportCustomFonts(layers: { fontFamily?: string, fontAssetId?: string }[]): { id?: string, family: string, url: string, format: string, weight: number }[] {
    return getUsedCustomFonts(layers)
      .filter(cf => isSafeUrl(cf.url))
      .map((cf) => {
        const { weight, format } = parseFontTags(cf.tags)
        return { ...(layers.some(layer => layer.fontAssetId?.toLowerCase() === cf.id.toLowerCase()) ? { id: cf.id } : {}), family: cf.name, url: cf.url, format, weight }
      })
  }

  /** Build @font-face CSS rules for custom fonts used in layers (for HTML export) */
  function buildCustomFontsCss(layers: { fontFamily?: string, fontAssetId?: string }[]): string {
    const fonts = getUsedCustomFonts(layers).filter(cf => isSafeUrl(cf.url))
    if (fonts.length === 0) return ''

    return fonts.flatMap((cf) => {
      const { weight, format } = parseFontTags(cf.tags)
      const names = new Set<string>()
      if (layers.some(layer => layer.fontAssetId?.toLowerCase() === cf.id.toLowerCase())) names.add(bannerFontFamily(cf.name, cf.id))
      const winner = visibleFonts.value.find(face => face.name === cf.name && parseFontTags(face.tags).weight === weight)
      if (winner?.id === cf.id && layers.some(layer => !layer.fontAssetId && layer.fontFamily === cf.name)) names.add(cf.name)
      return [...names].map((name) => {
        const family = name.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
        return `@font-face { font-family: '${family}'; src: url('${cf.url}') format('${format}'); font-weight: ${weight}; font-display: swap; }`
      })
    }).join('\n')
  }

  /** Build Google Fonts CSS URL for HTML export */
  function buildGoogleFontsUrl(layers: { fontFamily?: string, fontWeight?: number, fontAssetId?: string }[]): string {
    const fonts = getUsedFonts(layers)
    if (fonts.size === 0) return ''

    const families = Array.from(fonts.entries())
      .map(([family, weights]) => {
        const fam = family.replace(/ /g, '+')
        const wts = Array.from(weights).sort((a, b) => a - b).join(';')
        return `family=${fam}:wght@${wts}`
      })
      .join('&')

    return `https://fonts.googleapis.com/css2?${families}&display=swap`
  }

  /** Load all fonts used in layers (for editor preview) */
  function loadUsedFonts(layers: { fontFamily?: string, fontWeight?: number, fontAssetId?: string }[]) {
    const fonts = getUsedFonts(layers)
    for (const [family, weights] of fonts) {
      loadFont(family, Array.from(weights))
    }
    // Also load any custom fonts used
    for (const cf of getUsedCustomFonts(layers)) {
      loadCustomFont(cf)
    }
  }

  return {
    allFonts,
    customFonts: readonly(visibleFonts),
    recentFonts: readonly(recentFonts),
    searchFonts,
    getFont,
    isSystemFont,
    isCustomFont,
    getCustomFont,
    loadFont,
    loadCustomFont,
    selectFont,
    trackRecent,
    fetchCustomFonts,
    refreshCustomFonts,
    uploadCustomFont,
    deleteCustomFont,
    getUsedFonts,
    getUsedCustomFonts,
    getExportCustomFonts,
    buildCustomFontsCss,
    buildGoogleFontsUrl,
    loadUsedFonts
  }
}
