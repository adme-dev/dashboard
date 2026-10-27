/** Reproducible curated pilot; never calls a provider or writes a hosted project. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { reconstructArtwork, type ReconstructionManifest } from '../../shared/bannerReconstruction'
import copy from '../../test/fixtures/banner/lifestyle-letter-copy.json'

const root = resolve('output/editable-artwork-reference-pack')
const out = resolve('output/editable-artwork-pilot')
mkdirSync(out, { recursive: true })
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')
const original = readFileSync(`${root}/concepts/concept-2-local-lifestyle-back-A4.jpg`)
if (sha(original) !== 'd0c806aed9b85a283d9ef55f3348ab0fe0d64bad904531514c63ac33f5480a79') throw new Error('Wrong lifestyle reference')
const clean = readFileSync(`${out}/clean-background.png`)
const logo = readFileSync(`${root}/oem/eastern-subaru-logo.png`)
const sx = 2480 / 1055, sy = 3508 / 1492
const navy = '#071e46', yellow = '#ffdb28', teal = '#007d86'
const elements: ReconstructionManifest['elements'] = []
function layer(role: string, type: 'text' | 'rect' | 'image' | 'bg', x: number, y: number, w: number, h: number, attrs: object, provenance: string) {
  const id = elements.length + 1
  elements.push({ role, provenance, layer: { id, type, name: role.replace(/([a-z])([A-Z])/g, '$1 $2'), x: x * sx, y: y * sy, w: w * sx, h: h * sy, zIndex: id, opacity: 1, ...attrs } })
}
function rect(role: string, x: number, y: number, w: number, h: number, color: string, attrs: object = {}) {
  layer(role, 'rect', x, y, w, h, { fillColor: color, ...attrs }, 'native-geometry')
}
function text(role: keyof typeof copy, x: number, y: number, w: number, h: number, size: number, weight = 400, color = navy, attrs: object = {}) {
  layer(role, 'text', x, y, w, h, { text: copy[role], fontFamily: 'Arial', fontSize: size * sx, fontWeight: weight, color, lineHeight: 1.22, textAlign: 'left', copyLocked: role !== 'headline', ...attrs }, 'approved-copy')
}
layer('background', 'image', 0, 0, 1055, 1492, { src: `data:image/png;base64,${clean.toString('base64')}`, fit: 'fill', locked: true }, 'built-in-imagegen-repair')
layer('logo', 'image', 65, 38, 340, 90, { src: `data:image/png;base64,${logo.toString('base64')}`, fit: 'contain', isLogo: true }, 'original-supplied-logo')
text('recipient', 67, 245, 500, 80, 18, 400)
text('month', 800, 312, 190, 25, 17, 400, navy, { textAlign: 'right' })
text('headline', 60, 335, 950, 160, 77, 900, navy, { lineHeight: 1.01, letterSpacing: '-3px' })
rect('headlineRule', 67, 505, 80, 8, yellow)
text('campaign', 67, 522, 930, 38, 27, 800, navy, { textTransform: 'uppercase' })
rect('salePanel', 67, 561, 380, 41, yellow)
text('salePeriod', 81, 565, 360, 37, 29, 800, navy, { textTransform: 'uppercase' })
text('salutation', 67, 621, 920, 28, 20)
text('letterLocation', 67, 658, 922, 57, 20)
text('letterShowroom', 67, 726, 922, 57, 20)
text('letterLaunch', 67, 794, 922, 57, 20)
text('letterOffer', 67, 862, 922, 57, 20)
text('signoff', 67, 930, 600, 25, 19)
text('signatory', 67, 960, 600, 27, 21, 700)
text('signatoryRole', 67, 988, 600, 25, 18)
rect('locationPanel', 0, 1020, 1055, 254, '#faf9f4')
text('salesLabel', 58, 1037, 465, 29, 22, 800)
text('salesAddress', 58, 1071, 455, 48, 19)
rect('salesDivider', 58, 1123, 466, 1, navy)
text('serviceLabel', 58, 1133, 466, 26, 20, 800)
text('serviceAddress', 58, 1164, 466, 26, 18)
rect('serviceDivider', 58, 1198, 466, 1, navy)
text('phone', 58, 1207, 466, 37, 29, 800)
text('parking', 58, 1244, 466, 24, 14)
// Native line segments from supplied road coordinates: north-up equirectangular map.
const route = JSON.parse(readFileSync(`${root}/map-data/route.json`, 'utf8')).routes[0].geometry.coordinates as number[][]
const cos = Math.cos(-37.78 * Math.PI / 180), bounds = [145.212, -37.832, 145.371, -37.737]
const x = 550, y = 1034, w = 471, h = 221
rect('mapPanel', x, y, w, h, '#eef3f3')
const scale = Math.min((w - 50) / ((bounds[2]! - bounds[0]!) * cos), (h - 28) / (bounds[3]! - bounds[1]!))
const ox = x + (w - (bounds[2]! - bounds[0]!) * cos * scale) / 2, oy = y + (h - (bounds[3]! - bounds[1]!) * scale) / 2
const project = (p: number[]) => [ox + (p[0]! - bounds[0]!) * cos * scale, oy + (bounds[3]! - p[1]!) * scale]
// Preserve route geometry while reducing dense source vertices to visible ~3px segments.
const pts: number[][] = []
for (const p of route.map(project)) if (!pts.length || Math.hypot(p[0]! - pts.at(-1)![0]!, p[1]! - pts.at(-1)![1]!) > 3) pts.push(p)
pts.push(project(route.at(-1)!))
for (let i = 1; i < pts.length; i++) {
  const a = pts[i - 1]!, b = pts[i]!, dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, len = Math.hypot(dx, dy)
  if (!len) continue
  rect(`road${i}`, (a[0]! + b[0]!) / 2 - len / 2, (a[1]! + b[1]!) / 2 - 3, len + 1, 6, '#a8b8c1', { rotation: Math.atan2(dy, dx) * 180 / Math.PI, borderRadius: 3 })
}
const ring = project([145.225228166778, -37.816347613845]), lily = project([145.355819978451, -37.757684978544])
rect('salesMarker', ring[0]! - 10, ring[1]! - 10, 20, 20, navy, { borderRadius: 100 })
rect('serviceMarker', lily[0]! - 10, lily[1]! - 10, 20, 20, teal, { borderRadius: 100 })
text('mapSales', ring[0]! + 16, ring[1]! - 17, 130, 42, 17, 700)
text('mapService', 840, 1040, 170, 43, 16, 700, teal, { textAlign: 'right' })
text('mapRoad', 670, 1140, 210, 22, 14, 400, '#45545d')
text('north', 569, 1042, 30, 24, 16, 700)
rect('northArrow', 577, 1070, 1.5, 45, '#45545d')
rect('northArrowLeft', 572, 1070, 9, 1.5, '#45545d', { rotation: -50 })
rect('northArrowRight', 577, 1070, 9, 1.5, '#45545d', { rotation: 50 })
text('mapNote', 800, 1225, 210, 18, 11, 400, navy, { textAlign: 'right' })
text('mapAttribution', 565, 1243, 300, 14, 9, 400, '#45545d')
rect('voucherAccent', 0, 1280, 1055, 9, yellow)
rect('voucherPanel', 0, 1289, 1055, 126, navy)
text('offer', 50, 1299, 520, 102, 88, 900, '#ffffff', { lineHeight: 1.05, letterSpacing: '-3px', textRuns: [{ text: '$500 OFF' }, { text: '*', fontSize: 45 * sx, top: -25 * sy }] })
rect('voucherDivider', 582, 1302, 1.5, 97, '#ffffff')
text('eligibility', 624, 1300, 400, 30, 24, 800, yellow)
text('voucherPeriod', 624, 1335, 400, 25, 18, 700, '#ffffff')
text('voucherInstruction', 624, 1363, 400, 23, 17, 400, '#ffffff')
text('voucherCode', 624, 1388, 400, 24, 17, 400, '#ffffff')
text('terms', 54, 1425, 950, 60, 12, 400, navy, { lineHeight: 1.3 })
const manifest = {
  schemaVersion: 1, source: { sha256: sha(original), width: 2480, height: 3508 },
  canvas: { width: 2480, height: 3508, physical: { width: 210, height: 297, unit: 'mm' } },
  background: { status: 'clean', sha256: sha(clean), method: 'repaired', reviewed: true },
  warnings: ['Curated pilot, not automatic extraction.', 'Arial approximates the concept font; original font unverified.', 'Map uses supplied route geometry, not the generated schematic.', 'Header was AI-repaired; underlying generated photo is not a print master.', 'Digital RGB review only; no CMYK or mailhouse approval.'], elements
}
const canvasData = reconstructArtwork(manifest, copy, true)
const projectFile = { id: '11111111-1111-4111-8111-111111111111', name: 'Eastern Subaru — local lifestyle letter back — editable pilot', clientId: null, canvasData, thumbnailUrl: null, status: 'draft', tags: ['editable-artwork:pilot', 'import:needs-review'], createdBy: 'local-pilot', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2))
writeFileSync(`${out}/project.json`, JSON.stringify(projectFile, null, 2))
writeFileSync(`${out}/inventory.json`, JSON.stringify({ sourceHash: sha(original), backgroundHash: sha(clean), projectHash: sha(Buffer.from(JSON.stringify(projectFile, null, 2))), layers: elements.length, textLayers: elements.filter(e => e.layer.type === 'text').length, shapeLayers: elements.filter(e => e.layer.type === 'rect').length, provider: 'built-in imagegen, model and billable usage not exposed', warnings: manifest.warnings }, null, 2))
console.log(`Saved native A4 project: ${out}/project.json (${elements.length} layers)`)
