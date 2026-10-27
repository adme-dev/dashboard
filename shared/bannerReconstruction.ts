import { z } from 'zod'
import type { ArtboardState, Layer } from '../app/types/banner-studio'

const dimension = z.number().finite().positive().max(10000)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const layerSchema = z.object({
  id: z.number().int().positive(), type: z.enum(['text', 'rect', 'image', 'bg']), name: z.string().min(1),
  x: z.number().finite(), y: z.number().finite(), w: dimension, h: dimension,
  zIndex: z.number().int(), opacity: z.number().min(0).max(1),
  text: z.string().optional(), src: z.string().optional()
}).passthrough()

/** Curated local package contract, not an untrusted upload/asset-authorisation boundary. */
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({ sha256: hash, width: dimension, height: dimension }),
  canvas: z.object({ width: dimension.int(), height: dimension.int(), physical: z.object({ width: dimension, height: dimension, unit: z.literal('mm') }) }),
  background: z.object({ status: z.literal('clean'), sha256: hash, method: z.enum(['repaired', 'reconstructed']), reviewed: z.literal(true) }),
  warnings: z.array(z.string()),
  elements: z.array(z.object({ role: z.string().min(1), provenance: z.string().min(1), layer: layerSchema })).min(1).max(2000)
})
export type ReconstructionManifest = z.infer<typeof manifestSchema>
export interface ReconstructionMetadata {
  schemaVersion: 1
  source: ReconstructionManifest['source']
  physical: ReconstructionManifest['canvas']['physical']
  background: ReconstructionManifest['background']
  warnings: string[]
  elements: Array<{ layerId: number, role: string, provenance: string }>
}

/** Preserve the existing Layer/canvas_data schema; metadata travels with its artboard. */
export function reconstructArtwork(input: unknown, approvedCopy: Record<string, string>, acceptedReview: boolean): Record<string, ArtboardState> {
  if (!acceptedReview) throw new Error('Accept the reconstruction review before importing')
  const parsed = manifestSchema.safeParse(input)
  if (!parsed.success) throw new Error(`Invalid reconstruction (including background review): ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`)
  const m = parsed.data
  if (m.background.sha256 === m.source.sha256) throw new Error('The original source is not a clean background')
  const ids = new Set<number>(), roles = new Set<string>()
  for (const element of m.elements) {
    if (ids.has(element.layer.id) || roles.has(element.role)) throw new Error('Duplicate layer ID or semantic role')
    ids.add(element.layer.id)
    roles.add(element.role)
    if (element.layer.type === 'text' && !element.layer.text?.trim()) throw new Error('Native copy must contain actual text')
    if (element.layer.type === 'image' && !element.layer.src) throw new Error('Image asset is missing')
  }
  for (const [role, text] of Object.entries(approvedCopy)) {
    const layer = m.elements.find(e => e.role === role)?.layer
    if (!layer || layer.type !== 'text' || layer.text !== text) throw new Error(`Required approved copy does not match: ${role}`)
  }
  return { [`custom_${m.canvas.width}x${m.canvas.height}`]: {
    bgColor: '#ffffff',
    layers: m.elements.map(({ layer }) => ({ animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, ...layer }) as Layer),
    reconstruction: {
      schemaVersion: 1, source: m.source, physical: m.canvas.physical, background: m.background,
      warnings: m.warnings, elements: m.elements.map(e => ({ layerId: e.layer.id, role: e.role, provenance: e.provenance }))
    }
  } }
}
