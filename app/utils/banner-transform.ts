import type { Layer } from '~/types/banner-studio'
/** Only finite numeric pixels may enter native/imported layer origin styles. */
export function layerTransformOrigin(origin?: { x: number, y: number }): string | undefined {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return undefined
  return `${origin.x}px ${origin.y}px`
}

/** Flip only the content, independently of the animated layer wrapper. */
export function layerFlipTransform(layer: Pick<Layer, 'flipX' | 'flipY'>): string | undefined {
  return layer.flipX || layer.flipY ? `scale(${layer.flipX ? -1 : 1}, ${layer.flipY ? -1 : 1})` : undefined
}

/** Rotate the whole motion, retaining imported rotation curves and their timing. */
export function layerRotationChange(layer: Layer, rotation: number): Partial<Layer> {
  const frames = layer.keyframes?.rotation
  if (!frames?.length) return { rotation }
  const delta = rotation - (layer.rotation || 0)
  return { rotation, keyframes: {
    ...layer.keyframes,
    rotation: frames.map(frame => ({ ...frame, value: frame.value + delta }))
  } }
}
