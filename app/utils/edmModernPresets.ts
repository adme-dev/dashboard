// Modern, editable industry starters derived from the visual language of GlideX,
// FuturaX and Aviro. This catalog deliberately contains no legacy starter IDs.
import type { EdmPresetBlockTemplate, EdmSectionPreset, EdmStarterTemplate } from '~~/app/utils/edmPresets'
import type { EdmFlyhubBlock } from '~~/app/types/edm'
import { featureRow, navMenu, richFooter } from '~~/app/utils/edmSectionBuilders'

export const MODERN_EDM_SECTION_IDS = [
  'modern-electric-header', 'modern-electric-hero', 'modern-electric-features', 'modern-electric-cta', 'modern-electric-footer',
  'modern-property-header', 'modern-property-hero', 'modern-property-features', 'modern-property-cta', 'modern-property-footer',
  'modern-hospitality-header', 'modern-hospitality-hero', 'modern-hospitality-features', 'modern-hospitality-cta', 'modern-hospitality-footer',
  'modern-wellness-header', 'modern-wellness-hero', 'modern-wellness-features', 'modern-wellness-cta', 'modern-wellness-footer',
  'modern-advisory-header', 'modern-advisory-hero', 'modern-advisory-features', 'modern-advisory-cta', 'modern-advisory-footer',
  'modern-booking-confirmation', 'modern-welcome-note', 'modern-order-receipt'
] as const

