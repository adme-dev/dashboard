import type { H3Event } from 'h3'
import { validateCopyMeasurementInput, validateCopyMeasurementFindings } from '../../../shared/video-storyboard/copyMeasurement'
import type { CopyMeasurementInput, CopyMeasurementFinding } from '../../../shared/video-storyboard/copyMeasurement'
import { readBounded, probeDeadline } from '../../../shared/video-storyboard/mediaProbe'

export async function measureStoryboardCopy(input: CopyMeasurementInput, deps: { event?: H3Event }): Promise<CopyMeasurementFinding[]> {
  validateCopyMeasurementInput(input)
  const binding = deps.event?.context.cloudflare?.env?.STORYBOARD_MEDIA_PROBE as { fetch(request: Request): Promise<Response> } | undefined
  if (!binding?.fetch) throw new Error('Storyboard copy measurement unavailable')
  const response = await probeDeadline(binding.fetch(new Request('https://storyboard-media-probe.internal/measure-copy', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(60_000)
  })), 60_000)
  if (!response.ok) throw new Error('Storyboard copy measurement failed')
  return validateCopyMeasurementFindings(JSON.parse(new TextDecoder().decode(await readBounded(response.body, 32_768))))
}
