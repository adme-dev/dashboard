/** Use the browser's existing image request; never download the file again just to show its size. */
export function loadedImageMetadata(event: Event): string | null {
  return imageMetadata(event.target as HTMLImageElement | null)?.label ?? null
}

export function imageMetadata(image: HTMLImageElement | null) {
  if (!image?.naturalWidth || !image.naturalHeight) return null
  const { naturalWidth: width, naturalHeight: height } = image
  const dimensions = `${width} × ${height} px`
  const timing = typeof performance === 'undefined' ? undefined : performance.getEntriesByName(image.currentSrc || image.src, 'resource').at(-1) as PerformanceResourceTiming | undefined
  const bytes = timing?.decodedBodySize || 0
  if (!bytes) return { width, height, label: dimensions }
  const size = bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
  return { width, height, label: `${dimensions} · ${size}` }
}