type ModernSectionId = typeof MODERN_EDM_SECTION_IDS[number]
type BlockStyle = NonNullable<EdmFlyhubBlock['data']['style']>
type Theme = {
  brand: string
  ink: string
  muted: string
  paper: string
  deep: string
  accent: string
  accentInk: string
  display: string
}
const IMAGE_ROOT = 'https://app.xeroflow.io/email/modern/'
const SITE = 'https://example.com'
const themes: Record<string, Theme> = {
  electric: { brand: 'Northline Motors', ink: '#12283A', muted: '#506476', paper: '#F1F6FA', deep: '#102332', accent: '#71D9F0', accentInk: '#102332', display: 'GEOMETRIC_SANS' },
  property: { brand: 'Fieldwork Property', ink: '#183C35', muted: '#526A63', paper: '#F1F5F2', deep: '#183C35', accent: '#D4E4DB', accentInk: '#183C35', display: 'MODERN_SERIF' },
  hospitality: { brand: 'Tide House', ink: '#153B43', muted: '#526A70', paper: '#F1F7F8', deep: '#153B43', accent: '#F6C99F', accentInk: '#153B43', display: 'MODERN_SERIF' },
  wellness: { brand: 'Forma Studio', ink: '#39324F', muted: '#685F7B', paper: '#F2EFF8', deep: '#39324F', accent: '#DDD5EE', accentInk: '#39324F', display: 'GEOMETRIC_SANS' },
  advisory: { brand: 'Arc & Co.', ink: '#182E49', muted: '#566B82', paper: '#F0F4F9', deep: '#182E49', accent: '#C7DDF8', accentInk: '#182E49', display: 'GEOMETRIC_SANS' }
}
function native(type: string, props: Record<string, unknown>, style: BlockStyle, mobileStyle?: Partial<BlockStyle>): EdmPresetBlockTemplate {
  return { type, data: { props, style, ...(mobileStyle ? { mobile: { style: mobileStyle } } : {}) } }
}
function pad(top: number, bottom: number, side = 36) { return { top, right: side, bottom, left: side } }
function heading(text: string, theme: Theme, opts: { bg?: string, color?: string, size?: number, top?: number, bottom?: number, level?: string, align?: 'left' | 'center' } = {}) {
  const size = opts.size ?? 30
  return native('Heading', { text, level: opts.level ?? 'h2' }, {
    backgroundColor: opts.bg ?? '#FFFFFF', color: opts.color ?? theme.ink,
    fontFamily: theme.display, fontSize: size, fontWeight: '600', lineHeight: 1.16,
    letterSpacing: size >= 34 ? -0.7 : -0.3, textAlign: opts.align ?? 'left',
    padding: pad(opts.top ?? 32, opts.bottom ?? 12)
  }, { fontSize: Math.min(size, 32), padding: pad(opts.top ?? 28, opts.bottom ?? 12, 22) })
}
function text(copy: string, theme: Theme, opts: { bg?: string, color?: string, top?: number, bottom?: number, size?: number, align?: 'left' | 'center' } = {}) {
  return native('Text', { text: copy }, {
    backgroundColor: opts.bg ?? '#FFFFFF', color: opts.color ?? theme.muted,
    fontFamily: 'MODERN_SANS', fontSize: opts.size ?? 16, fontWeight: 'normal', lineHeight: 1.65,
    textAlign: opts.align ?? 'left', padding: pad(opts.top ?? 0, opts.bottom ?? 24)
  }, { padding: pad(opts.top ?? 0, opts.bottom ?? 22, 22) })
}
function button(label: string, url: string, theme: Theme, opts: { bg?: string, color?: string, buttonBg?: string, bottom?: number } = {}) {
  return native('Button', {
    text: label, url, buttonBackgroundColor: opts.buttonBg ?? theme.accent,
    buttonTextColor: opts.color ?? theme.accentInk, buttonStyle: 'rounded', size: 'large'
  }, {
    backgroundColor: opts.bg ?? '#FFFFFF', fontFamily: 'MODERN_SANS', fontSize: 15,
    fontWeight: '600', textAlign: 'left', padding: pad(0, opts.bottom ?? 32), borderRadius: 6
  }, { padding: pad(0, opts.bottom ?? 28, 22) })
}
function image(url: string, alt: string, backgroundColor: string): EdmPresetBlockTemplate {
  return native('Image', { url, alt, width: 600 }, { padding: pad(0, 0, 0), backgroundColor })
}
function section(id: ModernSectionId, categoryId: EdmSectionPreset['categoryId'], name: string, description: string, blocks: EdmPresetBlockTemplate[], dark = false): EdmSectionPreset {
  const icons: Partial<Record<EdmSectionPreset['categoryId'], string>> = { header: 'i-lucide-panel-top', content: 'i-lucide-layout-list', feature: 'i-lucide-sparkles', 'call-to-action': 'i-lucide-megaphone', footer: 'i-lucide-panel-bottom', transactional: 'i-lucide-circle-check' }
  return { id, categoryId, kind: 'section', name, description, icon: icons[categoryId] ?? 'i-lucide-layout-template', previewTone: dark ? 'dark' : 'light', blocks }
}
function header(theme: Theme, items: string[], dark = false): EdmPresetBlockTemplate[] {
  const bg = dark ? theme.deep : '#FFFFFF'
  const color = dark ? '#FFFFFF' : theme.ink
  const brand = heading(theme.brand, theme, { bg, color, size: 23, top: 25, bottom: 4, level: 'h2' })
  const menu = navMenu({ items: items.map(label => ({ label, url: `${SITE}/${label.toLowerCase().replace(/\s+/g, '-')}` })), separator: '|', color: dark ? '#D7E7F0' : theme.muted, backgroundColor: bg, padding: pad(8, 22) })
  menu.data.mobile = { style: { padding: pad(8, 20, 22) } }
  return [brand, menu]
}
function features(theme: Theme, title: string, intro: string, items: { heading: string, description: string }[]): EdmPresetBlockTemplate[] {
  const row = featureRow({ features: items.map(item => ({ ...item, icon: '✓' })), columns: 2, iconColor: theme.ink, backgroundColor: theme.paper, padding: pad(0, 30, 24) })
  row.data.props = { ...row.data.props, cardStyle: 'plain' }
  row.data.mobile = { props: { columns: 1 }, style: { padding: pad(0, 26, 14) } }
  return [heading(title, theme, { bg: theme.paper, size: 27 }), text(intro, theme, { bg: theme.paper, bottom: 18 }), row]
}
function cta(theme: Theme, title: string, copy: string, label: string, path: string): EdmPresetBlockTemplate[] {
  return [heading(title, theme, { bg: theme.deep, color: '#FFFFFF', size: 28, top: 34 }), text(copy, theme, { bg: theme.deep, color: '#E0E7EF', bottom: 22 }), button(label, `${SITE}/${path}`, theme, { bg: theme.deep, bottom: 34 })]
}
function footer(theme: Theme): EdmPresetBlockTemplate[] {
  // Native footer keeps the renderer's actual unsubscribe handling; identity copy
  // remains an explicit editable placeholder rather than an invented street address.
  const legal = richFooter({ additionalText: `${theme.brand} · Your business postal address. You are receiving this email because you subscribed to our updates.`, showUnsubscribe: true, showAddress: false, backgroundColor: '#F6F7F9', color: '#5C6574', padding: pad(22, 26) })
  legal.data.mobile = { style: { padding: pad(20, 24, 22) } }
  return [navMenu({ items: [{ label: 'Contact', url: `${SITE}/contact` }, { label: 'Privacy', url: `${SITE}/privacy` }], separator: '|', color: '#526170', backgroundColor: '#F6F7F9', padding: pad(22, 0) }), legal]
}

