/** Optional optimization derived from the same saved artwork as legacy htmlKey.
 * Sources are resolved server-side from client-owned managed assets, never caller URLs.
 */
export interface ReelmotionBaseFootage {
  version: 1
  graphicsHtmlKey: string
  source: { r2Key: string, etag: string, size: number }
  zoom: { timeSec: number, scale: number }[]
}
