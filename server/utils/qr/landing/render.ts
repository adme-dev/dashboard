/**
 * Server-rendered hosted landing page. Self-contained HTML (inline CSS + a few lines of JS),
 * mobile-first, no framework — a scan-to-first-paint under a second on 4G matters more than
 * component reuse here. Every string from config passes through escapeQrHtml; body copy through
 * the Markdown-lite renderer. Pixels are only emitted when `allowPixels` is true.
 */
import type { QrPageConfig, QrPageField } from '~~/shared/qr/page'
import { escapeQrHtml, renderMarkdownLite } from './markdown'

export interface RenderLandingInput {
  code: string
  config: QrPageConfig
  assets: { hero?: string | null, logo?: string | null }
  submitPath: string
  preview?: boolean
  turnstileSiteKey?: string | null
  allowPixels?: boolean
  /** Server-rendered success state (non-JS form post). */
  submitted?: boolean
  error?: string | null
}

function field(f: QrPageField): string {
  const id = `f_${f.key}`
  const req = f.required ? ' required' : ''
  const label = `<label for="${id}">${escapeQrHtml(f.label)}${f.required ? '' : ' <span class="opt">(optional)</span>'}</label>`
  const ph = f.placeholder ? ` placeholder="${escapeQrHtml(f.placeholder)}"` : ''
  switch (f.type) {
    case 'select':
      return `<div class="fld">${label}<select id="${id}" name="${f.key}"${req}><option value="">Choose…</option>${(f.options ?? []).map(o => `<option value="${escapeQrHtml(o)}">${escapeQrHtml(o)}</option>`).join('')}</select></div>`
    case 'checkbox':
      return `<div class="fld chk"><label><input type="checkbox" id="${id}" name="${f.key}" value="yes"${req}> ${escapeQrHtml(f.label)}</label></div>`
    case 'textarea':
      return `<div class="fld">${label}<textarea id="${id}" name="${f.key}" rows="3" maxlength="1000"${req}${ph}></textarea></div>`
    case 'email':
      return `<div class="fld">${label}<input id="${id}" name="${f.key}" type="email" inputmode="email" autocomplete="email" maxlength="200"${req}${ph}></div>`
    case 'tel':
      return `<div class="fld">${label}<input id="${id}" name="${f.key}" type="tel" inputmode="tel" autocomplete="tel" maxlength="30"${req}${ph}></div>`
    case 'postcode':
      return `<div class="fld">${label}<input id="${id}" name="${f.key}" type="text" inputmode="numeric" pattern="[0-9]{4}" autocomplete="postal-code" maxlength="4"${req}${ph}></div>`
    default:
      return `<div class="fld">${label}<input id="${id}" name="${f.key}" type="text" autocomplete="${f.key.includes('name') ? 'name' : 'on'}" maxlength="200"${req}${ph}></div>`
  }
}

function pixels(c: QrPageConfig): string {
  const p = c.pixels
  let out = ''
  if (p.gtm_container_id) {
    out += `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${escapeQrHtml(p.gtm_container_id)}');</script>`
  }
  if (p.ga4_measurement_id) {
    const id = escapeQrHtml(p.ga4_measurement_id)
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');</script>`
  }
  if (p.meta_pixel_id) {
    const id = escapeQrHtml(p.meta_pixel_id)
    out += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');</script>`
  }
  return out
}

