// Google Fonts + Custom Font integration for Banner Studio
// Embeds curated list of 120+ popular fonts with on-demand loading
// Supports custom font uploads via R2 with @font-face injection

export interface GoogleFont {
  family: string
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace' | 'custom'
  weights: number[]
}

export interface CustomFont {
  id: number
  name: string          // font-family name (used as font-family in @font-face)
  mimeType: string
  fileSize: number
  r2Key: string
  url: string           // R2 public URL for @font-face src
  tags: string[]        // TEXT[] from DB: ['font', 'weight:400', 'format:woff2']
  uploadedBy: string
  createdAt: string
}

/** Parse font metadata from TEXT[] tags */
function parseFontTags(tags: string[]): { weight: number; format: string } {
  let weight = 400
  let format = 'woff2'
  if (!Array.isArray(tags)) return { weight, format }
  for (const tag of tags) {
    if (tag.startsWith('weight:')) weight = parseInt(tag.slice(7)) || 400
    if (tag.startsWith('format:')) format = tag.slice(7) || 'woff2'
  }
  // Validate format
  if (!['woff2', 'woff', 'truetype', 'opentype'].includes(format)) format = 'woff2'
  return { weight, format }
}

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
const recentFonts = ref<string[]>([])
const customFonts = ref<CustomFont[]>([])
let recentLoaded = false
let customFontsFetch: Promise<void> | null = null

function loadRecentFromStorage() {
  if (recentLoaded) return
  recentLoaded = true
  try {
    const stored = localStorage.getItem('banner-recent-fonts')
    if (stored) {
      const data = JSON.parse(stored)
      if (Array.isArray(data)) recentFonts.value = data
    }
  } catch {}
}

function saveRecent() {
  try {
    localStorage.setItem('banner-recent-fonts', JSON.stringify(recentFonts.value))
  } catch {}
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
  { family: 'Inconsolata', category: 'monospace', weights: [300, 400, 500, 600, 700, 800, 900] },
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
  { family: 'Impact', category: 'sans-serif', weights: [400] },
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
  { label: 'System', value: 'system' },
] as const

export type FontCategory = typeof FONT_CATEGORIES[number]['value']