const e = themes.electric!, p = themes.property!, hospitalityTheme = themes.hospitality!, w = themes.wellness!, a = themes.advisory!
export const MODERN_EDM_SECTION_PRESETS: EdmSectionPreset[] = [
  section('modern-electric-header', 'header', 'Electric brand header', 'A confident dark wordmark with clean campaign navigation.', header(e, ['Explore', 'Test drive', 'Contact'], true), true),
  section('modern-electric-hero', 'content', 'Electric drive hero', 'Large automotive photography, crisp type and a test-drive action.', [
    heading('A new perspective on electric.', e, { bg: e.deep, color: '#FFFFFF', size: 42, top: 28 }),
    text('Explore the Kia EV9 with a closer look at space, design and your everyday drive.', e, { bg: e.deep, color: '#D7E7F0', bottom: 22 }),
    button('Explore the EV9', `${SITE}/vehicles/ev9`, e, { bg: e.deep, bottom: 28 }),
    image('https://app.xeroflow.io/email/postcards/glidex/images/image-174100413618310-b627d19e.jpeg', 'Kia EV9 photographed outside a contemporary building', e.deep)
  ], true),
  section('modern-electric-features', 'feature', 'A closer look at the drive', 'Two useful talking points for an automotive campaign.', features(e, 'Made for the way you move.', 'Put the details your customers care about in one clear place.', [
    { heading: 'Discover the details', description: 'Share the cabin, technology and design highlights that make this model worth a closer look.' },
    { heading: 'Find your fit', description: 'Help customers compare available variants, finishes and options with your team.' }
  ])),
  section('modern-electric-cta', 'call-to-action', 'Book a test drive', 'A direct next step with room for dealer-specific details.', cta(e, 'Take the next step from here.', 'Choose a time to see the vehicle and talk through your questions with the team.', 'Book a test drive', 'book-a-test-drive'), true),
  section('modern-electric-footer', 'footer', 'Electric campaign footer', 'Simple contact, privacy and native unsubscribe controls.', footer(e)),

  section('modern-property-header', 'header', 'Property editorial header', 'An understated property wordmark with inspection navigation.', header(p, ['Properties', 'Inspections', 'Contact'])),
  section('modern-property-hero', 'content', 'Open house hero', 'Architectural imagery with a calm, spacious editorial introduction.', [
    image(`${IMAGE_ROOT}property-hero.jpg`, 'A contemporary coastal home with timber, glass and a native garden', '#FFFFFF'),
    heading('Your next chapter has a place.', p, { size: 40, top: 32 }),
    text('Step inside this week’s featured home. Discover considered spaces, a welcoming setting and the details that make a place feel like yours.', p),
    button('View the property', `${SITE}/featured-property`, p, { buttonBg: p.deep, color: '#FFFFFF' })
  ]),
  section('modern-property-features', 'feature', 'Property highlights', 'A clear pair of editable listing highlights.', features(p, 'A home worth getting to know.', 'Replace these highlights with the features that matter most for your listing.', [
    { heading: 'Space to settle in', description: 'Introduce the living spaces, outdoor areas and thoughtful details buyers will want to explore.' },
    { heading: 'A neighbourhood to discover', description: 'Share nearby parks, local favourites and practical connections relevant to the property.' }
  ])),
  section('modern-property-cta', 'call-to-action', 'Inspection invitation', 'A composed invitation for inspection bookings or private viewings.', cta(p, 'See how it feels in person.', 'Add your inspection date and time, or invite buyers to arrange a private viewing.', 'Arrange an inspection', 'book-inspection'), true),
  section('modern-property-footer', 'footer', 'Property editorial footer', 'An uncluttered legal footer that remains readable on any canvas.', footer(p)),

  section('modern-hospitality-header', 'header', 'Coastal hospitality header', 'A warm editorial wordmark with stay and dining navigation.', header(hospitalityTheme, ['Stay', 'Dine', 'Discover'])),
  section('modern-hospitality-hero', 'content', 'A slower weekend hero', 'An inviting travel photograph with an image-led stay campaign.', [
    image(`${IMAGE_ROOT}hospitality-hero.jpg`, 'Breakfast on a boutique coastal hotel terrace overlooking the bay', '#FFFFFF'),
    heading('A slower morning. A table by the water.', hospitalityTheme, { size: 38 }),
    text('Make a little room for a change of scene. Explore a coastal stay, discover what is on the menu and plan a weekend at your own pace.', hospitalityTheme),
    button('Explore your stay', `${SITE}/stays`, hospitalityTheme)
  ]),
  section('modern-hospitality-features', 'feature', 'Stay and dining highlights', 'Two complementary experiences for a hospitality newsletter.', features(hospitalityTheme, 'Make the most of being here.', 'Bring the character of your property and local area into the invitation.', [
    { heading: 'Find your favourite table', description: 'Introduce your seasonal menu, breakfast offering or a dining experience worth making time for.' },
    { heading: 'Take the scenic route', description: 'Share a coastal walk, a local maker or a nearby place your guests will love discovering.' }
  ])),
  section('modern-hospitality-cta', 'call-to-action', 'Plan a coastal escape', 'A clear reservation action without invented prices or availability.', cta(hospitalityTheme, 'Something to look forward to.', 'Add your package details, dates and booking conditions here, then invite guests to plan their visit.', 'Plan your visit', 'plan-your-visit'), true),
  section('modern-hospitality-footer', 'footer', 'Hospitality campaign footer', 'Quiet contact details with native unsubscribe support.', footer(hospitalityTheme)),

  section('modern-wellness-header', 'header', 'Wellness studio header', 'A relaxed studio wordmark with practical class navigation.', header(w, ['Classes', 'The studio', 'Contact'])),
  section('modern-wellness-hero', 'content', 'Make room for balance', 'A light-filled studio image and a welcoming class invitation.', [
    image(`${IMAGE_ROOT}wellness-hero.jpg`, 'A light-filled Pilates studio with a timber reformer and sage mat', '#FFFFFF'),
    heading('Make room for a little more balance.', w, { size: 39 }),
    text('A new routine starts with finding what feels right for you. Explore the studio, meet the classes and choose a time that fits your day.', w),
    button('Find your first class', `${SITE}/classes`, w, { buttonBg: w.deep, color: '#FFFFFF' })
  ]),
  section('modern-wellness-features', 'feature', 'Your first studio visit', 'A practical introduction with no unsupported health claims.', features(w, 'Start where you are.', 'Give new members the information they need to feel welcome.', [
    { heading: 'Find the right session', description: 'Explain the class formats, experience levels and what to bring for a comfortable first visit.' },
    { heading: 'Meet your studio', description: 'Introduce your instructors and show the space, with useful information about arrival and bookings.' }
  ])),
  section('modern-wellness-cta', 'call-to-action', 'Explore the timetable', 'A considered studio CTA with room for introductory details.', cta(w, 'A little time, just for you.', 'Add your introductory class details or membership options, including any conditions that apply.', 'Explore the timetable', 'timetable'), true),
  section('modern-wellness-footer', 'footer', 'Wellness studio footer', 'A light, readable studio footer with unsubscribe handling.', footer(w)),

  section('modern-advisory-header', 'header', 'Professional services header', 'A precise wordmark and navigation for a professional newsletter.', header(a, ['Insights', 'Our work', 'Contact'], true), true),
  section('modern-advisory-hero', 'content', 'The better brief hero', 'An editorial workspace image paired with a confident advisory message.', [
    heading('Good decisions start with a clearer plan.', a, { bg: a.deep, color: '#FFFFFF', size: 40, top: 28 }),
    text('A practical update for teams shaping their next chapter. Useful perspectives, considered work and a clear place to start the conversation.', a, { bg: a.deep, color: '#DEE7F2' }),
    image(`${IMAGE_ROOT}services-hero.jpg`, 'Architectural plans and material samples on a sunlit professional workspace', a.deep)
  ], true),
  section('modern-advisory-features', 'feature', 'A practical perspective', 'A two-part insights section for a professional audience.', features(a, 'Bring the next step into focus.', 'Share one useful perspective and one piece of work, with a direct link to each.', [
    { heading: 'An idea worth considering', description: 'Summarise your latest insight in a few clear sentences, focusing on what it means for your audience.' },
    { heading: 'Work with a point of view', description: 'Introduce a recent project or a practical example that shows how your team approaches a challenge.' }
  ])),
  section('modern-advisory-cta', 'call-to-action', 'Start a useful conversation', 'A straightforward consultation invitation for service businesses.', cta(a, 'What are you working towards?', 'Tell us what is taking shape. We can start with a focused conversation about your priorities and the next useful step.', 'Start a conversation', 'contact'), true),
  section('modern-advisory-footer', 'footer', 'Professional newsletter footer', 'A crisp legal footer for advisory and professional newsletters.', footer(a)),

  section('modern-booking-confirmation', 'transactional', 'Booking confirmation', 'A modern appointment or inspection confirmation with editable details.', [
    heading('You’re booked in.', p, { bg: p.paper, size: 32 }),
    text('Your booking details: add the date, time, location and contact person here. Let customers know how to change their booking if plans shift.', p, { bg: p.paper }),
    button('View booking details', `${SITE}/booking`, p, { bg: p.paper, buttonBg: p.deep, color: '#FFFFFF' })
  ]),
  section('modern-welcome-note', 'transactional', 'A warm welcome', 'An editable welcome note with a clear first action.', [
    heading('A good place to begin.', w, { bg: w.paper, size: 32 }),
    text('Welcome to the studio. Here is what to expect, where to find the information you need and how to take your first step.', w, { bg: w.paper }),
    button('Explore what’s next', `${SITE}/welcome`, w, { bg: w.paper, buttonBg: w.deep, color: '#FFFFFF' })
  ]),
  section('modern-order-receipt', 'transactional', 'Order update', 'A clean order summary for retail or hospitality confirmations.', [
    heading('Thanks. We have your order.', hospitalityTheme, { bg: hospitalityTheme.paper, size: 32 }),
    text('Add the order number, purchased items, total and delivery or collection details here. Keep service information separate from promotional content.', hospitalityTheme, { bg: hospitalityTheme.paper }),
    button('View your order', `${SITE}/order`, hospitalityTheme, { bg: hospitalityTheme.paper, buttonBg: hospitalityTheme.deep, color: '#FFFFFF' })
  ])
]

