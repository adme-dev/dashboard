/** Use the browser's existing image request; never download the file again just to show its size. */
export function loadedImageMetadata(event: Event): string | null {
  const image = event.target as HTMLImageElement | null
  if (!image?.naturalWidth || !image.naturalHeight) return null
  const dimensions = `${image.naturalWidth} × ${image.naturalHeight} px`
  const timing = typeof performance === 'undefined' ? undefined : performance.getEntriesByName(image.currentSrc || image.src, 'resource').at(-1) as PerformanceResourceTiming | undefined
  const bytes = timing?.decodedBodySize || 0
  if (!bytes) return dimensions
  const size = bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${dimensions} · ${size}`
}
