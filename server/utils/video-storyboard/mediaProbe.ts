import type { H3Event } from 'h3'
import {
  validateProbeInput,
  validateMeasuredMedia,
  readBounded,
  probeDeadline
} from '../../../shared/video-storyboard/mediaProbe'
import type {
  MediaProbeInput,
  MeasuredMedia
} from '../../../shared/video-storyboard/mediaProbe'

export type { MediaProbeInput, MeasuredMedia }
/** Caller must resolve tenant ownership before supplying the private object fingerprint. */
export async function probeStoryboardMedia(
  input: MediaProbeInput,
  deps: { event?: H3Event }
): Promise<MeasuredMedia> {
  validateProbeInput(input)
  const binding = deps.event?.context.cloudflare?.env
    ?.STORYBOARD_MEDIA_PROBE as
    { fetch(request: Request): Promise<Response> } | undefined
  if (!binding?.fetch) throw new Error('Storyboard media probe unavailable')
  const response = await probeDeadline(
    binding.fetch(
      new Request('https://storyboard-media-probe.internal/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(60_000)
      })
    ),
    60_000
  )
  if (!response.ok) throw new Error('Storyboard media probe failed')
  return validateMeasuredMedia(
    JSON.parse(
      new TextDecoder().decode(await readBounded(response.body, 4096))
    )
  )
}
