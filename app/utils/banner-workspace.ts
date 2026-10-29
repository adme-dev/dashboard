import type { BannerFormat } from '~/types/banner-studio'

// Imported formats retain their dimension keys. Presentation names must never
// remap a saved artboard to another platform or change its native dimensions.
export function layoutName(format?: BannerFormat): string {
  if (!format) return 'Layout'
  if (format.name !== 'Custom') return format.name
  if (format.w === format.h) return 'Square post'
  if (format.w === 1080 && format.h === 1920) return 'Story'
  if (format.w === 1920 && format.h === 1080) return 'Full HD landscape'
  return format.h > format.w ? 'Portrait' : 'Landscape'
}

export function layoutRows(formats: BannerFormat[]): BannerFormat[][] {
  const ordered = [...formats].sort((a, b) => {
    const rank = (f: BannerFormat) => f.w === f.h ? 0 : f.h > f.w ? 1 : 2
    return rank(a) - rank(b)
  })
  const rows: BannerFormat[][] = []
  for (const format of ordered) {
    const row = rows.at(-1)
    // Keep landscape layouts below the main square / portrait row.
    if (!row || row.length === 2 || (format.w > format.h && row.some(f => f.w <= f.h))) rows.push([format])
    else row.push(format)
  }
  return rows
}

export const WORKSPACE_GAP = 64
export const WORKSPACE_FOOTER = 64
export const WORKSPACE_PADDING = 32

export function fitLayoutRows(rows: BannerFormat[][], width: number, height: number): number {
  if (!rows.length || width <= 0 || height <= 0) return 1
  const fits = (scale: number) => rows.every(row =>
    row.reduce((sum, f) => sum + Math.max(144, f.w * scale), 0) + WORKSPACE_GAP * (row.length - 1) + WORKSPACE_PADDING * 2 <= width)
    && rows.reduce((sum, row) => sum + Math.max(...row.map(f => f.h)) * scale + WORKSPACE_FOOTER, 0)
      + WORKSPACE_GAP * (rows.length - 1) + WORKSPACE_PADDING * 2 <= height
  let low = 0.05
  let high = 1
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2
    if (fits(mid)) low = mid
    else high = mid
  }
  return low
}
