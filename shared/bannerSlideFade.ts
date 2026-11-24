import type { Layer } from '../app/types/banner-studio'

export function bannerSlideGroups(layers: Layer[]) {
  const groups: Array<{ key: string, fade?: NonNullable<Layer['slideFade']>, layers: Layer[], zIndex: number }> = []
  const scenes = new Map<string, (typeof groups)[number]>()
  for (const layer of [...layers].sort((a, b) => Number(!!a.slideTransitionFor) - Number(!!b.slideTransitionFor) || a.zIndex - b.zIndex)) {
    const candidate = layer.slideFade
    const fade = candidate && /^[a-zA-Z0-9:_-]{1,100}$/.test(candidate.id)
      && [candidate.start, candidate.end, candidate.duration].every(Number.isFinite)
      && candidate.start >= 0 && candidate.end > candidate.start && candidate.end <= 300 && candidate.duration >= 0 && candidate.duration <= Math.min(5, candidate.end - candidate.start)
      && /^cubic-bezier\([\d.,\s-]+\)$/.test(candidate.ease)
      ? candidate
      : undefined
    if (!fade) {
      groups.push({ key: `layer-${layer.id}`, layers: [layer], zIndex: layer.zIndex })
      continue
    }
    let group = scenes.get(fade.id)
    if (!group) {
      group = { key: fade.id, fade, layers: [], zIndex: layer.zIndex }
      scenes.set(fade.id, group)
      groups.push(group)
    }
    group.layers.push(layer)
  }
  return groups
}
