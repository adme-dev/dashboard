import { isInlineBannerAudio, MAX_AUDIO_BYTES } from './bannerAudioRender.mjs'
import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { BlockList, isIP } from 'node:net'

const blocked = new BlockList()
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]]) blocked.addSubnet(network, prefix)
export function isPublicAudioAddress(address) {
  return isIP(address) === 4 && !blocked.check(address)
}
export async function resolveAudioDownloadUrl(value, resolve = lookup) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Audio source must use HTTPS')
  const addresses = await resolve(url.hostname, { family: 4, all: true })
  if (!addresses.length || addresses.some(a => !isPublicAudioAddress(a.address))) throw new Error('Audio source must resolve to a public address')
  return { url, address: addresses[0].address }
}

export async function downloadBannerAudio(value, redirects = 0) {
  if (isInlineBannerAudio(value)) {
    const bytes = Buffer.from(value.slice(value.indexOf(',') + 1), 'base64')
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error('Invalid inline audio size')
    return bytes
  }
  if (redirects > 3) throw new Error('Too many audio redirects')
  const { url, address } = await resolveAudioDownloadUrl(value)
  // Pin the validated address for the socket, including after redirects. No DNS rebinding.
  const result = await new Promise((resolve, reject) => {
    const req = request(url, {
      agent: false,
      lookup: (_host, options, callback) => options?.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
      signal: AbortSignal.timeout(20000),
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume()
        if (!res.headers.location) return reject(new Error('Audio redirect has no location'))
        return resolve({ redirect: new URL(res.headers.location, url).href })
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Audio download failed (${res.statusCode})`)) }
      if (Number(res.headers['content-length']) > MAX_AUDIO_BYTES) { res.destroy(); return reject(new Error('Audio asset exceeds 20 MB')) }
      const chunks = []; let size = 0
      res.on('data', chunk => {
        size += chunk.length
        if (size > MAX_AUDIO_BYTES) { res.destroy(); reject(new Error('Audio asset exceeds 20 MB')); return }
        chunks.push(chunk)
      })
      res.on('error', reject)
      res.on('end', () => size ? resolve({ bytes: Buffer.concat(chunks) }) : reject(new Error('Audio asset is empty')))
    })
    req.on('error', () => reject(new Error('Audio download failed')))
    req.end()
  })
  return result.redirect ? downloadBannerAudio(result.redirect, redirects + 1) : result.bytes
}
