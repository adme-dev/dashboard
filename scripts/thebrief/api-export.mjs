import { writeFile } from 'node:fs/promises'

const API = 'https://api.thebrief.ai'
const MAX_JSON = 1024 * 1024
const MAX_ZIP = 40 * 1024 * 1024

function assertHash(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{4,100}$/.test(value)) throw new Error('Invalid TheBrief design hash')
  return value
}

async function boundedBytes(response, limit) {
  if (!response.ok || !response.body) throw new Error(`TheBrief request failed (${response.status})`)
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > limit) throw new Error('TheBrief response exceeds size limit')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > limit) throw new Error('TheBrief response exceeds size limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, size)
}

async function json(response) {
  const bytes = await boundedBytes(response, MAX_JSON)
  try { return JSON.parse(bytes.toString('utf8')) } catch { throw new Error('TheBrief returned invalid JSON') }
}

function exportUrl(value) {
  const url = new URL(value)
  // TheBrief currently issues short-lived S3 download links. Keep the
  // endpoint narrow so an unexpected API response cannot fetch local services.
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !/^creatopy-api-[a-z0-9-]+\.s3\.eu-central-1\.amazonaws\.com$/.test(url.hostname) ||
    !url.pathname.startsWith('/creatives/')) throw new Error('Unexpected TheBrief export host')
  return url
}

export async function exportExistingDesign({ designHash, clientId, clientSecret, output, fetcher = fetch, pollMs = 2000, maxPolls = 60 }) {
  assertHash(designHash)
  if (!clientId || !clientSecret) throw new Error('TheBrief API credentials are required')
  if (!output) throw new Error('Output path is required')
  const auth = await json(await fetcher(`${API}/v1/auth/token`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  }))
  if (!auth?.token || typeof auth.token !== 'string') throw new Error('TheBrief did not return an access token')
  const headers = { authorization: `Bearer ${auth.token}`, 'content-type': 'application/json', accept: 'application/json' }
  const started = await json(await fetcher(`${API}/v1/export`, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000), headers,
    body: JSON.stringify({ creativeHash: designHash, type: 'html', exportSettings: { convertCustomFonts: false, responsiveScaling: false } }),
  }))
  const id = started?.response?.export?.id
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('TheBrief did not return an export ID')
  let completed
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    const status = await json(await fetcher(`${API}/v1/export/${encodeURIComponent(id)}`, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers,
    }))
    const result = status?.response?.export ?? status?.response
    if (result?.status === 'complete') { completed = result; break }
    if (['failed', 'error', 'cancelled'].includes(result?.status)) throw new Error(`TheBrief export ${result.status}`)
    if (attempt < maxPolls - 1) await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  if (!completed) throw new Error('TheBrief export did not complete before timeout')
  const link = completed?.creatives?.find(item => typeof item?.zipUrl === 'string')?.zipUrl
  if (!link) throw new Error('TheBrief completed without a design-set ZIP link')
  const url = exportUrl(link)
  const archive = await boundedBytes(await fetcher(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(60000) }), MAX_ZIP)
  if (archive.subarray(0, 4).toString('binary') !== 'PK\x03\x04') throw new Error('TheBrief download is not a ZIP archive')
  await writeFile(output, archive, { mode: 0o600, flag: 'wx' })
  return { output, bytes: archive.length, exportId: id }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [designHash, output] = process.argv.slice(2)
  const result = await exportExistingDesign({
    designHash, output,
    clientId: process.env.THEBRIEF_CLIENT_ID,
    clientSecret: process.env.THEBRIEF_CLIENT_SECRET,
  })
  console.log(JSON.stringify(result))
}
