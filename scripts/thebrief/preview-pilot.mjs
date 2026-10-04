import { readFile, writeFile, mkdir, copyFile, realpath } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { convertTheBriefHtml } from './convert-html.mjs'
import { buildBannerHTML } from '../../app/utils/banner-html-builder.ts'

// Development evidence generator, not a production upload or execution path.
// Run with TSX_TSCONFIG_PATH=.nuxt/tsconfig.app.json node --import tsx ...
const [sourceDirectory, outputDirectory] = process.argv.slice(2)
if (!sourceDirectory || !outputDirectory) throw new Error('Usage: preview-pilot.mjs <export directory> <output directory>')
const source = await realpath(sourceDirectory)
const output = resolve(outputDirectory)
if (output === source || output.startsWith(source + sep)) throw new Error('Use a separate output directory')
const html = await readFile(resolve(source, 'index.html'), 'utf8')
const candidate = await convertTheBriefHtml(html)
const [format, artboard] = Object.entries(candidate.canvasData)[0]
await mkdir(output, { recursive: true })
for (const layer of artboard.layers.filter(layer => layer.src)) {
  const path = layer.src.replace(/^\.\//, '')
  const original = await realpath(resolve(source, path))
  if (!original.startsWith(source + sep)) throw new Error('Asset outside export directory')
  const destination = resolve(output, path)
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(original, destination)
}
const require = createRequire(import.meta.url)
await mkdir(resolve(output, 'vendor'), { recursive: true })
for (const name of ['gsap', 'CustomEase', 'MotionPathPlugin']) {
  await copyFile(require.resolve(`gsap/dist/${name}.min.js`), resolve(output, `vendor/${name}.min.js`))
}
const json = value => JSON.stringify(value).replace(/</g, '\\u003c')
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]))
const token = crypto.randomUUID()
const referenceWindow = new Window({ settings: { enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } })
referenceWindow.document.write(html)
// Keep CSS and artwork as exported. No vendor runtime or event handlers execute.
for (const node of referenceWindow.document.querySelectorAll('script,iframe,object,embed,base,meta[http-equiv]')) node.remove()
for (const node of referenceWindow.document.querySelectorAll('*')) {
  for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name)
}
referenceWindow.document.getElementById('designContainer').classList.remove('not-visible')
const reference = referenceWindow.document.documentElement.outerHTML
await referenceWindow.happyDOM.close()
const receiver = body => `<script>addEventListener('message',async function(e){if(e.source!==parent||e.data?.token!==${json(token)}||!Number.isFinite(e.data.time))return;const time=Math.max(0,Math.min(${candidate.source.duration}-0.001,e.data.time));await document.fonts.ready;${body}});</script>`
const referenceSeek = `const elements=${json(candidate.sourceElements)};for(const item of elements){const el=document.getElementById('element-'+item.sourceId);el.style.display='';el.style.visibility=time<item.start||time>=item.end?'hidden':'visible';const effects=[el,...el.querySelectorAll('*')].filter(node=>getComputedStyle(node).animationName!=='none');const originals=effects.map(node=>node.style.animationName);for(const node of effects)node.style.animationName='none';void el.offsetWidth;effects.forEach((node,index)=>{node.style.animationName=originals[index]});void el.offsetWidth;for(const animation of el.getAnimations({subtree:true})){animation.pause();animation.currentTime=Math.max(0,(time-item.start)*1000);}}`
await writeFile(resolve(output, 'reference.html'), reference.replace('</body>', receiver(referenceSeek) + '</body>'))
let native = buildBannerHTML(format, artboard.layers, { bgColor: artboard.bgColor })
native = native.replace(/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/gsap\/[^/]+\//g, './vendor/')
native = native.replace('</body>', receiver('await window.__engagrFrame.seek(time);') + '</body>')
await writeFile(resolve(output, 'native.html'), native)
await writeFile(resolve(output, 'native-candidate.json'), JSON.stringify(candidate, null, 2))
const scale = Math.min(480 / candidate.source.width, 520 / candidate.source.height)
const width = Math.round(candidate.source.width * scale)
const height = Math.round(candidate.source.height * scale)
const frames = ['reference', 'native'].map(name => `<section><h2>${name === 'reference' ? 'TheBrief reference CSS' : 'XeroFlow native renderer'}</h2><div class="frame" style="width:${width}px;height:${height}px"><iframe title="${name}" sandbox="allow-scripts" src="${name}.html" style="width:${candidate.source.width}px;height:${candidate.source.height}px;transform:scale(${scale})"></iframe></div></section>`).join('')
await writeFile(resolve(output, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>TheBrief → XeroFlow · Timeline trial</title><style>body{margin:0;background:#101214;color:#f4f4f5;font:15px system-ui;padding:28px}h1{font-size:24px}h2{font-size:16px}p{color:#a9afb7;max-width:950px;line-height:1.5}.comparison{display:flex;gap:24px;flex-wrap:wrap}.frame{overflow:hidden;background:#222;border:1px solid #384047}iframe{border:0;transform-origin:top left}button,a{color:#dfff00}button{background:#25292d;border:1px solid #485058;border-radius:6px;padding:9px 15px;cursor:pointer}input{width:360px;max-width:65vw}label{display:flex;gap:16px;align-items:center;margin:20px 0}table{border-collapse:collapse;width:100%;max-width:1000px}td,th{text-align:left;padding:9px;border-bottom:1px solid #30363b}.notice{border-left:3px solid #dfb438;padding-left:16px}</style></head><body><h1>TheBrief → XeroFlow: timeline trial</h1><p>Bay City Auto Group · ${candidate.source.width} × ${candidate.source.height} · ${candidate.source.duration} seconds · ${candidate.source.elementCount} source elements → ${artboard.layers.length} native layers. Private development proof; nothing has been published.</p><div class="comparison">${frames}</div><div><button data-time="0">Start</button> <button data-time="0.35">Entrance · 0.35s</button> <button data-time="1.5">Settled · 1.5s</button> <button data-time="3.9">End · 3.9s</button></div><label>Time <input id="time" aria-label="Animation time" type="range" min="0" max="${candidate.source.duration - 0.001}" value="1.5" step="0.01"><output id="readout">1.50 s</output><button id="play">Play loop</button></label><p class="notice">Reference uses the exported CSS with scripts removed. Both views receive the same timestamp. This compares the reconstructed native timeline with CSS playback, not a certified migration of every TheBrief feature.</p><h2>Import findings</h2><ul>${candidate.warnings.map(w => `<li>${escape(w)}</li>`).join('')}</ul><p><a href="native-candidate.json" download>Download native project candidate</a></p><h2>Editable layer timeline</h2><table><thead><tr><th>Layer</th><th>Type</th><th>Presence</th><th>Animated properties</th></tr></thead><tbody>${artboard.layers.map(layer => `<tr><td>${escape(layer.name)}</td><td>${layer.type}</td><td>${layer.startTime}–${layer.endTime}s</td><td>${Object.keys(layer.keyframes || {}).join(', ') || 'Static'}</td></tr>`).join('')}</tbody></table><script>const input=document.getElementById('time'),out=document.getElementById('readout'),play=document.getElementById('play');let running=false,last=0;function seek(){out.textContent=Number(input.value).toFixed(2)+' s';for(const frame of document.querySelectorAll('iframe'))frame.contentWindow.postMessage({token:${json(token)},time:Number(input.value)},'*')}for(const button of document.querySelectorAll('[data-time]'))button.addEventListener('click',()=>{running=false;play.textContent='Play loop';input.value=button.dataset.time;seek()});input.addEventListener('input',()=>{running=false;play.textContent='Play loop';seek()});play.addEventListener('click',()=>{running=!running;play.textContent=running?'Pause':'Play loop';last=performance.now()});function tick(now){if(running){input.value=(Number(input.value)+(now-last)/1000)%${candidate.source.duration - 0.001};seek()}last=now;requestAnimationFrame(tick)}requestAnimationFrame(tick);for(const frame of document.querySelectorAll('iframe'))frame.addEventListener('load',seek);addEventListener('load',seek);</script></body></html>`)
console.log(JSON.stringify({ output, nativeLayers: artboard.layers.length, source: candidate.source, warnings: candidate.warnings }, null, 2))
