// server/utils/email-marketing/render/blocks/offer-html-generator.ts
// Minimal stub for the automotive offers feature that html-block.ts references.
// The OEM-offers dynamic block is out of scope for the agency email module;
// this returns empty markup so html-block renders everything else normally.

export interface OfferData {
  id?: string
  title?: string
  description?: string
  ctaUrl?: string
  ctaText?: string
  [key: string]: unknown
}

export function generateOffersSectionHtml(_offers: OfferData[], _opts?: Record<string, unknown>): string {
  return ''
}
