// Bounded native image effect. No source HTML, CSS or JavaScript is executed.
export const SPLIT_SLAM_STOPS = [
  ['0%', ['8', '0.125', '5px', '1', '1.3', '-115%', '115%']],
  ['52%', ['8', '0.125', '2.25px', '1.5', '1.18', '0%', '0%']],
  ['70%', ['8', '0.125', '0.6px', '1.08', '1.051', '0%', '0%']],
  ['100%', ['8', '0.125', '0px', '1', '1', '0%', '0%']]
]
export const SPLIT_SLAM_PROPERTIES = ['k', 'inv-k', 'blur', 'flash', 'scale', 'top-x', 'bottom-x']
export function imageEntranceClip(side, prefix = '--xf-slam-') {
  const x = `var(${prefix}${side}-x)`, scale = `var(${prefix}scale)`
  return `inset(${side === 'top' ? '0' : '50%'} max(0%,calc(50% - (50% - ${x})/ ${scale})) ${side === 'top' ? 'calc(50% - 0.5px)' : '0'} max(0%,calc(50% + (-50% - ${x})/ ${scale})))`
}
export function validImageEntrance(effect) {
  return Boolean(effect && ['splitSlam', 'softWipe'].includes(effect.kind) && Number.isFinite(effect.start) && effect.start >= 0 && effect.start <= 300
    && Number.isFinite(effect.duration) && effect.duration > 0 && effect.duration <= 300
    && typeof effect.ease === 'string' && /^cubic-bezier\(\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*,\s*-?(?:\d*\.)?\d+\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*,\s*-?(?:\d*\.)?\d+\s*\)$/.test(effect.ease)
    && effect.ease.length < 100)
}
export function imageEntranceStyle(effect) {
  if (!validImageEntrance(effect)) throw new Error('Invalid Split Slam effect')
  return { animationName: effect.kind === 'splitSlam' ? 'xf-split-slam' : 'xf-soft-wipe', animationDuration: `${effect.duration}s`, animationTimingFunction: effect.ease,
    animationFillMode: 'both', animationPlayState: 'paused', animationDelay: '0s' }
}
export const SOFT_WIPE_STOPS = [['0%', { 'mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', '-webkit-mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', 'mask-repeat': 'no-repeat', '-webkit-mask-repeat': 'no-repeat', 'mask-size': '200% 100%', '-webkit-mask-size': '200% 100%', 'mask-position': '148% center', '-webkit-mask-position': '148% center', 'opacity': '0' }], ['15%', { opacity: '1' }], ['100%', { 'mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', '-webkit-mask-image': 'linear-gradient(90deg,black 0%,black 50%,transparent 74%)', 'mask-repeat': 'no-repeat', '-webkit-mask-repeat': 'no-repeat', 'mask-size': '200% 100%', '-webkit-mask-size': '200% 100%', 'mask-position': '0% center', '-webkit-mask-position': '0% center' }]]
export const IMAGE_ENTRANCE_CSS = `${SPLIT_SLAM_PROPERTIES.map((p, i) => {
  const syntax = i === 2 ? '<length>' : i >= 5 ? '<percentage>' : '<number>'
  const initial = i === 2 ? '0px' : i >= 5 ? '0%' : '1'
  return `@property --xf-slam-${p}{syntax:'${syntax}';inherits:true;initial-value:${initial}}`
}).join('')}
@keyframes xf-soft-wipe{${SOFT_WIPE_STOPS.map(([at, props]) => `${at}{${Object.entries(props).map(([k, v]) => `${k}:${v}`).join(';')}}`).join('')}}
@keyframes xf-split-slam{${SPLIT_SLAM_STOPS.map(([at, values]) => `${at}{${values.map((v, i) => `--xf-slam-${SPLIT_SLAM_PROPERTIES[i]}:${v}`).join(';')}}`).join('')}}
[data-image-entrance]{width:100%;height:100%;position:relative}
.xf-slam-content{width:100%;height:100%;position:relative;visibility:hidden;transform:scaleX(var(--xf-slam-k));filter:blur(var(--xf-slam-blur)) brightness(var(--xf-slam-flash))}
.xf-slam-content>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;visibility:visible;pointer-events:none;transform-origin:center;display:block}
${['top', 'bottom'].map(side => `.xf-slam-${side}{clip-path:${imageEntranceClip(side)};transform:scaleX(var(--xf-slam-inv-k)) translateX(var(--xf-slam-${side}-x)) scale(var(--xf-slam-scale))}`).join('\n')}`
const escape = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export function imageEntranceMarkup(src, effect, settled = false, fit = 'cover') {
  const css = Object.entries({ ...imageEntranceStyle(effect), ...(settled ? { animationDelay: `${-effect.duration}s` } : {}) }).map(([k, v]) => `${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}:${v}`).join(';')
  if (effect.kind === 'softWipe') return `<div data-image-entrance style="${escape(css)}"><img src="${escape(src)}" style="width:100%;height:100%;object-fit:${['fill', 'contain', 'cover'].includes(fit) ? fit : 'cover'};display:block" alt="" draggable="false"></div>`
  return `<div data-image-entrance style="${escape(css)}"><div class="xf-slam-content">${['top', 'bottom'].map(side => `<img class="xf-slam-${side}" src="${escape(src)}" alt="" draggable="false">`).join('')}</div></div>`
}
// The CSS delay is driven directly by GSAP, including seeks that suppress callbacks.
// A paused CSS animation gives Chromium the original registered-property interpolation.
export function addImageEntranceTimeline(tl, element, effect) {
  if (!validImageEntrance(effect)) return
  const target = element.querySelector('[data-image-entrance]')
  if (!target) return
  tl.fromTo(target, { animationDelay: '0s' }, { animationDelay: `${-effect.duration}s`, duration: effect.duration, ease: 'none' }, effect.start)
}
export function imageEntranceTimelineScript(id, effect) {
  if (!validImageEntrance(effect)) return ''
  return `(function(){var e=document.querySelector('[data-id="${Number(id)}"] [data-image-entrance]');if(!e)return;tl.fromTo(e,{animationDelay:'0s'},{animationDelay:'${-effect.duration}s',duration:${effect.duration},ease:'none'},${effect.start});})();`
}
