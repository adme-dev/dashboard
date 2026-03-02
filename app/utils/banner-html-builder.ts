import { FORMATS, ANIM_IN, ANIM_OUT } from '~/utils/banner-constants'
import type { Layer, KeyframeProperty, Keyframe } from '~/types/banner-studio'
import { computeClipPathPx } from '~/utils/banner-mask'

const SYSTEM_FONTS = new Set(['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Trebuchet MS', 'Impact'])

/** Custom font data for HTML export */
export interface ExportCustomFont {
  family: string
  url: string
  format: string // woff2, woff, truetype, opentype
  weight: number
}

/** Build dynamic Google Fonts <link> based on fonts actually used in layers (excludes custom fonts) */
function buildFontLink(layers: Layer[], customFontFamilies: Set<string>): string {
  const fonts = new Map<string, Set<number>>()
  for (const l of layers) {
    if (!l.fontFamily || SYSTEM_FONTS.has(l.fontFamily)) continue
    if (customFontFamilies.has(l.fontFamily)) continue // handled by @font-face
    if (!fonts.has(l.fontFamily)) fonts.set(l.fontFamily, new Set())
    fonts.get(l.fontFamily)!.add(l.fontWeight || 400)
    // Also include common weights for flexibility
    fonts.get(l.fontFamily)!.add(700)
  }
  if (fonts.size === 0) return ''
  const families = Array.from(fonts.entries())
    .map(([family, weights]) => {
      const fam = family.replace(/ /g, '+')
      const wts = Array.from(weights).sort((a, b) => a - b).join(';')
      return `family=${fam}:wght@${wts}`
    })
    .join('&')
  return `<link href="https://fonts.googleapis.com/css2?${families}&display=swap" rel="stylesheet">`
}

/** Validate URL is safe for CSS injection */
function isSafeCssUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://placeholder.com')
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/** Build @font-face CSS rules for custom fonts */
function buildCustomFontFaces(layers: Layer[], customFonts: ExportCustomFont[]): string {
  if (!customFonts.length) return ''
  const usedFamilies = new Set(layers.filter(l => l.fontFamily).map(l => l.fontFamily!))
  const used = customFonts.filter(cf => usedFamilies.has(cf.family) && isSafeCssUrl(cf.url))
  if (!used.length) return ''
  return used.map(cf => {
    const family = cf.family.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    const format = ['woff2', 'woff', 'truetype', 'opentype'].includes(cf.format) ? cf.format : 'woff2'
    return `@font-face { font-family: '${family}'; src: url('${cf.url}') format('${format}'); font-weight: ${cf.weight}; font-display: swap; }`
  }).join('\n')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Check if layer uses keyframe-based animation */
function layerHasKeyframes(l: Layer): boolean {
  if (!l.keyframes) return false
  return Object.values(l.keyframes).some(kfs => kfs && kfs.length >= 2)
}

/** GSAP property name for keyframe property (bg layers use autoAlpha for opacity) */
function kfGsapProp(prop: KeyframeProperty, isBg: boolean): string {
  if (prop === 'opacity' && isBg) return 'autoAlpha'
  return prop
}

/** Generate GSAP animation JS lines for a keyframe-based layer */
function buildKeyframeAnimLines(l: Layer): string[] {
  const lines: string[] = []
  const isBg = l.type === 'bg'
  const sel = `'[data-id="${l.id}"]'`
  const kfs = l.keyframes!
  const skipXY = (l.motionPath?.length ?? 0) >= 2

  // Initial hidden state
  if (isBg) {
    lines.push(`  tl.set(${sel}, { autoAlpha: 0 }, 0);`)
  } else {
    lines.push(`  tl.set(${sel}, { opacity: 0 }, 0);`)
  }

  // Build each property track (skip x/y when motion path active)
  for (const [prop, keyframes] of Object.entries(kfs)) {
    if (!keyframes || keyframes.length < 2) continue
    if (skipXY && (prop === 'x' || prop === 'y')) continue
    const sorted = [...keyframes].sort((a, b) => a.time - b.time)
    const gProp = kfGsapProp(prop as KeyframeProperty, isBg)

    // Set initial value
    lines.push(`  tl.set(${sel}, { ${gProp}: ${sorted[0].value} }, ${sorted[0].time});`)

    // Tweens between keyframes
    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i]
      const to = sorted[i + 1]
      const dur = to.time - from.time
      if (dur <= 0) continue
      const ease = from.easing || 'power2.out'
      lines.push(`  tl.to(${sel}, { ${gProp}: ${to.value}, duration: ${dur.toFixed(3)}, ease: '${ease}' }, ${from.time});`)
    }
  }

  // Motion path tweens (chained)
  if (l.motionPath && l.motionPath.length >= 2) {
    const startTime = l.startTime || 0
    const endTime = l.endTime || (startTime + 3)
    const pathJson = JSON.stringify(l.motionPath.map(p => ({ x: p.x, y: p.y })))
    const curviness = l.motionPathCurviness ?? 1
    const autoRotate = l.motionPathAutoRotate ? ', autoRotate: true' : ''
    const tweens = l.motionPathTweens?.length
      ? l.motionPathTweens
      : [{ startTime, endTime, pathStart: 0, pathEnd: 1, ease: l.ease || 'power2.inOut' }]
    for (const tw of tweens) {
      const dur = tw.endTime - tw.startTime
      if (dur <= 0) continue
      const startEnd = tw.pathStart !== 0 || tw.pathEnd !== 1
        ? `, start: ${tw.pathStart}, end: ${tw.pathEnd}`
        : ''
      lines.push(`  tl.to(${sel}, { motionPath: { path: ${pathJson}, curviness: ${curviness}${autoRotate}${startEnd} }, duration: ${dur.toFixed(3)}, ease: '${tw.ease || 'power2.inOut'}' }, ${tw.startTime});`)
    }
  }

  return lines
}

