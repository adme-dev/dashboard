import type { Layer } from '~/types/banner-studio'

export type TimelineRow = { kind: 'layer', id: string, layer: Layer } | { kind: 'group', id: string, name: string, layers: Layer[], start: number, end: number }
export function timelineRows(layers: Layer[], collapsed: Set<string> = new Set()): TimelineRow[] {
  const rows: TimelineRow[] = []
  const seen = new Set<string>()
  for (const layer of [...layers].sort((a, b) => b.zIndex - a.zIndex)) {
    const group = layer.timelineGroup
    if (!group) {
      rows.push({ kind: 'layer', id: `layer:${layer.id}`, layer })
      continue
    }
    if (seen.has(group.id)) continue
    seen.add(group.id)
    const members = layers.filter(item => item.timelineGroup?.id === group.id).sort((a, b) => b.zIndex - a.zIndex)
    rows.push({ kind: 'group', id: group.id, name: group.name, layers: members, start: Math.min(...members.map(item => item.startTime)), end: Math.max(...members.map(item => item.endTime)) })
    if (!collapsed.has(group.id)) rows.push(...members.map(layer => ({ kind: 'layer' as const, id: `layer:${layer.id}`, layer })))
  }
  return rows
}
