import { getContainer } from '@cloudflare/containers'
import { validateCopyMeasurementInput, validateCopyMeasurementFindings } from '../../../shared/video-storyboard/copyMeasurement'
import { readBounded, probeDeadline } from '../../../shared/video-storyboard/mediaProbe'

export async function handleCopyMeasurement(request: Request, env: { RENDER: Parameters<typeof getContainer>[0] }): Promise<Response> {
  try {
    const input = validateCopyMeasurementInput(JSON.parse(new TextDecoder().decode(await readBounded(request.body, 600_000))))
    const response = await probeDeadline(getContainer(env.RENDER, 'storyboard-copy-measurement').fetch('http://container/measure-copy', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(50_000)
    }), 50_000)
    if (!response.ok) throw new Error('Measurement failed')
    return Response.json({ findings: validateCopyMeasurementFindings(JSON.parse(new TextDecoder().decode(await readBounded(response.body, 32_768)))) })
  } catch {
    return Response.json({ error: 'Copy could not be measured' }, { status: 422 })
  }
}
