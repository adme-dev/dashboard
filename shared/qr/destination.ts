export type DestinationResult = { ok: true, url: string } | { ok: false, reason: string }

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\.0\.0\.0$/]

export function validateDestinationUrl(input: string): DestinationResult {
  const raw = (input ?? '').trim()
  if (!raw) return { ok: false, reason: 'Destination is required' }
  let u: URL
  try { u = new URL(raw) } catch { return { ok: false, reason: 'Enter a full URL including https://' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: 'Only http and https URLs are allowed' }
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, reason: 'Local addresses are not allowed' }
  if (host.startsWith('[') || host.includes(':')) return { ok: false, reason: 'IPv6 literals are not allowed' }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.some(re => re.test(host))) return { ok: false, reason: 'Private addresses are not allowed' }
  if (host === 'app.xeroflow.io' && u.pathname.startsWith('/q/')) return { ok: false, reason: 'A QR code cannot point at another QR code' }
  return { ok: true, url: u.toString() }
}