export interface BuildBannerOptions {
  includeAnimations?: boolean
  bgColor?: string
  feedUrl?: string
  feedBindings?: Record<number, { column: string; property: string }[]>
  customFonts?: ExportCustomFont[]
}

export function buildBannerHTML(
  fmtKey: string,
  layers: Layer[],
  options: BuildBannerOptions = {},
): string {
  const { includeAnimations = true, bgColor = '#0a0a10', feedUrl, feedBindings, customFonts = [] } = options
  const customFontFamilies = new Set(customFonts.map(cf => cf.family))
  const fmt = FORMATS[fmtKey]
  if (!fmt) return ''

  const layerDivs = [...layers]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((l) => {
      // Skip mask layers — they don't render in output
      if (l.isMask) return ''

      let style = `position:absolute;left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;opacity:${l.opacity};`
      if (l.rotation) style += `transform:rotate(${l.rotation}deg);`

      // Apply initial clip-path from mask layer targeting this layer
      const maskLayer = layers.find(m => m.isMask && m.maskTargetIds?.includes(l.id))
      if (maskLayer) {
        style += `clip-path:${computeClipPathPx(maskLayer, l, maskLayer.maskShape || 'rect', maskLayer.maskInvert || false)};`
      }

      if (l.type === 'bg') {
        if (l.src && l.srcType === 'video') {
          const objPos = `${l.focalX ?? 50}% ${l.focalY ?? 50}%`
          return `<div class="layer" data-id="${l.id}" style="${style}background:${l.bgColor || '#000'};"><video src="${escapeHtml(l.src)}" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:${l.fit || 'cover'};object-position:${objPos};display:block;" /></div>`
        }
        if (l.src) {
          const objPos = `${l.focalX ?? 50}% ${l.focalY ?? 50}%`
          return `<div class="layer" data-id="${l.id}" style="${style}background:${l.bgColor || '#000'};"><img src="${escapeHtml(l.src)}" style="width:100%;height:100%;object-fit:${l.fit || 'cover'};object-position:${objPos};display:block;" /></div>`
        }
        return `<div class="layer" data-id="${l.id}" style="${style}background:${l.bgColor || '#000'};"></div>`
      }
      if (l.type === 'rect') {
        style += `background:${l.fillColor || 'transparent'};`
        if (l.borderRadius) style += `border-radius:${l.borderRadius}px;`
        return `<div class="layer" data-id="${l.id}" style="${style}"></div>`
      }
      if (l.type === 'text') {
        style += `font-size:${l.fontSize || 16}px;font-weight:${l.fontWeight || 400};font-family:'${l.fontFamily || 'Barlow Condensed'}',sans-serif;color:${l.color || '#fff'};`
        if (l.textTransform) style += `text-transform:${l.textTransform};`
        if (l.letterSpacing) style += `letter-spacing:${l.letterSpacing};`
        if (l.lineHeight) style += `line-height:${l.lineHeight};`
        if (l.textAlign) style += `text-align:${l.textAlign};`
        if (l.bgColor) style += `background:${l.bgColor};`
        return `<div class="layer" data-id="${l.id}" style="${style}">${escapeHtml(l.text || '')}</div>`
      }
      if (l.type === 'button') {
        style += `font-size:${l.fontSize || 12}px;font-weight:${l.fontWeight || 700};font-family:'${l.fontFamily || 'Barlow Condensed'}',sans-serif;`
        style += `background:${l.bgColor || '#e8c84a'};color:${l.textColor || '#000'};`
        style += `display:flex;align-items:center;justify-content:center;cursor:pointer;`
        if (l.borderRadius) style += `border-radius:${l.borderRadius}px;`
        if (l.textTransform) style += `text-transform:${l.textTransform};`
        if (l.letterSpacing) style += `letter-spacing:${l.letterSpacing};`
        return `<div class="layer" data-id="${l.id}" style="${style}">${escapeHtml(l.text || '')}</div>`
      }
      if (l.type === 'image') {
        return `<div class="layer" data-id="${l.id}" style="${style}"><img src="${escapeHtml(l.src || '')}" style="width:100%;height:100%;object-fit:${l.fit || 'cover'};" /></div>`
      }
      if (l.type === 'video') {
        const objPos = `${l.focalX ?? 50}% ${l.focalY ?? 50}%`
        return `<div class="layer" data-id="${l.id}" style="${style}"><video src="${escapeHtml(l.src || '')}" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:${l.fit || 'cover'};object-position:${objPos};" /></div>`
      }
      if (l.type === 'audio') {
        if (!l.src) return ''
        return `<audio data-id="${l.id}" src="${escapeHtml(l.src)}" preload="auto"${l.loopAudio ? ' loop' : ''} style="display:none;"></audio>`
      }
      return ''
    })
    .join('\n    ')

  // Build GSAP animation script
  let animLines = ''
  if (includeAnimations) {
    const sortedByTime = [...layers].sort((a, b) => (a.startTime || 0) - (b.startTime || 0))

    const lines: string[] = []

    sortedByTime.forEach((l) => {
      // Skip mask layers — they have no DOM element in export
      if (l.isMask) return

      // Audio layers only need sync script — no visual animation
      if (l.type === 'audio') {
        const startTime = l.startTime || 0
        const endTime = l.endTime || (startTime + 3)
        if (l.src) {
          const presenceDur = endTime - startTime
          const volume = l.muted ? 0 : (l.volume ?? 1)
          lines.push(`  (function() { var a = document.querySelector('[data-id="${l.id}"]'); if (a) { a.pause(); a.volume = ${volume}; var p = { t: 0 }; tl.to(p, { t: ${presenceDur.toFixed(2)}, duration: ${presenceDur.toFixed(2)}, ease: 'none', onStart: function() { a.play(); }, onUpdate: function() { a.currentTime = p.t; }, onComplete: function() { a.pause(); } }, ${startTime}); } })();`)
        }
        return
      }

      // Keyframe-based layers use dedicated builder
      if (layerHasKeyframes(l)) {
        lines.push(...buildKeyframeAnimLines(l))
        // Video sync for keyframe layers
        if ((l.type === 'bg' && l.srcType === 'video') || l.type === 'video') {
          const startTime = l.startTime || 0
          const endTime = l.endTime || (startTime + 3)
          const presenceDur = endTime - startTime
          lines.push(`  (function() { var vid = document.querySelector('[data-id="${l.id}"] video'); if (vid) { vid.pause(); var p = { t: 0 }; tl.to(p, { t: ${presenceDur.toFixed(2)}, duration: ${presenceDur.toFixed(2)}, ease: 'none', onUpdate: function() { vid.currentTime = p.t; } }, ${startTime}); } })();`)
        }
        return
      }

      const isBg = l.type === 'bg'
      const sel = `'[data-id="${l.id}"]'`
      const startTime = l.startTime || 0
      const endTime = l.endTime || (startTime + 3)
      const animDur = l.animInDur || 0.6
      const outDur = l.outDur || (isBg ? 0.5 : 0.25)
      const ease = l.ease || 'power2.out'
      const preset = ANIM_IN.find((a: any) => a.id === l.animIn)
      const hasMP = (l.motionPath?.length ?? 0) >= 2

      // Initial hidden state
      if (isBg) {
        lines.push(`  tl.set(${sel}, { autoAlpha: 0 }, 0);`)
      } else {
        lines.push(`  tl.set(${sel}, { opacity: 0 }, 0);`)
      }

      // Animate in
      if (preset?.special === 'kenBurns') {
        const presenceDur = endTime - startTime
        if (isBg) {
          lines.push(`  tl.to(${sel}, { autoAlpha: ${l.opacity}, duration: 0.4, ease: 'power1.out' }, ${startTime});`)
        } else {
          lines.push(`  tl.to(${sel}, { opacity: ${l.opacity}, duration: 0.4, ease: 'power1.out' }, ${startTime});`)
        }
        if (hasMP) {
          lines.push(`  tl.to(${sel}, { scale: 1.08, duration: ${presenceDur}, ease: 'none' }, ${startTime});`)
        } else {
          lines.push(`  tl.to(${sel}, { scale: 1.08, x: '-2%', y: '-1%', duration: ${presenceDur}, ease: 'none' }, ${startTime});`)
        }
      } else if (preset && Object.keys(preset.from).length > 0) {
        // Strip x/y from preset when motion path drives position
        const fromEntries = Object.entries(preset.from)
          .filter(([k]) => !hasMP || (k !== 'x' && k !== 'y'))
        if (fromEntries.length > 0) {
          const fromProps = fromEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
          if (isBg) {
            lines.push(`  tl.from(${sel}, { ${fromProps}, autoAlpha: 0, duration: ${animDur}, ease: '${ease}' }, ${startTime});`)
          } else {
            lines.push(`  tl.from(${sel}, { ${fromProps}, duration: ${animDur}, ease: '${ease}' }, ${startTime});`)
          }
        } else {
          // Preset only had x/y (e.g. slideL) — do simple opacity reveal
          const opReveal = isBg ? 'autoAlpha' : 'opacity'
          lines.push(`  tl.to(${sel}, { ${opReveal}: ${l.opacity}, duration: 0.1 }, ${startTime});`)
        }
      } else if (l.animIn === 'none' || !l.animIn) {
        // Just appear
        if (isBg) {
          lines.push(`  tl.to(${sel}, { autoAlpha: ${l.opacity}, duration: 0.1 }, ${startTime});`)
        } else {
          lines.push(`  tl.to(${sel}, { opacity: ${l.opacity}, duration: 0.1 }, ${startTime});`)
        }
      }

      // Exit animation — use ANIM_OUT presets
      const outStart = Math.max(startTime + animDur, endTime - outDur)
      if (outStart < endTime) {
        const outPreset = ANIM_OUT.find((a: any) => a.id === l.animOut) || ANIM_OUT.find((a: any) => a.id === 'fadeOut')!
        const outEase = l.animOutEase || 'power1.in'
        const opKey = isBg ? 'autoAlpha' : 'opacity'

        if (outPreset.id === 'none' || !Object.keys(outPreset.to).length) {
          lines.push(`  tl.to(${sel}, { ${opKey}: 0, duration: 0.05 }, ${endTime - 0.05});`)
        } else {
          const toEntries = Object.entries(outPreset.to)
            .filter(([k]) => !hasMP || (k !== 'x' && k !== 'y'))
            .map(([k, v]) => {
              if (isBg && k === 'opacity') return `autoAlpha: ${v}`
              return `${k}: ${v}`
            })
            .join(', ')
          lines.push(`  tl.to(${sel}, { ${toEntries}, duration: ${outDur}, ease: '${outEase}' }, ${outStart});`)
        }
      }

      // Video sync
      if ((l.type === 'bg' && l.srcType === 'video') || l.type === 'video') {
        const presenceDur = endTime - startTime
        lines.push(`  (function() { var vid = document.querySelector('[data-id="${l.id}"] video'); if (vid) { vid.pause(); var p = { t: 0 }; tl.to(p, { t: ${presenceDur.toFixed(2)}, duration: ${presenceDur.toFixed(2)}, ease: 'none', onUpdate: function() { vid.currentTime = p.t; } }, ${startTime}); } })();`)
      }

      // Motion path tweens (chained) for preset-based layers
      if (l.motionPath && l.motionPath.length >= 2) {
        const pathJson = JSON.stringify(l.motionPath.map(p => ({ x: p.x, y: p.y })))
        const curviness = l.motionPathCurviness ?? 1
        const autoRotate = l.motionPathAutoRotate ? ', autoRotate: true' : ''
        const tweens = l.motionPathTweens?.length
          ? l.motionPathTweens
          : [{ startTime, endTime, pathStart: 0, pathEnd: 1, ease: ease || 'power2.inOut' }]
        for (const tw of tweens) {
          const dur = tw.endTime - tw.startTime
          if (dur <= 0) continue
          const startEnd = tw.pathStart !== 0 || tw.pathEnd !== 1
            ? `, start: ${tw.pathStart}, end: ${tw.pathEnd}`
            : ''
          lines.push(`  tl.to(${sel}, { motionPath: { path: ${pathJson}, curviness: ${curviness}${autoRotate}${startEnd} }, duration: ${dur.toFixed(3)}, ease: '${tw.ease || 'power2.inOut'}' }, ${tw.startTime});`)
        }
      }

    })

    // Animated mask clip-path proxy scripts
    const maskLayers = sortedByTime.filter(l => l.isMask && l.maskTargetIds?.length)
    maskLayers.forEach((mask) => {
      const startTime = mask.startTime || 0
      const endTime = mask.endTime || (startTime + 3)
      const shape = mask.maskShape || 'rect'
      const invert = mask.maskInvert || false

      // Build target selectors and initial data
      const targets = mask.maskTargetIds!
        .map(id => layers.find(t => t.id === id))
        .filter(Boolean) as Layer[]
      if (!targets.length) return

      const sels = targets.map(t => `'[data-id="${t.id}"]'`).join(',')
      const tData = targets.map(t => `{x:${t.x},y:${t.y},w:${t.w},h:${t.h}}`).join(',')

      // Generate proxy animation with onUpdate computing clip-path
      const preset = ANIM_IN.find((a: any) => a.id === mask.animIn)
      const animDur = mask.animInDur || 0.6
      const ease = mask.ease || 'power2.out'

      // Compute initial mask position based on animation preset
      const fromX = (preset?.from?.x as number) || 0
      const fromY = (preset?.from?.y as number) || 0
      const fromScale = (preset?.from?.scale as number) || 1

      lines.push(`  (function() {
    var sels = [${sels}];
    var tData = [${tData}];
    var mask = { x: ${mask.x + fromX}, y: ${mask.y + fromY}, w: ${mask.w * fromScale}, h: ${mask.h * fromScale} };
    function clip(m, t) {
      ${shape === 'ellipse'
        ? `var rx=m.w/2, ry=m.h/2, cx=(m.x-t.x)+rx, cy=(m.y-t.y)+ry; return 'ellipse('+rx+'px '+ry+'px at '+cx+'px '+cy+'px)';`
        : invert
          ? `var il=Math.max(0,Math.min(t.w,m.x-t.x)), it=Math.max(0,Math.min(t.h,m.y-t.y)), ir=Math.max(0,Math.min(t.w,m.x-t.x+m.w)), ib=Math.max(0,Math.min(t.h,m.y-t.y+m.h)); return 'polygon(0px 0px,'+t.w+'px 0px,'+t.w+'px '+t.h+'px,0px '+t.h+'px,0px 0px,'+il+'px '+it+'px,'+il+'px '+ib+'px,'+ir+'px '+ib+'px,'+ir+'px '+it+'px,'+il+'px '+it+'px)';`
          : `var tp=Math.max(0,m.y-t.y), rt=Math.max(0,t.w-(m.x-t.x+m.w)), bt=Math.max(0,t.h-(m.y-t.y+m.h)), lt=Math.max(0,m.x-t.x); return 'inset('+tp+'px '+rt+'px '+bt+'px '+lt+'px)';`}
    }
    function upd() { sels.forEach(function(s, i) { var el=document.querySelector(s); if(el) el.style.clipPath=clip(mask, tData[i]); }); }
    tl.to(mask, { x: ${mask.x}, y: ${mask.y}, w: ${mask.w}, h: ${mask.h}, duration: ${animDur}, ease: '${ease}', onUpdate: upd }, ${startTime});
  })();`)
    })

    animLines = lines.join('\n')
  }

  const gsapScript = includeAnimations
    ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"><\/script>`
    : ''

  const needsMotionPath = includeAnimations && layers.some(l => (l.motionPath?.length ?? 0) >= 2)
  const motionPathScript = needsMotionPath
    ? `<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/MotionPathPlugin.min.js"><\/script>`
    : ''

  const registerMotionPath = needsMotionPath ? '\n  gsap.registerPlugin(MotionPathPlugin);' : ''
  const animScript =
    includeAnimations && animLines
      ? `<script>${registerMotionPath}\n  const tl = gsap.timeline();\n${animLines}\n<\/script>`
      : ''

  // Feed runtime script — fetches feed JSON and substitutes layer content at runtime
  let feedScript = ''
  if (feedUrl && feedBindings && Object.keys(feedBindings).length) {
    const bindingsJson = JSON.stringify(feedBindings)
    feedScript = `<script>
(function(){
  var feedUrl='${escapeHtml(feedUrl)}';
  var bindings=${bindingsJson};
  var params=new URLSearchParams(window.location.search);
  var rowIdx=params.has('row')?parseInt(params.get('row')):-1;
  fetch(feedUrl).then(function(r){return r.json()}).then(function(rows){
    if(!rows.length)return;
    var row=rowIdx>=0&&rowIdx<rows.length?rows[rowIdx]:rows[Math.floor(Math.random()*rows.length)];
    Object.keys(bindings).forEach(function(layerId){
      var el=document.querySelector('[data-id="'+layerId+'"]');
      if(!el)return;
      bindings[layerId].forEach(function(b){
        var val=row[b.column];
        if(val===undefined)return;
        if(b.property==='text'){el.textContent=val;}
        else if(b.property==='src'){var m=el.querySelector('img')||el.querySelector('video');if(m)m.src=val;}
        else if(b.property==='color'){el.style.color=val;}
        else if(b.property==='bgColor'||b.property==='fillColor'){el.style.background=val;}
        else if(b.property==='fontSize'){el.style.fontSize=val+'px';}
      });
    });
  }).catch(function(){});
})();
<\/script>`
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="ad.size" content="width=${fmt.w},height=${fmt.h}">
${gsapScript}
${motionPathScript}
${buildFontLink(layers, customFontFamilies)}
<style>
${buildCustomFontFaces(layers, customFonts)}
* { margin: 0; padding: 0; box-sizing: border-box; }
.ad { position: relative; width: ${fmt.w}px; height: ${fmt.h}px; overflow: hidden; background: ${bgColor}; }
.layer { position: absolute; }
</style>
</head>
<body>
<div class="ad">
    ${layerDivs}
</div>
${animScript}
${feedScript}
</body>
</html>`
}
