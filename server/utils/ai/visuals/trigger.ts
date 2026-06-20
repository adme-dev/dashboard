import type { H3Event } from 'h3'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { describeAsset, type VisualAsset, type VisualKnowledge, type CaptionDeps } from './caption'
import { makeWorkersAiVision, type AiBinding } from './vision'
import { createVisualKnowledgeDraft } from './draft'

/**
 * Visuals → Knowledge — the asset-creation trigger (the final wiring step). When an image asset is
 * created, caption it (Workers AI vision) into an UNPUBLISHED KB draft, FIRE-AND-FORGET after the response
 * so it never blocks or breaks the upload. HARD-gated by `VISUALS_TO_KNOWLEDGE_ENABLED` (off by default)
 * and a no-op off-edge (no AI binding). Org-KB-draft scope — captions are always human-reviewed before
 * they're searchable; promotion to department/org is the existing publish gate, never automatic.
 */

export function isVisualsToKnowledgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VISUALS_TO_KNOWLEDGE_ENABLED === 'true'
}

/** Only raster images can be captioned by the vision model — skip PDFs, video, etc. */
export function isCaptionableType(fileType: string | null | undefined): boolean {
  return typeof fileType === 'string' && /^image\//i.test(fileType)
}

export interface CaptionDraftDeps {
  caption: CaptionDeps['caption']
  saveDraft: (vk: VisualKnowledge) => Promise<string>
}

/**
 * Caption each asset and write a KB draft for the ones that yield a caption. Fail-safe per asset: a
 * describe failure (→ null) is skipped; a save failure doesn't abort the rest. Returns drafts written.
 */
export async function captionAndDraftAssets(assets: VisualAsset[], deps: CaptionDraftDeps): Promise<number> {
  let written = 0
  for (const asset of assets) {
    const vk = await describeAsset(asset, { caption: deps.caption })
    if (!vk) continue
    try {
      await deps.saveDraft(vk)
      written++
    } catch {
      // one bad draft (e.g. constraint race) must not abort the rest
    }
  }
  return written
}

/** A created proof-asset row (the columns we read). */
interface ProofAssetRow {
  id: string
  file_url: string
  file_type?: string | null
  file_name?: string | null
}

/**
 * Wire proof-asset creation → visual KB drafts. Flag-gated + off-edge no-op. The AI binding is captured
 * SYNCHRONOUSLY (reaching event.context after the response throws on Cloudflare) then the captioning runs
 * via runAfterResponse. Non-image assets are filtered out. Never throws — safe to call inline in the POST.
 */
export function maybeCaptionProofAssets(event: H3Event, created: ProofAssetRow[], authorId: string | null): void {
  if (!isVisualsToKnowledgeEnabled()) return

  const ai = ((event.context as { cloudflare?: { env?: { AI?: AiBinding } } }).cloudflare?.env?.AI) ?? null
  if (!ai) return // off-edge / no Workers AI — nothing to caption against

  const assets: VisualAsset[] = created
    .filter(a => a?.file_url && isCaptionableType(a.file_type))
    .map(a => ({ id: a.id, kind: 'proof', url: a.file_url, title: a.file_name ?? undefined }))
  if (assets.length === 0) return

  const deps: CaptionDraftDeps = {
    caption: makeWorkersAiVision(ai),
    saveDraft: vk => createVisualKnowledgeDraft(vk, { authorId })
  }
  runAfterResponse(event, captionAndDraftAssets(assets, deps), 'visuals-caption-proof')
}