export const MODERN_EDM_STARTER_TEMPLATES: EdmStarterTemplate[] = [
  { id: 'modern-electric-drive', name: 'Electric Drive', description: 'An image-led vehicle announcement with a focused test-drive invitation, inspired by FuturaX and GlideX.', industry: 'Automotive', usage: 'Announcement', style: 'Bold', previewTone: 'dark', sectionPresetIds: ['modern-electric-header', 'modern-electric-hero', 'modern-electric-features', 'modern-electric-cta', 'modern-electric-footer'], subject: 'A new perspective on electric', previewText: 'Explore the details and plan your next test drive.', isNew: true },
  { id: 'modern-open-house', name: 'The Open House', description: 'A considered property showcase with architectural imagery and an inspection invitation.', industry: 'Property', usage: 'Event', style: 'Editorial', previewTone: 'light', sectionPresetIds: ['modern-property-header', 'modern-property-hero', 'modern-property-features', 'modern-property-cta', 'modern-property-footer'], subject: 'Your next chapter has a place', previewText: 'Take a closer look at this week’s featured home.', isNew: true },
  { id: 'modern-weekend-edit', name: 'The Weekend Edit', description: 'An inviting stay and dining campaign with a coastal editorial feel.', industry: 'Hospitality', usage: 'Promotion', style: 'Editorial', previewTone: 'light', sectionPresetIds: ['modern-hospitality-header', 'modern-hospitality-hero', 'modern-hospitality-features', 'modern-hospitality-cta', 'modern-hospitality-footer'], subject: 'Your next long weekend starts here', previewText: 'A change of scene, a favourite table and time to unwind.', isNew: true },
  { id: 'modern-studio-welcome', name: 'A Little More Balance', description: 'A warm studio introduction with a clear path to a first class.', industry: 'Health & Wellness', usage: 'Welcome', style: 'Minimal', previewTone: 'light', sectionPresetIds: ['modern-wellness-header', 'modern-wellness-hero', 'modern-wellness-features', 'modern-wellness-cta', 'modern-wellness-footer'], subject: 'Make room for a little more balance', previewText: 'Explore the studio and find a class that fits your day.', isNew: true },
  { id: 'modern-better-brief', name: 'The Better Brief', description: 'A confident professional-services newsletter with practical insights and a consultation CTA.', industry: 'Professional Services', usage: 'Newsletter', style: 'Corporate', previewTone: 'dark', sectionPresetIds: ['modern-advisory-header', 'modern-advisory-hero', 'modern-advisory-features', 'modern-advisory-cta', 'modern-advisory-footer'], subject: 'A clearer view of what comes next', previewText: 'Useful perspectives and a practical place to start.', isNew: true }
]
