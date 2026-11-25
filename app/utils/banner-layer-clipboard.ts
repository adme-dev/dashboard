import type { Layer } from '~/types/banner-studio'

export interface BannerLayerClipboard {
  token: string
  projectId: string
  format: string
  grouped: boolean
  layers: Layer[]
}

const key = 'banner-studio:copied-layers:v1'
let memory: { owner: string | null, data: BannerLayerClipboard } | undefined

export function storeBannerLayers(owner: string | null, data: BannerLayerClipboard) {
  memory = { owner, data }
  if (!owner) return
  try {
    window.localStorage.setItem(key, JSON.stringify(memory))
  } catch {
    // Large embedded images can exceed browser storage. Same-tab paste still works.
  }
}

export function readBannerLayers(owner: string | null, token?: string): BannerLayerClipboard | undefined {
  if (memory?.owner === owner && (!token || memory.data.token === token)) return memory.data
  if (!owner || !token) return
  try {
    const entry = JSON.parse(window.localStorage.getItem(key) || 'null')
    if (entry?.owner === owner && entry.data?.token === token && Array.isArray(entry.data.layers)) return entry.data
  } catch { /* Browser storage can be disabled. */ }
}
