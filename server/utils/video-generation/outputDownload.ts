import { assertPublicSiteOrigin, createCloudflareDohResolver, type SiteIntelligenceDnsResolver } from '../siteIntelligence/urlPolicy'
import { readGenerationOutputDownload, DEFAULT_GENERATION_OUTPUT_TIMEOUT_MS } from '../../../shared/video/generationOutputDownload'

/** Shared Pages/Worker boundary; no redirects or private destinations, and no unbounded buffering. */
export async function downloadGeneratedVideoOutput(
  value: string,
  fetchImpl: typeof fetch = fetch,
  resolver?: SiteIntelligenceDnsResolver
): Promise<Uint8Array> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_GENERATION_OUTPUT_TIMEOUT_MS)
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) {
      throw new Error('Generated output requires a public HTTPS URL')
    }
    const boundedFetch: typeof fetch = (input, init) => fetchImpl(input, { ...init, redirect: 'manual', signal: controller.signal })
    await assertPublicSiteOrigin(url.toString(), resolver ?? createCloudflareDohResolver(boundedFetch))
    const response = await boundedFetch(url.toString())
    return await readGenerationOutputDownload(response, { signal: controller.signal })
  } catch {
    // Signed provider URLs and remote body/errors must not appear in logs or job errors.
    throw new Error('Generated video output could not be safely downloaded')
  } finally {
    clearTimeout(timer)
  }
}
