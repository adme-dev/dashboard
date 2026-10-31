import type { ArtboardState } from '~/types/banner-studio'
import { resolveBannerFormat } from '~/utils/banner-constants'

/** Preserve every selected saved layout and its playback metadata in an independent draft. */
export function copyTemplateCanvas(source: unknown, keys?: string[]): Record<string, ArtboardState> {
  const canvas = typeof source === 'string' ? JSON.parse(source) : source
  if (!canvas || typeof canvas !== 'object' || Array.isArray(canvas)) throw new Error('This template has no saved layouts')
  const selected = keys || Object.keys(canvas)
  if (!selected.length || new Set(selected).size !== selected.length) throw new Error('Select at least one layout')
  return Object.fromEntries(selected.map((key) => {
    const board = Object.prototype.hasOwnProperty.call(canvas, key) ? canvas[key] : null
    if (!resolveBannerFormat(key) || !board || !Array.isArray(board.layers)) throw new Error('This template contains an unsupported layout')
    return [key, JSON.parse(JSON.stringify(board)) as ArtboardState]
  }))
}
