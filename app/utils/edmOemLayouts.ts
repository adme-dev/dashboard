// Email-safe visual layouts informed by public OEM design references.
// These are editable XeroFlow layouts, not OEM-approved brand templates.
import type { EdmPresetBlockTemplate } from '~~/app/utils/edmPresets'

const SANS = 'Arial, Helvetica, sans-serif'
const SITE = 'https://example.com'
export const OEM_LAUNCH_IMAGE = 'https://app.xeroflow.io/email/modern/vehicle-launch-hero.jpg'
export const OEM_DRIVE_IMAGE = 'https://app.xeroflow.io/email/postcards/glidex/images/image-174100413618310-b627d19e.jpeg'
export const OEM_IMAGES = {
  property: 'https://app.xeroflow.io/email/modern/property-hero.jpg',
  hospitality: 'https://app.xeroflow.io/email/modern/hospitality-hero.jpg',
  wellness: 'https://app.xeroflow.io/email/modern/wellness-hero.jpg',
  services: 'https://app.xeroflow.io/email/modern/services-hero.jpg'
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
export function oemAction(label: string, path: string, color = '#142B40', ink = '#FFFFFF') {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${color}" style="border-radius:3px;background:${color};"><a href="${SITE}/${esc(path)}" style="display:inline-block;padding:16px 24px;font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;color:${ink};">${esc(label)}</a></td></tr></table>`
}
export function oemPhoto(src: string, alt: string, width = 600) {
  return `<img src="${esc(src)}" alt="${esc(alt)}" width="${width}" style="display:block;width:100%;max-width:100%;height:auto;border:0;" />`
}
export function oemHtml(layout: string, contents: string, bg = '#FFFFFF'): EdmPresetBlockTemplate {
  return { type: 'Html', data: { style: { padding: { top: 0, right: 0, bottom: 0, left: 0 } }, props: { contents: `<style>@media only screen and (max-width:620px){.xf-oem-col{display:block!important;width:100%!important;box-sizing:border-box!important}.xf-oem-pad{padding:28px 22px!important}.xf-oem-title{font-size:32px!important;line-height:1.08!important}}</style><table role="presentation" data-edm-layout="${layout}" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;background:${bg};font-family:${SANS};"><tbody>${contents}</tbody></table>` } } }
}
export function oemHeading(copy: string, ink = '#142B40', size = 36) {
  return `<h2 class="xf-oem-title" style="margin:0 0 18px;font-family:${SANS};font-size:${size}px;line-height:1.08;letter-spacing:-1px;font-weight:700;color:${ink};">${esc(copy)}</h2>`
}
export function oemCopy(copy: string, ink = '#536172') {
  return `<p style="margin:0 0 24px;font-family:${SANS};font-size:16px;line-height:1.55;color:${ink};">${esc(copy)}</p>`
}
export function oemSplit(opts: { title: string, copy: string, image: string, alt: string, action: string, path: string, reverse?: boolean, bg?: string, ink?: string, accent?: string, buttonInk?: string }) {
  const bg = opts.bg ?? '#F4F6F8', ink = opts.ink ?? '#142B40'
  const photo = `<td class="xf-oem-col" width="46%" valign="middle" style="width:46%;">${oemPhoto(opts.image, opts.alt, 276)}</td>`
  const words = `<td class="xf-oem-col xf-oem-pad" width="54%" valign="middle" style="width:54%;padding:32px 28px;">${oemHeading(opts.title, ink, 32)}${oemCopy(opts.copy, ink)}${oemAction(opts.action, opts.path, opts.accent ?? '#142B40', opts.buttonInk ?? '#FFFFFF')}</td>`
  return oemHtml(opts.reverse ? 'split-reverse' : 'split-photo', `<tr>${opts.reverse ? words + photo : photo + words}</tr>`, bg)
}
export function oemPoster(opts: { title: string, copy: string, image: string, alt: string, action: string, path: string, bg?: string, ink?: string, accent?: string, buttonInk?: string }) {
  return oemHtml('image-poster', `<tr><td>${oemPhoto(opts.image, opts.alt)}</td></tr><tr><td class="xf-oem-pad" style="padding:36px 40px;">${oemHeading(opts.title, opts.ink, 38)}${oemCopy(opts.copy, opts.ink)}${oemAction(opts.action, opts.path, opts.accent, opts.buttonInk)}</td></tr>`, opts.bg)
}
export function oemBrandHeader(brand: string, category: string, dark = false) {
  const ink = dark ? '#FFFFFF' : '#142B40'
  return oemHtml('brand-navigation', `<tr><td class="xf-oem-pad" style="padding:26px 32px;border-bottom:1px solid ${dark ? '#39414B' : '#DBE1E7'};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-family:${SANS};font-size:21px;line-height:1.2;font-weight:700;color:${ink};">${esc(brand)}</td><td align="right" style="font-family:${SANS};font-size:12px;color:${ink};">${esc(category)}</td></tr></table></td></tr>`, dark ? '#101820' : '#FFFFFF')
}
export function oemDetails(title: string, rows: [string, string][], dark = false) {
  const ink = dark ? '#FFFFFF' : '#142B40'
  return oemHtml('event-details', `<tr><td class="xf-oem-pad" style="padding:36px 32px;">${oemHeading(title, ink, 30)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.map(([label, value]) => `<tr><td width="36%" valign="top" style="padding:14px 12px 14px 0;border-top:1px solid ${dark ? '#39414B' : '#DDE3E9'};font-family:${SANS};font-size:13px;line-height:1.5;color:${ink};">${esc(label)}</td><td style="padding:14px 0;border-top:1px solid ${dark ? '#39414B' : '#DDE3E9'};font-family:${SANS};font-size:15px;line-height:1.5;font-weight:600;color:${ink};">${esc(value)}</td></tr>`).join('')}</table></td></tr>`, dark ? '#101820' : '#F4F6F8')
}
export function oemOfferBanner() {
  return oemHtml('retail-offer', `<tr><td class="xf-oem-pad" style="padding:38px 32px;">${oemHeading('Grand Automotive Sale Weekend', '#FFFFFF', 46)}<p style="margin:0 0 10px;font-family:${SANS};font-size:39px;line-height:1.05;font-weight:700;letter-spacing:-1px;color:#FFFFFF;">Save thousands<span style="font-size:20px;">*</span></p>${oemCopy('on selected vehicles. Discover your next drive this sale weekend.', '#FFFFFF')}${oemAction('Explore the sale', 'sale-weekend', '#FFFFFF', '#BA1B26')}</td></tr><tr><td>${oemPhoto(OEM_DRIVE_IMAGE, 'Featured SUV — replace with vehicles included in your offer')}</td></tr><tr><td style="padding:18px 32px;font-family:${SANS};font-size:12px;line-height:1.5;color:#FFFFFF;">*Example offer copy. Replace with verified savings, eligible stock and Offer conditions before sending.</td></tr>`, '#BA1B26')
}
export function oemVehicleCards() {
  return oemHtml('vehicle-lineup', `<tr><td class="xf-oem-pad" style="padding:32px;">${oemHeading('Find your next drive.', '#142B40', 32)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${[['Featured SUV', OEM_DRIVE_IMAGE], ['New arrival', OEM_LAUNCH_IMAGE]].map(([title, src]) => `<td class="xf-oem-col" width="50%" valign="top" style="width:50%;padding:8px;">${oemPhoto(src!, title!, 252)}<h3 style="font-family:${SANS};font-size:20px;line-height:1.2;margin:18px 0 10px;color:#142B40;">${title}</h3>${oemCopy('Add the model, variant and offer details for this vehicle.') }<a href="${SITE}/sale-weekend" style="font-family:${SANS};font-size:14px;font-weight:700;color:#142B40;">View vehicle →</a></td>`).join('')}</tr></table></td></tr>`)
}
