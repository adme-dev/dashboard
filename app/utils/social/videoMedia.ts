/** Signed Studio links have no filename extension; recognise their delivery routes. */
export function isVideoMediaUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const path = new URL(value, 'https://app.xeroflow.io').pathname
    return /\.(mp4|webm|mov|m4v)$/i.test(path)
      || /^\/api\/public\/(video-assets|renders)\//.test(path)
  } catch {
    return false
  }
}
