import { getContainer } from '@cloudflare/containers'
import {
  validateProbeInput,
  validateMeasuredMedia,
  readBounded,
  probeDeadline
} from '../../../shared/video-storyboard/mediaProbe'

interface ProbeEnv {
  AUDIO_BUCKET: R2Bucket
  RENDER: Parameters<typeof getContainer>[0]
}
/** Reachable only through a service binding: workers.dev, previews and routes are disabled. */
export async function handleMediaProbe(
  request: Request,
  env: ProbeEnv
): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/probe')
    return new Response(null, { status: 404 })
  try {
    const input = JSON.parse(
      new TextDecoder().decode(await readBounded(request.body, 4096))
    )
    validateProbeInput(input)
    const head = await probeDeadline(env.AUDIO_BUCKET.head(input.r2Key), 5000)
    if (
      !head
      || head.etag !== input.expectedEtag
      || head.size !== input.expectedSize
    )
      throw new Error('Fingerprint mismatch')
    const object = await probeDeadline(
      env.AUDIO_BUCKET.get(input.r2Key, {
        onlyIf: { etagMatches: input.expectedEtag }
      }),
      5000
    )
    if (
      !object
      || !('body' in object)
      || object.etag !== input.expectedEtag
      || object.size !== input.expectedSize
    )
      throw new Error('Fingerprint changed')
    // Stream from private R2 directly; container independently enforces exact byte count.
    const container = getContainer(env.RENDER, 'storyboard-media-probe')
    const response = await probeDeadline(
      container.fetch('http://container/probe', {
        method: 'POST',
        body: object.body,
        headers: { 'x-probe-size': String(input.expectedSize) },
        signal: AbortSignal.timeout(50_000)
      }),
      40_000
    )
    if (!response.ok) throw new Error('Decode failed')
    return Response.json(
      validateMeasuredMedia(
        JSON.parse(
          new TextDecoder().decode(await readBounded(response.body, 4096))
        )
      )
    )
  } catch {
    return Response.json(
      { error: 'Media could not be measured' },
      { status: 422 }
    )
  }
}