export function useBannerFonts() {
  const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>
  loadRecentFromStorage()

  /** Custom fonts as GoogleFont entries for unified search */
  const customFontEntries = computed<GoogleFont[]>(() =>
    customFonts.value.map(cf => {
      const { weight } = parseFontTags(cf.tags)
      return {
        family: cf.name,
        category: 'custom' as const,
        weights: [weight],
      }
    }),
  )

  const allFonts = computed(() => [...customFontEntries.value, ...GOOGLE_FONTS, ...SYSTEM_FONTS])

  /** Check if a font family is a custom upload */
  function isCustomFont(family: string): boolean {
    return customFonts.value.some(cf => cf.name === family)
  }

  /** Get custom font record by family name */
  function getCustomFont(family: string): CustomFont | undefined {
    return customFonts.value.find(cf => cf.name === family)
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
    if (loadedFonts.has(family)) return Promise.resolve()
    if (!isSafeUrl(cf.url)) return Promise.resolve()
    loadedFonts.add(family)

    const { weight, format } = parseFontTags(cf.tags)
    const escapedFamily = family.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const css = `@font-face {
  font-family: '${escapedFamily}';
  src: url('${cf.url}') format('${format}');
  font-weight: ${weight};
  font-display: swap;
}`

    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    return Promise.resolve()
  }

  /** Load a Google Font by injecting a <link> element. Returns a promise that resolves when loaded. */
  function loadFont(family: string, weights?: number[]): Promise<void> {
    if (SYSTEM_FONT_FAMILIES.has(family)) return Promise.resolve()

    // Check if this is a custom font
    const cf = getCustomFont(family)
    if (cf) return loadCustomFont(cf)

    const key = family
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

  /** Fetch custom fonts from the API (deduped via shared Promise) */
  function fetchCustomFonts(): Promise<void> {
    if (customFontsFetch) return customFontsFetch
    customFontsFetch = (async () => {
      try {
        const data = await apiFetch<CustomFont[]>('/api/agency/banner-studio/fonts')
        customFonts.value = data || []
        // Inject @font-face for all custom fonts
        for (const cf of customFonts.value) {
          loadCustomFont(cf)
        }
      } catch (e) {
        console.warn('Failed to fetch custom fonts:', e)
        customFontsFetch = null // allow retry on failure
      }
    })()
    return customFontsFetch
  }

  /** Upload a custom font file */
  async function uploadCustomFont(file: File, familyName?: string): Promise<CustomFont | null> {
    const formData = new FormData()
    formData.append('file', file)
    if (familyName) formData.append('family', familyName)

    try {
      const result = await apiFetch<CustomFont>('/api/agency/banner-studio/fonts/upload', {
        method: 'POST',
        body: formData,
      })
      // Add to local state and inject @font-face
      customFonts.value.unshift(result)
      loadCustomFont(result)
      return result
    } catch (e: any) {
      console.error('Font upload failed:', e)
      throw e
    }
  }

  /** Delete a custom font */
  async function deleteCustomFont(id: number): Promise<void> {
    await apiFetch(`/api/agency/banner-studio/fonts/${id}`, { method: 'DELETE' })
    const idx = customFonts.value.findIndex(f => f.id === id)
    if (idx > -1) {
      const family = customFonts.value[idx].name
      customFonts.value.splice(idx, 1)
      loadedFonts.delete(family)
    }
  }

  /** Get unique Google font families from a layer set (excludes custom + system) */
  function getUsedFonts(layers: { fontFamily?: string; fontWeight?: number }[]): Map<string, Set<number>> {
    const fonts = new Map<string, Set<number>>()
    for (const l of layers) {
      if (!l.fontFamily) continue
      if (SYSTEM_FONT_FAMILIES.has(l.fontFamily)) continue
      if (isCustomFont(l.fontFamily)) continue // custom fonts handled separately
      if (!fonts.has(l.fontFamily)) fonts.set(l.fontFamily, new Set())
      fonts.get(l.fontFamily)!.add(l.fontWeight || 400)
    }
    return fonts
  }

  /** Get custom fonts used in layers (for HTML export @font-face generation) */
  function getUsedCustomFonts(layers: { fontFamily?: string }[]): CustomFont[] {
    const used: CustomFont[] = []
    const seen = new Set<string>()
    for (const l of layers) {
      if (!l.fontFamily || seen.has(l.fontFamily)) continue
      const cf = getCustomFont(l.fontFamily)
      if (cf) {
        used.push(cf)
        seen.add(l.fontFamily)
      }
    }
    return used
  }

  /** Get custom fonts used in layers, formatted for HTML export options */
  function getExportCustomFonts(layers: { fontFamily?: string }[]): { family: string; url: string; format: string; weight: number }[] {
    return getUsedCustomFonts(layers)
      .filter(cf => isSafeUrl(cf.url))
      .map(cf => {
        const { weight, format } = parseFontTags(cf.tags)
        return { family: cf.name, url: cf.url, format, weight }
      })
  }

  /** Build @font-face CSS rules for custom fonts used in layers (for HTML export) */
  function buildCustomFontsCss(layers: { fontFamily?: string }[]): string {
    const fonts = getUsedCustomFonts(layers).filter(cf => isSafeUrl(cf.url))
    if (fonts.length === 0) return ''

    return fonts.map(cf => {
      const { weight, format } = parseFontTags(cf.tags)
      const family = cf.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      return `@font-face { font-family: '${family}'; src: url('${cf.url}') format('${format}'); font-weight: ${weight}; font-display: swap; }`
    }).join('\n')
  }

  /** Build Google Fonts CSS URL for HTML export */
  function buildGoogleFontsUrl(layers: { fontFamily?: string; fontWeight?: number }[]): string {
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
  function loadUsedFonts(layers: { fontFamily?: string; fontWeight?: number }[]) {
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
    customFonts: readonly(customFonts),
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
    uploadCustomFont,
    deleteCustomFont,
    getUsedFonts,
    getUsedCustomFonts,
    getExportCustomFonts,
    buildCustomFontsCss,
    buildGoogleFontsUrl,
    loadUsedFonts,
  }
}
