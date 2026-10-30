import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const sourceWorker = readFileSync(join(root, 'source/worker.js'), 'utf8')
const sourceHtml = readFileSync(join(root, 'source/index.html'), 'utf8')
const cover = readFileSync(join(root, 'assets/banner-studio.webp'))
const sha256 = value => createHash('sha256').update(value).digest('hex')

// These are the active production files from Worker version e7902982-b062-4db9-9778-77dfdf0d1274.
if (sha256(sourceWorker) !== 'bec3fe7c61a9babb9d8fd9aaefd7404e8311fee4470c7e717b8a991f1cf36672') throw new Error('Worker source changed')
if (sha256(sourceHtml) !== 'afc266ab051f467d987e043bb204f6180c2e757e23223e0028967c45ca9d8096') throw new Error('Launcher source changed')

function replaceOnce(value, before, after) {
  if (value.split(before).length !== 2) throw new Error(`Expected one occurrence of ${before.slice(0, 70)}`)
  return value.replace(before, after)
}

let html = sourceHtml
html = html.replaceAll(
  'Your XeroFlow creative workspace. Six browser tools for photos, vectors, effects, film, sound and interface design.',
  'Your XeroFlow creative workspace. Seven tools for banners, photos, vectors, effects, film, sound and interface design.',
)
html = replaceOnce(html,
  'Six creative tools for photos, vectors, effects, film, sound and interface design.',
  'Seven creative tools for banners, photos, vectors, effects, film, sound and interface design.',
)
html = replaceOnce(html,
  'Photos, vectors, motion, film, sound and interface design. Six creative tools, ready in your browser.',
  'Banners, photos, vectors, motion, film, sound and interface design. Seven creative tools, ready in your browser.',
)
html = replaceOnce(html, '6 tools · One creative workspace', '7 tools · One creative workspace')
html = replaceOnce(html,
  '@media (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference){',
  '@media(min-width:1024px){.editors>.editor:last-child:nth-child(3n + 1){grid-column:2}}\n@media(min-width:640px) and (max-width:1023px){.editors>.editor:last-child:nth-child(2n + 1){grid-column:1/-1;justify-self:center;width:calc((100% - 20px)/2)}}\n@media (hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference){',
)
const card = '<a class="editor" href="https://app.xeroflow.io/creative/banner-studio" target="_blank" rel="noopener noreferrer"><img src="/images/banner-studio.webp" alt="" width="1586" height="992" loading="lazy"><div class="card-content"><h2>Banner Studio</h2><p>Create animated ads and adapt your designs across banner formats.</p><span class="open-link">Open banner studio<svg class="card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span></div></a>\n'
html = replaceOnce(html, '</section>\n<aside class="note"', `${card}</section>\n<aside class="note"`)
html = replaceOnce(html,
  '<strong>Your work, on your device.</strong> Available to authorised XeroFlow accounts. Save or export your projects before clearing browser storage. Automatic saving to XeroFlow projects is not connected yet.',
  '<strong>Save your creative work.</strong> Flow editors keep work on your device. Save or export before clearing browser storage. Automatic saving from Flow editors to XeroFlow projects is not connected yet. Banner Studio saves its projects in XeroFlow.',
)
if (html.match(/class="editor"/g)?.length !== 7) throw new Error('Expected seven launcher cards')

const additions = `\n// Banner Studio launcher card: the current Worker asset set is retained during upload.\nconst bannerLauncherHtml = ${JSON.stringify(html)};\nconst bannerCoverBase64 = ${JSON.stringify(cover.toString('base64'))};\nconst bannerCoverBytes = Uint8Array.from(atob(bannerCoverBase64), value => value.charCodeAt(0));\n`
let worker = replaceOnce(sourceWorker, '// worker.mjs\nvar publicFiles', `${additions}\n// worker.mjs\nvar publicFiles`)
worker = replaceOnce(worker,
  '    if (publicFiles.has(url.pathname)) {',
  `    if (url.pathname === "/images/banner-studio.webp") {\n      return new Response(request.method === "HEAD" ? null : bannerCoverBytes, { headers: {\n        "Content-Type": "image/webp", "Cache-Control": "public, max-age=3600",\n        "X-Content-Type-Options": "nosniff"\n      } });\n    }\n    if (publicFiles.has(url.pathname)) {`,
)
worker = replaceOnce(worker,
  '      return env.ASSETS.fetch(request);\n    }\n    const access = await authorize(request, env);',
  `      if (url.pathname === "/" || url.pathname === "/index.html") {\n        return new Response(request.method === "HEAD" ? null : bannerLauncherHtml, { headers: {\n          "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache",\n          "Content-Security-Policy": "frame-ancestors 'self' https://app.xeroflow.io",\n          "Referrer-Policy": "strict-origin-when-cross-origin",\n          "X-Content-Type-Options": "nosniff"\n        } });\n      }\n      return env.ASSETS.fetch(request);\n    }\n    const access = await authorize(request, env);`,
)
worker = worker.replace(/\n\/\/# sourceMappingURL=worker\.js\.map\s*$/, '\n')

const dist = join(root, 'dist')
mkdirSync(dist, { recursive: true })
writeFileSync(join(dist, 'worker.js'), worker)
writeFileSync(join(dist, 'index.html'), html)
writeFileSync(join(dist, 'release.json'), JSON.stringify({
  baseWorkerVersion: 'e7902982-b062-4db9-9778-77dfdf0d1274',
  baseWorkerSha256: sha256(sourceWorker),
  baseHtmlSha256: sha256(sourceHtml),
  coverSha256: sha256(cover),
  generatedWorkerSha256: sha256(worker),
  generatedHtmlSha256: sha256(html),
}, null, 2) + '\n')
console.log(`Generated card-only Worker: ${sha256(worker)} (${Buffer.byteLength(worker)} bytes)`)
