// server/utils/metaImage.ts
// Pure, dependency-free Meta image helpers. Kept separate from metaClient.ts so
// read-path endpoints can use them without pulling in the heavy Graph client.

/**
 * Upgrade a Meta image URL to full resolution.
 *
 * Meta resizes/proxies images via
 * `https://external.<cdn>.fbcdn.net/emgN/...?url=<encoded original>&stp=...p64x64...`.
 * The wrapper downsamples to ~64x64; the inner `url` param is the full-res
 * original (usually `https://www.facebook.com/ads/image/?d=...`, which 302s to a
 * 1200x1200 JPEG and — unlike signed scontent URLs — does not expire). Returns
 * the input unchanged when it isn't a recognisable wrapper.
 */
export function unwrapMetaImageUrl(url: string | null): string | null {
  if (!url) return url
  try {
    const u = new URL(url)
    if (u.hostname.endsWith('fbcdn.net') && /\/emg\d/.test(u.pathname)) {
      const inner = u.searchParams.get('url')
      if (inner) return inner
    }
  } catch {
    // not a parseable URL — leave it as-is
  }
  return url
}
