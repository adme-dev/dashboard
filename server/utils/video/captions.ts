function pad(value: number, size = 2): string {
  return String(Math.max(0, Math.floor(value))).padStart(size, '0')
}

export function formatVttTimestamp(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = Math.floor(safe % 60)
  const millis = Math.round((safe - Math.floor(safe)) * 1000)
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${pad(millis, 3)}`
}

function sanitizeCueText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function transcriptToSingleCueVtt(transcript: string, durationSec?: number | null): string {
  const text = sanitizeCueText(transcript)
  if (!text) return 'WEBVTT\n'
  const endSec = Math.max(1, durationSec ?? 5)
  return [
    'WEBVTT',
    '',
    `00:00:00.000 --> ${formatVttTimestamp(endSec)}`,
    text,
    '',
  ].join('\n')
}
