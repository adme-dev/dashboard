import { z } from 'zod'

/** Reusable styles contain design guidance only: campaign copy and owned assets stay on concepts. */
export const BOLD_RETAIL_LIFESTYLE = {
  id: 'bold-retail-lifestyle',
  version: 1,
  name: 'Bold Retail Lifestyle',
  guidance:
    'Bold blue and yellow retail composition; angled display typography with dimensional depth, tactile texture and strong offer hierarchy. Warm family lifestyle in a leafy suburban park. No beach, ocean or coastal imagery. Do not depict a generic setting as the actual dealership. Preserve original supplied OEM vehicle identity and logos. Do not invent commercial facts, map streets, signatures, QR destinations or event times.',
  variables: ['approvedCopy', 'referenceAssetIds', 'campaignBrief']
} as const
export const artworkStyleSchema = z
  .object({
    id: z.string().min(1).max(100),
    version: z.number().int().min(1).max(10000),
    name: z.string().trim().min(1).max(100),
    guidance: z.string().trim().min(1).max(2000),
    variables: z
      .array(z.enum(['approvedCopy', 'referenceAssetIds', 'campaignBrief']))
      .max(3),
    reviewedProposalId: z.string().min(1).max(100),
    reviewedAt: z.string().datetime({ offset: true }),
    sourceProjectId: z.string().uuid().optional(),
    clientId: z.string().uuid().nullable().optional(),
    exampleAssetId: z.string().uuid().optional()
  })
  .strip()
export type ArtworkStyleRecipe = z.infer<typeof artworkStyleSchema>
export const artworkConceptSchema = z
  .object({
    proposalId: z.string().min(1).max(100),
    approvedCopy: z.array(z.string().max(2000)).max(30),
    prompt: z.string().max(6000),
    referenceAssetIds: z.array(z.string().uuid()).max(8),
    asset: z.object({
      id: z.string().uuid(),
      url: z.string().max(2048),
      width: z.number().positive().finite(),
      height: z.number().positive().finite(),
      sha256: z.string().max(64).optional()
    }),
    evidence: z.object({
      provider: z.string().max(100),
      model: z.string().max(200).optional(),
      requestId: z.string().max(200).nullable().optional(),
      cost: z.null().optional()
    }),
    referenceHashes: z.array(z.string().max(64)).max(8).optional(),
    warnings: z.array(z.string().max(2000)).max(30),
    verification: z.literal('human-reviewed'),
    sourceRevision: z.string().datetime({ offset: true }),
    importedAt: z.string().datetime({ offset: true }),
    styleId: z.string().min(1).max(100),
    styleVersion: z.number().int().min(1).max(10000)
  })
  .strip()
export const artworkGenerationProposalSchema = z.object({
  proposalId: z.string().min(1).max(100),
  projectId: z.string().uuid(),
  sourceRevision: z.string().datetime({ offset: true }),
  formatKey: z.string().min(1).max(100),
  mode: z.literal('generation'),
  asset: artworkConceptSchema.shape.asset.extend({ sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  evidence: z.object({
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(200),
    requestId: z.string().max(200).nullable(),
    cost: z.null()
  }),
  warnings: z.array(z.string().max(2000)).max(30),
  verification: z.literal('review-required'),
  referenceAssetIds: z.array(z.string().uuid()).max(8),
  referenceHashes: z.array(z.string().max(64)).max(8).optional()
})
export type ArtworkConceptRecord = z.infer<typeof artworkConceptSchema>
export function retainedArtworkConcepts(
  value: unknown
): ArtworkConceptRecord[] {
  if (!Array.isArray(value)) return []
  return value.slice(-19).flatMap((item) => {
    const parsed = artworkConceptSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}
export interface ArtworkCreationMetadata {
  version: 1
  concepts: ArtworkConceptRecord[]
  styles: ArtworkStyleRecipe[]
}
export function fitArtwork(
  source: { width: number, height: number },
  target: { w: number, h: number }
) {
  if (
    ![source.width, source.height, target.w, target.h].every(
      n => Number.isFinite(n) && n > 0
    )
  )
    throw new Error('Artwork dimensions are missing')
  const scale = Math.min(target.w / source.width, target.h / source.height)
  const w = source.width * scale,
    h = source.height * scale
  return { x: (target.w - w) / 2, y: (target.h - h) / 2, w, h }
}
/** Only custom styles from the current client (or current unassigned project) are reusable. */
export function reusableArtworkStyles(
  projects: unknown,
  context?: { projectId: string, clientId: string | null }
): ArtworkStyleRecipe[] {
  if (!Array.isArray(projects) || !context) return []
  const styles = new Map<string, ArtworkStyleRecipe>()
  for (const rawProject of projects.slice(0, 100)) {
    const parsedProject = z
      .object({
        id: z.string().uuid(),
        clientId: z.string().uuid().nullable().optional(),
        canvasData: z.record(z.string(), z.unknown())
      })
      .safeParse(rawProject)
    if (!parsedProject.success) continue
    const project = parsedProject.data
    if (
      !project
      || typeof project !== 'object'
      || (context.clientId
        ? project.clientId !== context.clientId
        : project.id !== context.projectId)
    )
      continue
    if (
      !project.canvasData
      || typeof project.canvasData !== 'object'
      || Array.isArray(project.canvasData)
    )
      continue
    for (const board of Object.values(project.canvasData).slice(0, 100)) {
      const parsedBoard = z
        .object({
          artworkCreation: z
            .object({ styles: z.array(z.unknown()).max(1000) })
            .optional()
        })
        .safeParse(board)
      if (!parsedBoard.success) continue
      const saved = parsedBoard.data.artworkCreation?.styles
      if (!Array.isArray(saved)) continue
      for (const raw of saved.slice(-30)) {
        const parsed = artworkStyleSchema.safeParse(raw)
        if (!parsed.success) continue
        const style = parsed.data
        // Scope is derived from the authorised containing project, never metadata claims.
        styles.set(`${style.id}:${style.version}`, {
          ...style,
          clientId: project.clientId ?? null,
          sourceProjectId: project.id
        })
      }
    }
  }
  return [...styles.values()].slice(-30)
}
/** Postgres JSONB may reorder object keys; revision checks must compare content. */
export function artworkDocumentKey(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item && typeof item === 'object'
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map(key => [
                key,
                normalize((item as Record<string, unknown>)[key])
              ])
          )
        : item
  return JSON.stringify(normalize(value))
}
