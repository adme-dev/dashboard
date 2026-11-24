// Erase works on a still. A video has none, so the editor captures the frame the
// mask was painted on and stores it beside the mask. The worker finds it by this
// rule; no extra column or message field carries it.

const MASK_KEY = /^video-asset-masks\/[^/]+\/[^/]+\/[^/]+\.png$/

/** True for a brush mask key this app wrote for the given project and asset. */
export function isBrushMaskKeyFor(maskKey: string, projectId: string, sourceAssetId: string): boolean {
  return MASK_KEY.test(maskKey) && maskKey.startsWith(`video-asset-masks/${projectId}/${sourceAssetId}/`)
}

/** Where the frame painted on is stored for a mask. Null when the key is not a brush mask key. */
export function paintedFrameKeyForMask(maskKey: string | null | undefined): string | null {
  if (!maskKey || !MASK_KEY.test(maskKey)) return null
  return maskKey.replace(/\.png$/, '.frame.jpg')
}