export function renderQrLandingPage(input: RenderLandingInput): string {
  const c = input.config
  const t = c.theme
  const dark = t.scheme === 'dark'
  const muted = dark ? 'rgba(237,242,239,.68)' : 'rgba(20,24,26,.62)'
  const line = dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)'
  const surface = dark ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.03)'
  const title = escapeQrHtml(c.headline)
  const success = input.submitted
  const successRedirect = c.success_redirect_url ? escapeQrHtml(c.success_redirect_url) : ''

  const formHtml = `
<form id="qrf" method="post" action="${escapeQrHtml(input.submitPath)}" novalidate${input.preview ? ' data-preview="1"' : ''}>
  ${c.fields.map(field).join('')}
  <div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  ${c.marketing_consent ? `<div class="fld chk"><label><input type="checkbox" name="marketing_consent" value="yes"> ${escapeQrHtml(c.marketing_consent_label)}</label></div>` : ''}
  ${input.turnstileSiteKey ? `<div class="cf-turnstile" data-sitekey="${escapeQrHtml(input.turnstileSiteKey)}" data-theme="${dark ? 'dark' : 'light'}"></div>` : ''}
  <p class="consent">${escapeQrHtml(c.consent_text)}${c.footer.privacy_url ? ` <a href="${escapeQrHtml(c.footer.privacy_url)}" rel="noopener">Privacy policy</a>` : ''}</p>
  <p id="err" class="err" role="alert"${input.error ? '' : ' hidden'}>${escapeQrHtml(input.error ?? '')}</p>
  <button type="submit" id="btn"${input.preview ? ' disabled' : ''}>${escapeQrHtml(c.cta_label)}</button>
</form>`

  const successHtml = `
<div id="ok" class="ok"${success ? '' : ' hidden'}>
  <div class="tick" aria-hidden="true">✓</div>
  <h2>${escapeQrHtml(c.success_headline)}</h2>
  <p>${escapeQrHtml(c.success_body)}</p>
  ${successRedirect ? `<a class="btnlink" href="${successRedirect}">Continue</a>` : ''}
</div>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>${title}</title>
<style>
:root{color-scheme:${dark ? 'dark' : 'light'};--bg:${t.bg};--fg:${t.fg};--ac:${t.accent};--mu:${muted};--ln:${line};--sf:${surface}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:520px;margin:0 auto;padding:20px 20px calc(32px + env(safe-area-inset-bottom))}
.pv{position:sticky;top:0;z-index:2;background:#b45309;color:#fff;font-size:13px;font-weight:600;text-align:center;padding:6px 12px}
.logo{display:block;height:44px;width:auto;max-width:200px;object-fit:contain;margin:8px 0 18px}
.hero{display:block;width:100%;height:auto;max-height:280px;object-fit:cover;border-radius:16px;margin:0 0 20px}
h1{font-size:clamp(26px,7vw,34px);line-height:1.12;letter-spacing:-.02em;margin:0 0 8px;text-wrap:balance}
.sub{margin:0 0 16px;color:var(--mu);font-size:17px}
.body{margin:0 0 20px}.body p{margin:0 0 12px}.body ul{margin:0 0 12px;padding-left:20px}.body a{color:var(--ac)}
form{background:var(--sf);border:1px solid var(--ln);border-radius:16px;padding:18px}
.fld{margin:0 0 14px}.fld label{display:block;font-size:14px;font-weight:600;margin:0 0 6px}.opt{font-weight:400;color:var(--mu)}
.fld input:not([type=checkbox]),.fld select,.fld textarea{width:100%;font:inherit;font-size:17px;padding:12px 14px;border-radius:10px;border:1px solid var(--ln);background:var(--bg);color:var(--fg);outline:none}
.fld input:focus,.fld select:focus,.fld textarea:focus{border-color:var(--ac);box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 30%,transparent)}
.chk label{display:flex;gap:10px;align-items:flex-start;font-weight:500;font-size:15px}.chk input{width:20px;height:20px;margin:2px 0 0;accent-color:var(--ac)}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.consent{font-size:12px;color:var(--mu);margin:6px 0 14px}.consent a{color:var(--mu)}
.err{margin:0 0 12px;font-size:14px;color:#f87171;font-weight:600}
button,.btnlink{display:block;width:100%;font:inherit;font-size:17px;font-weight:700;padding:14px 18px;border-radius:12px;border:0;background:var(--ac);color:#fff;cursor:pointer;text-align:center;text-decoration:none}
button[disabled]{opacity:.6;cursor:not-allowed}button:focus-visible,.btnlink:focus-visible{outline:3px solid color-mix(in srgb,var(--ac) 50%,#fff)}
.ok{text-align:center;padding:28px 18px;background:var(--sf);border:1px solid var(--ln);border-radius:16px}.ok h2{margin:12px 0 6px;font-size:24px}.ok p{margin:0 0 18px;color:var(--mu)}
.tick{width:56px;height:56px;margin:0 auto;border-radius:50%;background:var(--ac);color:#fff;font-size:30px;line-height:56px;font-weight:700}
footer{margin-top:24px;font-size:12px;color:var(--mu);text-align:center}footer a{color:var(--mu)}
@media (prefers-reduced-motion:no-preference){.ok{animation:in .35s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}
</style>${input.allowPixels ? pixels(c) : ''}${input.turnstileSiteKey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}</head>
<body>${input.preview ? '<div class="pv">Preview — submissions are disabled</div>' : ''}<main>
${input.assets.logo ? `<img class="logo" src="${escapeQrHtml(input.assets.logo)}" alt="${escapeQrHtml(c.footer.promoter_name || '')}">` : ''}
${input.assets.hero ? `<img class="hero" src="${escapeQrHtml(input.assets.hero)}" alt="">` : ''}
<h1>${title}</h1>
${c.subheadline ? `<p class="sub">${escapeQrHtml(c.subheadline)}</p>` : ''}
${c.body_md ? `<div class="body">${renderMarkdownLite(c.body_md)}</div>` : ''}
<div id="formwrap"${success ? ' hidden' : ''}>${formHtml}</div>
${successHtml}
<footer>${c.footer.promoter_name ? `${escapeQrHtml(c.footer.promoter_name)} · ` : ''}${c.footer.terms_url ? `<a href="${escapeQrHtml(c.footer.terms_url)}" rel="noopener">Terms</a> · ` : ''}${c.footer.privacy_url ? `<a href="${escapeQrHtml(c.footer.privacy_url)}" rel="noopener">Privacy</a>` : ''}</footer>
</main>
<script>
(function(){var f=document.getElementById('qrf');if(!f||f.dataset.preview)return;var btn=document.getElementById('btn'),err=document.getElementById('err');
f.addEventListener('submit',function(e){e.preventDefault();if(!f.reportValidity())return;btn.disabled=true;err.hidden=true;
var fd=new FormData(f),o={};fd.forEach(function(v,k){o[k]=v});o.landing_page=location.href;
fetch(f.action,{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(o)}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,j:j}})}).then(function(x){
if(!x.ok){err.textContent=(x.j&&x.j.message)||'Something went wrong — please try again.';err.hidden=false;btn.disabled=false;return}
document.getElementById('formwrap').hidden=true;var ok=document.getElementById('ok');ok.hidden=false;ok.scrollIntoView({block:'start'});
${successRedirect ? `setTimeout(function(){location.href=${JSON.stringify(c.success_redirect_url)}},1800);` : ''}
}).catch(function(){err.textContent='Network error — please try again.';err.hidden=false;btn.disabled=false})})})();
</script></body></html>`
}
