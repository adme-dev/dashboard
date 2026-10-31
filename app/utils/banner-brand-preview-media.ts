export interface MotorstackPreviewAsset { id: string, name: string, mime: string, importable: boolean, previewUrl: string }
export interface MotorstackPreviewCatalog { assets: MotorstackPreviewAsset[], models: string[] }

/** Prefer an exterior/hero car image, never a brochure, interior or logo. */
export function chooseMotorstackPreview(catalog: MotorstackPreviewCatalog): { asset: MotorstackPreviewAsset, model: string | null } | null {
  const images = catalog.assets.filter(asset => asset.importable && asset.mime.startsWith('image/') && !/interior|logo|badge|icon|brochure/i.test(asset.name))
  if (!images.length) return null
  const scored = images.map((asset, index) => ({ asset, index, score: /hero|exterior|front|three.quarter/i.test(asset.name) ? 3 : 0 }))
  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  const asset = scored[0]!.asset
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  const assetName = normalise(asset.name)
  const model = [...catalog.models].sort((a, b) => b.length - a.length).find(name => assetName.includes(normalise(name))) || null
  return { asset, model }
}
