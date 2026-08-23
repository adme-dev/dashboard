// God mode families for the remaining Video Studio write routes — publish /
// portal hand-off / save-to-library / captions / masks / voiceover / source
// assets / assembly. Each is a single request → single result, so they all run
// on the generic external-provider ledger: claim by Idempotency-Key, store the
// JSON response on success, replay it for the same key. A failed attempt is not
// replayable; the client retries with a fresh key (same as staff today).
import type { H3Event } from 'h3'

import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import {
  executeGodModeExternalMutation,
  prepareGodModeExternalMutation,
  type GodModeExternalMutation
} from '~~/server/utils/godMode/externalLedgerCoordinator'

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const re = (pattern: string) => new RegExp(`^${pattern}$`, 'i')

interface StudioFamily extends GodModeExternalMutation {
  family: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: RegExp
}

function family(name: string, label: string, method: StudioFamily['method'], path: string): StudioFamily {
  return { family: name, label, method, path: re(path), coordinationKey: Symbol(`godMode:${name}`) }
}

export const STUDIO_FAMILIES = {
  renderPublishSocial: family('media-render-publish-social', 'render publish', 'POST', `/api/agency/audio/projects/${UUID}/renders/${UUID}/publish-social`),
  renderSaveAsset: family('media-render-save-asset', 'render save to library', 'POST', `/api/agency/audio/projects/${UUID}/renders/${UUID}/save-asset`),
  renderSendToPortal: family('media-render-send-to-portal', 'render portal hand-off', 'POST', `/api/agency/audio/projects/${UUID}/renders/${UUID}/send-to-portal`),
  voiceover: family('audio-voiceover-generate', 'voiceover generation', 'POST', '/api/agency/audio/voiceover'),
  assetCaptions: family('video-asset-captions', 'caption generation', 'POST', `/api/agency/video/assets/${UUID}/captions`),
  assetExtract: family('video-asset-extract', 'asset extraction', 'POST', `/api/agency/video/assets/${UUID}/extract`),
  assetMasks: family('video-asset-masks', 'asset masking', 'POST', `/api/agency/video/assets/${UUID}/masks`),
  assetPublishSocial: family('video-asset-publish-social', 'asset publish', 'POST', `/api/agency/video/assets/${UUID}/publish-social`),
  bucketItemDirective: family('video-bucket-item-directive', 'bucket item directive', 'POST', `/api/agency/video/bucket-items/${UUID}/directive`),
  derivativeAddToBucket: family('video-derivative-add-to-bucket', 'derivative bucket add', 'POST', `/api/agency/video/derivatives/${UUID}/add-to-bucket`),
  sourceAssetUpload: family('video-generation-source-asset-upload', 'source asset upload', 'POST', '/api/agency/video/generation/source-assets'),
  sourceAssetFromAsset: family('video-generation-source-asset-from-asset', 'source asset from library', 'POST', '/api/agency/video/generation/source-assets/from-asset'),
  sourceAssetFromStill: family('video-generation-source-asset-from-still', 'source asset from timeline still', 'POST', '/api/agency/video/generation/source-assets/from-timeline-still'),
  projectAssemble: family('video-project-assemble', 'AI assembly', 'POST', `/api/agency/video/projects/${UUID}/assemble`),
} as const

export type StudioFamilyKey = keyof typeof STUDIO_FAMILIES

/**
 * Run a whole route body under God mode coordination. Staff requests run the
 * body directly; owner requests claim the ledger, store the body's JSON result
 * and replay it for a repeated Idempotency-Key without re-running side effects.
 */
export function withGodModeLedger<T>(event: H3Event, key: StudioFamilyKey, body: () => Promise<T>): Promise<T> {
  return executeGodModeExternalMutation<T>(event, STUDIO_FAMILIES[key], 1, async (run) => {
    if (run.replay && run.replayResult !== null) return run.replayResult
    return await body()
  })
}

export function matchStudioFamily(method: string, path: string): StudioFamilyKey | null {
  for (const [key, entry] of Object.entries(STUDIO_FAMILIES) as Array<[StudioFamilyKey, StudioFamily]>) {
    if (entry.method === method.toUpperCase() && entry.path.test(path)) return key
  }
  return null
}

export function registerGodModeStudioMutationFamilies(): () => void {
  const unregisters = (Object.values(STUDIO_FAMILIES) as StudioFamily[]).map(entry => registerGodModeMutationFamily({
    family: entry.family,
    method: entry.method,
    matchesPath: path => entry.path.test(path),
    prepare: event => prepareGodModeExternalMutation(event, entry)
  }))
  return () => { for (const unregister of unregisters.reverse()) unregister() }
}
