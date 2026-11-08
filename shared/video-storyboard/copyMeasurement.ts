import type { CopyMeasurementInput, CopyMeasurementFinding } from './renderManifest'

export type { CopyMeasurementInput, CopyMeasurementFinding }
export function validateCopyMeasurementInput(value: unknown): CopyMeasurementInput {
  const v = value as CopyMeasurementInput
  if (!v || typeof v.html !== 'string' || !v.html || v.html.length > 512 * 1024
    || /<(?:script|iframe|object|embed|link|base|meta|animate[\w:-]*|set|discard|marquee)\b|\bon\w+\s*=|@import\b|@font-face\b/i.test(v.html)
    || ![v.width, v.height].every(n => Number.isInteger(n) && n > 0 && n <= 4096)
    || !Number.isFinite(v.durationSec) || v.durationSec <= 0 || v.durationSec > 60
    || !Number.isInteger(v.fps) || v.fps < 1 || v.fps > 60
    || !Array.isArray(v.required) || !v.required.length || v.required.length > 100
    || v.required.some(r => !r || typeof r.clipId !== 'string' || !/^[\w:-]{1,512}$/.test(r.clipId)
      || typeof r.text !== 'string' || !r.text || r.text.length > 20_000
      || !Number.isFinite(r.startSec) || r.startSec < 0 || !Number.isFinite(r.durationSec) || r.durationSec <= 0
      || r.startSec + r.durationSec > v.durationSec + 0.00001))
    throw new Error('Unsupported copy measurement input')
  return v
}
export function validateCopyMeasurementFindings(value: unknown): CopyMeasurementFinding[] {
  const findings = (value as { findings?: unknown })?.findings
  if (!Array.isArray(findings) || findings.length > 100 || findings.some(f => !f || f.severity !== 'blocker' || typeof f.code !== 'string' || typeof f.message !== 'string'))
    throw new Error('Invalid copy measurement result')
  return findings
}
