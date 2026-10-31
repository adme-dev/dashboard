/**
 * Banner-facing excerpts of MotorStack dealer style guides. Source:
 * OEM-variants/data/style-guides/<brand>/guide.md at 51cb53645aba169dfae9ec8bd574b8943115bb12.
 * These describe the resting CTA, not every interaction in the full guide.
 */
export interface BrandStyleProfile {
  label: string
  surface: string
  heading: string
  body: string
  ctaFill: string
  ctaText: string
  ctaBorder?: string
  ctaRadius: number
  ctaCase: 'uppercase' | 'lowercase' | 'none'
  ctaFontRole?: 'heading' | 'body' | 'extra'
  headingFontRole?: 'heading' | 'body' | 'extra'
  secondaryFill: string
  secondaryText: string
  secondaryBorder?: string
  note: string
}

const profiles: Record<string, BrandStyleProfile> = {
  alfaromeo: { label: 'Alfa Romeo', surface: '#292b35', heading: '#f4f4f4', body: '#f4f4f4', ctaFill: '#f4f4f4', ctaText: '#292b35', ctaBorder: '#f4f4f4', ctaRadius: 0, ctaCase: 'uppercase', secondaryFill: 'transparent', secondaryText: '#f4f4f4', secondaryBorder: '#f4f4f4', note: 'Pale primary CTA on charcoal; red belongs to the kicker rule.' },
  chery: { label: 'Chery', surface: '#ffffff', heading: '#000000', body: '#333333', ctaFill: 'transparent', ctaText: '#000000', ctaBorder: '#000000', ctaRadius: 0, ctaCase: 'none', secondaryFill: '#000000', secondaryText: '#ffffff', note: 'Square black outline CTA; fills black on hover.' },
  ford: { label: 'Ford', surface: '#ffffff', heading: '#000000', body: '#333333', ctaFill: '#066fef', ctaText: '#ffffff', ctaRadius: 400, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Skyview blue 40px primary pill; outlined secondary pill.' },
  forthing: { label: 'Forthing', surface: '#154e31', heading: '#ffffff', body: '#ffffff', ctaFill: '#ff5e00', ctaText: '#ffffff', ctaRadius: 3, ctaCase: 'none', secondaryFill: '#ffffff', secondaryText: '#000000', note: 'Orange primary action; green is the band colour, not the primary button.' },
  foton: { label: 'Foton', surface: '#111827', heading: '#ffffff', body: '#ffffff', ctaFill: '#052e6a', ctaText: '#ffffff', ctaBorder: '#052e6a', ctaRadius: 6, ctaCase: 'none', secondaryFill: '#ffffff', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Navy primary action with 6px corners; black-outline secondary.' },
  gac: { label: 'GAC', surface: '#000000', heading: '#ffffff', body: '#ffffff', ctaFill: '#ffffff', ctaText: '#000000', ctaBorder: '#ffffff', ctaRadius: 4, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#ffffff', secondaryBorder: '#ffffff', note: 'White 36px rectangle on the hero; Montserrat label at regular weight.' },
  gmsv: { label: 'GMSV', surface: '#000000', heading: '#ffffff', body: '#ffffff', ctaFill: '#000000', ctaText: '#ffffff', ctaBorder: '#b3842d', ctaRadius: 0, ctaCase: 'uppercase', secondaryFill: '#ffffff', secondaryText: '#000000', note: 'Quantum primary action has a gold rule; Corvette uses a separate pill treatment.' },
  gwm: { label: 'GWM', surface: '#212529', heading: '#ffffff', body: '#ffffff', ctaFill: '#ffffff', ctaText: '#000000', ctaRadius: 0, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#ffffff', secondaryBorder: '#ffffff', note: 'Square white hero CTA; dark filled CTA on light bands.' },
  hyundai: { label: 'Hyundai', surface: '#ffffff', heading: '#002c5f', body: '#002c5f', ctaFill: '#002c5f', ctaText: '#ffffff', ctaRadius: 0, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#002c5f', secondaryBorder: '#002c5f', note: 'Navy square action; Hyundai Sans Head for buttons and headings.' },
  isuzu: { label: 'Isuzu UTE', surface: '#ffffff', heading: '#282828', body: '#282828', ctaFill: '#c21300', ctaText: '#ffffff', ctaBorder: '#c21300', ctaRadius: 25, ctaCase: 'uppercase', secondaryFill: 'transparent', secondaryText: '#c21300', secondaryBorder: '#c21300', note: 'Isuzu red pill, white Rift Demi label and trailing chevron.' },
  jac: { label: 'JAC', surface: '#ffffff', heading: '#171a20', body: '#171a20', ctaFill: '#c82127', ctaText: '#ffffff', ctaRadius: 999, ctaCase: 'none', secondaryFill: '#171a20', secondaryText: '#ffffff', note: 'Red primary action; ink pill is the supporting button family.' },
  jeep: { label: 'Jeep', surface: '#ffffff', heading: '#040505', body: '#040505', ctaFill: '#1e4544', ctaText: '#ffffff', ctaRadius: 0, ctaCase: 'uppercase', secondaryFill: '#ffffff', secondaryText: '#040505', secondaryBorder: '#1e4544', note: 'Dark green primary; button-group theme changes green on dark panels.' },
  kia: { label: 'Kia', surface: '#ffffff', heading: '#05141f', body: '#05141f', ctaFill: '#05141f', ctaText: '#ffffff', ctaRadius: 15, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#05141f', secondaryBorder: '#05141f', note: 'Midnight ink pill; Kia red is for emphasis and active states.' },
  ldv: { label: 'LDV', surface: '#ffffff', heading: '#000000', body: '#464646', ctaFill: '#bc3219', ctaText: '#ffffff', ctaRadius: 0, ctaCase: 'uppercase', ctaFontRole: 'body', headingFontRole: 'extra', secondaryFill: 'transparent', secondaryText: '#bc3219', secondaryBorder: '#bc3219', note: 'Square red primary; red outline on white, white fill on black.' },
  leapmotor: { label: 'Leapmotor', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#0f500f', ctaText: '#ffffff', ctaBorder: '#0f500f', ctaRadius: 24, ctaCase: 'none', secondaryFill: '#ffffff', secondaryText: '#0f500f', secondaryBorder: '#0f500f', note: 'Forest green pill; Montserrat labels, no automatic uppercase.' },
  mazda: { label: 'Mazda', surface: '#ffffff', heading: '#101010', body: '#101010', ctaFill: '#101010', ctaText: '#ffffff', ctaBorder: '#101010', ctaRadius: 5, ctaCase: 'uppercase', secondaryFill: 'transparent', secondaryText: '#101010', secondaryBorder: '#101010', note: 'Monochrome filled or outlined button; crimson is limited to test-drive emphasis.' },
  mg: { label: 'MG', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#000000', ctaText: '#ffffff', ctaRadius: 25, ctaCase: 'none', secondaryFill: '#ffffff', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Black or white pill; MG red is not the CTA fill.' },
  mitsubishi: { label: 'Mitsubishi', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#ed0000', ctaText: '#ffffff', ctaRadius: 4, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Red primary; outlined black or white secondary by surface.' },
  nissan: { label: 'Nissan', surface: '#ffffff', heading: '#000000', body: '#020a0d', ctaFill: '#000000', ctaText: '#ffffff', ctaBorder: '#000000', ctaRadius: 40, ctaCase: 'none', ctaFontRole: 'heading', headingFontRole: 'body', secondaryFill: 'transparent', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Monochrome 2px-outline pills. Nissan red is the mark, not the interface.' },
  omodajaecoo: { label: 'Omoda Jaecoo', surface: '#121913', heading: '#ffffff', body: '#ffffff', ctaFill: '#ddc19a', ctaText: '#181818', ctaRadius: 999, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#ffffff', secondaryBorder: '#ffffff', note: 'Jaecoo green and sand; translucent hero actions vary by CMS context.' },
  ram: { label: 'RAM', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#000000', ctaText: '#ffffff', ctaRadius: 0, ctaCase: 'uppercase', secondaryFill: 'transparent', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Square black CTA; red appears on hover and active states.' },
  renault: { label: 'Renault', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#000000', ctaText: '#ffffff', ctaRadius: 0, ctaCase: 'lowercase', secondaryFill: 'transparent', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Lowercase black CTA; Renault yellow is the hover fill.' },
  ssangyong: { label: 'KGM', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#0091da', ctaText: '#ffffff', ctaRadius: 8, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#0091da', secondaryBorder: '#0091da', note: 'Blue primary with white bold label and 8px corners.' },
  subaru: { label: 'Subaru', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#1637a0', ctaText: '#ffffff', ctaBorder: '#1637a0', ctaRadius: 100, ctaCase: 'none', secondaryFill: '#ffffff', secondaryText: '#1637a0', secondaryBorder: '#1637a0', note: 'Current Subaru blue pill; navy hover.' },
  suzuki: { label: 'Suzuki', surface: '#ffffff', heading: '#121212', body: '#121212', ctaFill: '#121212', ctaText: '#ffffff', ctaRadius: 0, ctaCase: 'uppercase', secondaryFill: 'transparent', secondaryText: '#121212', secondaryBorder: '#121212', note: 'Square black fill or outline; Loos Extd Bd uppercase label.' },
  volkswagen: { label: 'Volkswagen', surface: '#1b2236', heading: '#ffffff', body: '#ffffff', ctaFill: '#ffffff', ctaText: '#1b2236', ctaRadius: 100, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#ffffff', secondaryBorder: '#ffffff', note: 'White pill on photo or dark band; every variant hovers to sand.' },
  xpeng: { label: 'XPENG', surface: '#ffffff', heading: '#000000', body: '#000000', ctaFill: '#000000', ctaText: '#ffffff', ctaRadius: 4, ctaCase: 'none', secondaryFill: 'transparent', secondaryText: '#000000', secondaryBorder: '#000000', note: 'Figtree labels with small square corners; no automatic uppercase.' }
}

export function brandStyleProfile(brandId: string | null | undefined): BrandStyleProfile | null {
  return brandId ? profiles[brandId] || null : null
}
