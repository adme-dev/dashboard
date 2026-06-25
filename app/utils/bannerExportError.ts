type RenderLintFindingLike = {
  severity?: unknown
  message?: unknown
  code?: unknown
}

type BannerExportErrorLike = {
  data?: {
    statusMessage?: unknown
    data?: {
      findings?: unknown
    }
  }
  message?: unknown
}

export function describeBannerVideoExportError(error: unknown): string {
  const payload = error as BannerExportErrorLike | null | undefined
  const findings = payload?.data?.data?.findings
  if (Array.isArray(findings) && findings.length) {
    const errors = findings
      .filter((finding): finding is RenderLintFindingLike => Boolean(finding) && typeof finding === 'object')
      .filter(finding => finding.severity === 'error')
      .map(finding => stringValue(finding.message) || stringValue(finding.code))
      .filter(Boolean)
    if (errors.length) return errors.slice(0, 3).join(' ')
  }
  return stringValue(payload?.data?.statusMessage) || stringValue(payload?.message) || 'Video export failed'
}

function stringValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}
