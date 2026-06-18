const IMAGE_CONTENT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
}

export function imageContentTypeForR2Key(r2Key: string): string | null {
  const ext = (r2Key.split('.').pop() || '').toLowerCase()
  return IMAGE_CONTENT_TYPE[ext] ?? null
}
