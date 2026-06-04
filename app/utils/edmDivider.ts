// Shared Divider helpers used by editor preview and server rendering.

export function dividerLineThickness(props: Record<string, unknown> | null | undefined, fallback = 1): number {
  const preferred = props?.lineThickness
  if (typeof preferred === 'number' && Number.isFinite(preferred) && preferred > 0) {
    return preferred
  }

  const legacy = props?.lineHeight
  if (typeof legacy === 'number' && Number.isFinite(legacy) && legacy > 0) {
    return legacy
  }

  return fallback
}
