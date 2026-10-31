import { parseBannerFontTags } from '~~/shared/banner/fonts'

interface FontFaceChoice {
  id: string
  name: string
  clientId: string | null
  tags: string[]
}
export interface BrandFontOption {
  label: string
  value: string
  family: string
  assets: Array<{ id: string, weight: number }>
}

/** Separate OEM provenance; equal family/weight names never discard an uploaded file. */
export function brandFontOptions(faces: FontFaceChoice[], sourceNames: ReadonlyMap<string, string> = new Map()): BrandFontOption[] {
  const groups = new Map<string, { label: string, family: string, faces: FontFaceChoice[] }>()
  const seen = new Set<string>()
  for (const face of faces) {
    if (seen.has(face.id.toLowerCase())) continue
    seen.add(face.id.toLowerCase())
    const brandId = face.tags.find(tag => tag.startsWith('motorstack-brand:'))?.slice('motorstack-brand:'.length)
    const key = `uploaded:${face.clientId || 'agency'}:${face.name}${brandId ? `:motorstack:${brandId}` : ''}`
    const provenance = brandId ? `${sourceNames.get(brandId) || brandId} · MotorStack` : face.clientId ? 'Client upload' : 'Shared upload'
    if (!groups.has(key)) groups.set(key, { label: `${face.name} · ${provenance}`, family: face.name, faces: [] })
    groups.get(key)!.faces.push(face)
  }
  return [...groups.entries()].flatMap(([key, group]) => {
    const defaults = new Map<number, { id: string, weight: number }>()
    const alternatives: Array<{ id: string, weight: number }> = []
    for (const face of group.faces) {
      const weight = parseBannerFontTags(face.tags).weight
      const asset = { id: face.id, weight }
      if (defaults.has(weight)) alternatives.push(asset)
      else defaults.set(weight, asset)
    }
    const assets = [...defaults.values()]
    const base = { label: group.label, value: key, family: group.family, assets }
    return [base, ...alternatives.map(asset => ({
      ...base,
      label: `${group.label} · ${asset.weight} file ${asset.id.slice(-8)}`,
      value: `${key}:file:${asset.id.toLowerCase()}`,
      assets: assets.map(item => item.weight === asset.weight ? asset : item)
    }))]
  })
}

export function fontOptionIncludes(option: BrandFontOption, font: { family: string, assets?: Array<{ id: string, weight: number }> }): boolean {
  return option.family === font.family && Boolean(font.assets?.length)
    && font.assets!.every(saved => option.assets.some(asset => asset.id.toLowerCase() === saved.id.toLowerCase() && asset.weight === saved.weight))
}
