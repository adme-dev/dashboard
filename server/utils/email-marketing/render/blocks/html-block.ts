/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any -- ported block; unused items + any belong to the stubbed offers/Maizzle/vehicle paths */
import { registerBlock } from '../block-registry'
import type {
  FlyhubBlock,
  BlockRenderContext,
  DynamicBlockConfig,
  PreviewVehicle,
  PreviewOffer
} from './types'
import { formatPadding } from './types'
import { escapeHtml } from './helpers'
import { generateHeroTemplateHtml, generateMaizzleVehiclesSectionHtml } from './maizzle-helpers'
import { generateOffersSectionHtml, type OfferData } from './offer-html-generator'
import { anchorIdAttribute } from '~~/app/utils/edmAnchor'

// ---------------------------------------------------------------------------
// MJML vehicle/offer rendering helpers
// ---------------------------------------------------------------------------

function generateVehiclesSectionMjml(
  vehicles: PreviewVehicle[],
  options: {
    columns?: number
    title?: string
    subtitle?: string
    primaryColor?: string
  } = {}
): string {
  const { columns = 2, title, subtitle, primaryColor = '#2563eb' } = options

  const headerMjml = title
    ? `
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" font-weight="bold" color="#111827">${escapeHtml(title)}</mj-text>
        ${subtitle ? `<mj-text align="center" font-size="14px" color="#6b7280" padding-top="4px">${escapeHtml(subtitle)}</mj-text>` : ''}
      </mj-column>
    </mj-section>`
    : ''

  // Create vehicle cards grouped by rows
  const rows: string[] = []
  for (let i = 0; i < vehicles.length; i += columns) {
    const rowVehicles = vehicles.slice(i, i + columns)
    const columnWidth = Math.floor(100 / columns)

    const columnsContent = rowVehicles
      .map((v) => {
        const specs = [
          v.transmission,
          v.fuelType,
          v.odometer ? `${new Intl.NumberFormat('en-AU').format(v.odometer)} km` : null
        ]
          .filter(Boolean)
          .join(' | ')

        // Build badges
        const badgesMjml = (v.badges || [])
          .map(
            badge => `
        <span style="display: inline-block; padding: 2px 8px; margin-right: 4px; margin-bottom: 4px; background: ${badge.color}; color: white; font-size: 10px; font-weight: 600; border-radius: 4px; text-transform: uppercase;">${escapeHtml(badge.text)}</span>
      `
          )
          .join('')

        // Use percentage width, columns will stack to 100% on mobile via mj-breakpoint
        return `
        <mj-column width="${columnWidth}%" padding="8px" vertical-align="top">
          <mj-image
            src="${v.imageUrl || 'https://placehold.co/300x200/e5e7eb/9ca3af?text=No+Image'}"
            alt="${v.year} ${v.make} ${v.model}"
            href="${v.vehicleUrl}"
            border-radius="8px 8px 0 0"
            fluid-on-mobile="true"
          />
          ${badgesMjml ? `<mj-raw><div style="padding: 8px 12px 0;">${badgesMjml}</div></mj-raw>` : ''}
          <mj-text padding="8px 12px 4px" font-weight="bold" font-size="14px" color="#111827">
            ${v.year} ${v.make} ${v.model}
          </mj-text>
          ${v.variant ? `<mj-text padding="0 12px 4px" font-size="12px" color="#6b7280">${escapeHtml(v.variant)}</mj-text>` : ''}
          ${specs ? `<mj-text padding="0 12px 8px" font-size="11px" color="#9ca3af">${escapeHtml(specs)}</mj-text>` : ''}
          <mj-text padding="0 12px 12px" font-size="20px" font-weight="bold" color="#111827">${v.formattedPrice}</mj-text>
          <mj-button
            padding="0 12px 16px"
            href="${v.vehicleUrl}"
            background-color="${primaryColor}"
            color="#ffffff"
            border-radius="6px"
            font-size="13px"
            inner-padding="10px 20px"
          >View Details</mj-button>
        </mj-column>`
      })
      .join('\n')

    // Fill empty columns if row is not complete
    const emptyColumns = columns - rowVehicles.length
    const emptyColumnsMjml = Array(emptyColumns)
      .fill(`<mj-column width="${Math.floor(100 / columns)}%" />`)
      .join('\n')

    rows.push(`
      <mj-section padding="0" background-color="#f9fafb" direction="ltr">
        ${columnsContent}
        ${emptyColumnsMjml}
      </mj-section>`)
  }

  return `
    <mj-section padding="20px" background-color="#f9fafb">
      <mj-column>
        <mj-spacer height="0px" />
      </mj-column>
    </mj-section>
    ${headerMjml}
    ${rows.join('\n')}
    <mj-section padding="0 20px 20px" background-color="#f9fafb">
      <mj-column>
        <mj-spacer height="0px" />
      </mj-column>
    </mj-section>`
}

function generateOffersSectionMjml(
  offers: PreviewOffer[],
  options: {
    columns?: number
    title?: string
    subtitle?: string
    showPrice?: boolean
    showSpecs?: boolean
    showBanner?: boolean
    showExpiry?: boolean
    ctaText?: string
    priceLabel?: string
    layout?: 'cards' | 'featured' | 'list' | 'banner'
    primaryColor?: string
  } = {}
): string {
  const {
    columns = 2,
    title,
    subtitle,
    showPrice = true,
    showSpecs = true,
    showBanner = true,
    showExpiry = false,
    ctaText = 'View Offer',
    priceLabel = 'Driveaway from',
    layout = 'cards',
    primaryColor = '#2563eb'
  } = options

  const headerMjml = title
    ? `
    <mj-section padding="0 0 16px 0">
      <mj-column>
        <mj-text align="center" font-size="22px" font-weight="bold" color="#111827">${escapeHtml(title)}</mj-text>
        ${subtitle ? `<mj-text align="center" font-size="14px" color="#6b7280" padding-top="4px">${escapeHtml(subtitle)}</mj-text>` : ''}
      </mj-column>
    </mj-section>`
    : ''

  // Banner layout - full-width promotional banners
  if (layout === 'banner') {
    const bannersMjml = offers
      .map((offer) => {
        const imageUrl = offer.vehicleImageUrl || offer.imageUrl
        return `
        <mj-section background-color="${primaryColor}" padding="24px" border-radius="12px">
          ${
            imageUrl
              ? `
            <mj-column width="40%">
              <mj-image src="${imageUrl}" alt="${escapeHtml(offer.vehicleName || offer.title)}" border-radius="8px" />
            </mj-column>
            <mj-column width="60%">
          `
              : '<mj-column>'
          }
              ${offer.bannerText && showBanner ? `<mj-text color="rgba(255,255,255,0.8)" font-size="11px" text-transform="uppercase" padding-bottom="8px">${escapeHtml(offer.bannerText)}</mj-text>` : ''}
              ${offer.vehicleName ? `<mj-text color="rgba(255,255,255,0.9)" font-size="12px" text-transform="uppercase" font-weight="600" padding-bottom="4px">${escapeHtml(offer.vehicleName)}</mj-text>` : ''}
              <mj-text color="#ffffff" font-size="20px" font-weight="bold" line-height="1.2" padding-bottom="8px">${escapeHtml(offer.title)}</mj-text>
              <mj-text color="rgba(255,255,255,0.9)" font-size="13px" padding-bottom="12px">${escapeHtml(offer.description)}</mj-text>
              ${
                showPrice && offer.formattedPriceRetail
                  ? `
                <mj-text color="rgba(255,255,255,0.7)" font-size="11px" padding-bottom="2px">${escapeHtml(priceLabel)}</mj-text>
                <mj-text color="#ffffff" font-size="24px" font-weight="bold" padding-bottom="12px">${offer.formattedPriceRetail}</mj-text>
              `
                  : ''
              }
              <mj-button href="${offer.ctaUrl}" background-color="#ffffff" color="${primaryColor}" border-radius="6px" font-weight="bold" inner-padding="10px 24px">${escapeHtml(ctaText)}</mj-button>
            </mj-column>
        </mj-section>`
      })
      .join('\n<mj-section padding="8px 0" />\n')

    return `
      <mj-section padding="20px 0 0">
        <mj-column>
          <mj-spacer height="0px" />
        </mj-column>
      </mj-section>
      ${headerMjml}
      ${bannersMjml}
      <mj-section padding="0 0 20px">
        <mj-column>
          <mj-spacer height="0px" />
        </mj-column>
      </mj-section>`
  }

  // List layout - horizontal rows
  if (layout === 'list') {
    const listMjml = offers
      .map((offer) => {
        const imageUrl = offer.vehicleImageUrl || offer.imageUrl
        return `
        <mj-section padding="12px 0" border-bottom="1px solid #e5e7eb" background-color="#ffffff">
          ${
            imageUrl
              ? `
            <mj-column width="30%">
              <mj-image src="${imageUrl}" alt="${escapeHtml(offer.title)}" border-radius="6px" />
            </mj-column>
            <mj-column width="70%">
          `
              : '<mj-column>'
          }
              ${offer.bannerText && showBanner ? `<mj-text color="#dc2626" font-size="10px" text-transform="uppercase" font-weight="700" padding-bottom="4px">${escapeHtml(offer.bannerText)}</mj-text>` : ''}
              ${offer.vehicleName ? `<mj-text color="#6b7280" font-size="11px" text-transform="uppercase" font-weight="600">${escapeHtml(offer.vehicleName)}</mj-text>` : ''}
              <mj-text font-weight="bold" font-size="16px" color="#111827" padding-top="2px">${escapeHtml(offer.title)}</mj-text>
              <mj-text font-size="13px" color="#6b7280" line-height="1.4" padding-top="4px">${escapeHtml(offer.description)}</mj-text>
              ${showExpiry && offer.daysRemaining !== undefined ? `<mj-text font-size="11px" color="#dc2626" padding-top="8px">${offer.daysRemaining} days remaining</mj-text>` : ''}
              <mj-button
                padding-top="12px"
                href="${offer.ctaUrl}"
                background-color="${primaryColor}"
                color="#ffffff"
                border-radius="6px"
                font-size="12px"
                inner-padding="8px 16px"
              >${escapeHtml(ctaText)}</mj-button>
            </mj-column>
        </mj-section>`
      })
      .join('\n')

    return `
      <mj-section padding="20px" background-color="#f9fafb">
        <mj-column>
          <mj-spacer height="0px" />
        </mj-column>
      </mj-section>
      ${headerMjml}
      ${listMjml}
      <mj-section padding="0 20px 20px" background-color="#f9fafb">
        <mj-column>
          <mj-spacer height="0px" />
        </mj-column>
      </mj-section>`
  }

  // Featured layout - hero + smaller cards
  if (layout === 'featured' && offers.length > 0) {
    const heroOffer = offers[0]
    const remainingOffers = offers.slice(1)
    const heroImageUrl = heroOffer.vehicleImageUrl || heroOffer.imageUrl

    const heroMjml = `
      <mj-section padding="0 0 16px 0" background-color="#ffffff" border="2px solid ${primaryColor}" border-radius="12px">
        ${
          heroImageUrl
            ? `
          <mj-column width="50%">
            <mj-image src="${heroImageUrl}" alt="${escapeHtml(heroOffer.vehicleName || heroOffer.title)}" />
          </mj-column>
          <mj-column width="50%">
        `
            : '<mj-column>'
        }
            <mj-text padding="24px 24px 0">
              ${heroOffer.bannerText && showBanner ? `<span style="display: inline-block; padding: 4px 12px; background: #dc2626; color: white; font-size: 11px; font-weight: 700; border-radius: 4px; text-transform: uppercase; margin-bottom: 8px;">${escapeHtml(heroOffer.bannerText)}</span>` : ''}
            </mj-text>
            ${heroOffer.vehicleName ? `<mj-text padding="0 24px 4px" color="#6b7280" font-size="12px" text-transform="uppercase" font-weight="600">${escapeHtml(heroOffer.vehicleName)}</mj-text>` : ''}
            <mj-text padding="0 24px 8px" font-size="22px" font-weight="bold" color="#111827" line-height="1.2">${escapeHtml(heroOffer.title)}</mj-text>
            <mj-text padding="0 24px 12px" font-size="14px" color="#6b7280" line-height="1.5">${escapeHtml(heroOffer.description)}</mj-text>
            ${
              showPrice && heroOffer.formattedPriceRetail
                ? `
              <mj-text padding="0 24px 4px" font-size="12px" color="#6b7280">${escapeHtml(priceLabel)}</mj-text>
              <mj-text padding="0 24px 16px" font-size="28px" font-weight="bold" color="#111827">${heroOffer.formattedPriceRetail}</mj-text>
            `
                : ''
            }
            <mj-button
              padding="0 24px 24px"
              href="${heroOffer.ctaUrl}"
              background-color="${primaryColor}"
              color="#ffffff"
              border-radius="6px"
              font-weight="bold"
              inner-padding="12px 28px"
            >${escapeHtml(ctaText)}</mj-button>
          </mj-column>
      </mj-section>`

    // Remaining offers as smaller cards
    let remainingMjml = ''
    if (remainingOffers.length > 0) {
      const remainingRows: string[] = []
      for (let i = 0; i < remainingOffers.length; i += columns) {
        const rowOffers = remainingOffers.slice(i, i + columns)
        const columnWidth = Math.floor(100 / columns)

        const columnsContent = rowOffers
          .map((offer) => {
            const imageUrl = offer.vehicleImageUrl || offer.imageUrl
            return `
            <mj-column width="${columnWidth}%" padding="8px">
              ${imageUrl ? `<mj-image src="${imageUrl}" alt="${escapeHtml(offer.title)}" border-radius="8px 8px 0 0" />` : ''}
              <mj-text padding="12px 12px 4px" color="${primaryColor}" font-size="11px" text-transform="uppercase" font-weight="600">${offer.type} Offer</mj-text>
              <mj-text padding="0 12px 8px" font-weight="bold" font-size="14px" color="#111827">${escapeHtml(offer.title)}</mj-text>
              ${showPrice && offer.formattedPriceRetail ? `<mj-text padding="0 12px 8px" font-size="16px" font-weight="bold" color="${primaryColor}">${offer.formattedPriceRetail}</mj-text>` : ''}
              <mj-button
                padding="0 12px 16px"
                href="${offer.ctaUrl}"
                background-color="${primaryColor}"
                color="#ffffff"
                border-radius="6px"
                font-size="12px"
                inner-padding="8px 16px"
              >${escapeHtml(ctaText)}</mj-button>
            </mj-column>`
          })
          .join('\n')

        remainingRows.push(
          `<mj-section padding="0" background-color="#f9fafb" direction="ltr">${columnsContent}</mj-section>`
        )
      }
      remainingMjml = remainingRows.join('\n')
    }

    return `
      <mj-section padding="20px" background-color="#f9fafb">
        <mj-column>
          <mj-spacer height="0px" />
        </mj-column>
      </mj-section>
      ${headerMjml}
      ${heroMjml}
      ${remainingMjml}
      <mj-section padding="0 20px 20px" background-color="#f9fafb">
        <mj-column>
          <mj-spacer height="0px" />
        </mj-column>
      </mj-section>`
  }

  // Default cards layout
  const rows: string[] = []
  for (let i = 0; i < offers.length; i += columns) {
    const rowOffers = offers.slice(i, i + columns)
    const columnWidth = Math.floor(100 / columns)

    const columnsContent = rowOffers
      .map((offer) => {
        const imageUrl = offer.vehicleImageUrl || offer.imageUrl
        const specs = offer.specifications?.map(s => s.text).join(' | ') || ''

        return `
        <mj-column width="${columnWidth}%" padding="8px" vertical-align="top">
          ${imageUrl ? `<mj-image src="${imageUrl}" alt="${escapeHtml(offer.title)}" border-radius="8px 8px 0 0" fluid-on-mobile="true" />` : ''}
          <mj-text padding="12px 12px 4px" color="${primaryColor}" font-size="11px" text-transform="uppercase" font-weight="600">${offer.type} Offer</mj-text>
          ${offer.vehicleName ? `<mj-text padding="0 12px 4px" color="#6b7280" font-size="11px" text-transform="uppercase" font-weight="600">${escapeHtml(offer.vehicleName)}</mj-text>` : ''}
          <mj-text padding="0 12px 8px" font-weight="bold" font-size="14px" color="#111827">${escapeHtml(offer.title)}</mj-text>
          <mj-text padding="0 12px 8px" font-size="12px" color="#6b7280" line-height="1.4">${escapeHtml(offer.description)}</mj-text>
          ${showSpecs && specs ? `<mj-text padding="0 12px 8px" font-size="11px" color="#9ca3af">${escapeHtml(specs)}</mj-text>` : ''}
          ${
            showPrice && offer.formattedPriceRetail
              ? `
            <mj-text padding="0 12px 4px" font-size="10px" color="#6b7280">${escapeHtml(priceLabel)}</mj-text>
            <mj-text padding="0 12px 8px" font-size="18px" font-weight="bold" color="#111827">${offer.formattedPriceRetail}</mj-text>
          `
              : ''
          }
          ${showExpiry && offer.daysRemaining !== undefined ? `<mj-text padding="0 12px 8px" font-size="11px" color="#dc2626">${offer.daysRemaining} days remaining</mj-text>` : ''}
          <mj-button
            padding="0 12px 16px"
            href="${offer.ctaUrl}"
            background-color="${primaryColor}"
            color="#ffffff"
            border-radius="6px"
            font-size="12px"
            inner-padding="8px 16px"
          >${escapeHtml(ctaText)}</mj-button>
        </mj-column>`
      })
      .join('\n')

    rows.push(
      `<mj-section padding="0" background-color="#f9fafb" direction="ltr">${columnsContent}</mj-section>`
    )
  }

  return `
    <mj-section padding="20px" background-color="#f9fafb">
      <mj-column>
        <mj-spacer height="0px" />
      </mj-column>
    </mj-section>
    ${headerMjml}
    ${rows.join('\n')}
    <mj-section padding="0 20px 20px" background-color="#f9fafb">
      <mj-column>
        <mj-spacer height="0px" />
      </mj-column>
    </mj-section>`
}

// ---------------------------------------------------------------------------
// HTML vehicle/offer rendering helpers
// ---------------------------------------------------------------------------

/**
 * Format price for display
 */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price)
}

/**
 * Generate HTML for a vehicle card
 */
function generateVehicleCardHtml(vehicle: PreviewVehicle): string {
  const badgeHtml = (vehicle.badges || [])
    .map(
      badge => `
    <span style="
      display: inline-block;
      padding: 2px 8px;
      margin-right: 4px;
      margin-bottom: 4px;
      background: ${badge.color};
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 4px;
      text-transform: uppercase;
    ">${badge.text}</span>
  `
    )
    .join('')

  const urgencyBadge = vehicle.urgencyTier
    ? `
    <div style="
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 4px 8px;
      background: ${vehicle.urgencyTier === 'critical' ? '#dc2626' : vehicle.urgencyTier === 'urgent' ? '#f59e0b' : '#3b82f6'};
      color: white;
      font-size: 10px;
      font-weight: 700;
      border-radius: 4px;
      text-transform: uppercase;
    ">${vehicle.urgencyMessage || vehicle.urgencyTier}</div>
  `
    : ''

  const priceSection = vehicle.hasPriceReduction
    ? `
    <div style="margin-top: 8px;">
      <span style="
        text-decoration: line-through;
        color: #9ca3af;
        font-size: 12px;
        margin-right: 6px;
      ">${vehicle.formattedOriginalPrice}</span>
      <span style="
        display: inline-block;
        padding: 2px 6px;
        background: #fef2f2;
        color: #dc2626;
        font-size: 10px;
        font-weight: 600;
        border-radius: 3px;
      ">Save ${vehicle.formattedSavings}</span>
    </div>
    <div style="
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-top: 4px;
    ">${vehicle.formattedPrice}</div>
  `
    : `
    <div style="
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-top: 8px;
    ">${vehicle.formattedPrice}</div>
  `

  const specsHtml = `
    <table cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px; font-size: 11px; color: #6b7280;">
      <tr>
        ${vehicle.odometer ? `<td style="padding-right: 8px;">&#128207; ${new Intl.NumberFormat('en-AU').format(vehicle.odometer)} km</td>` : ''}
        ${vehicle.transmission ? `<td style="padding-right: 8px;">&#9881; ${vehicle.transmission}</td>` : ''}
        ${vehicle.fuelType ? `<td>&#9981; ${vehicle.fuelType}</td>` : ''}
      </tr>
    </table>
  `

  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      font-family: Arial, sans-serif;
    ">
      <tr>
        <td style="position: relative;">
          ${urgencyBadge}
          <img
            src="${vehicle.imageUrl || 'https://placehold.co/300x200/e5e7eb/9ca3af?text=No+Image'}"
            alt="${vehicle.year} ${vehicle.make} ${vehicle.model}"
            width="100%"
            height="140"
            style="
              width: 100%;
              height: 140px;
              object-fit: cover;
              display: block;
            "
          />
        </td>
      </tr>
      <tr>
        <td style="padding: 12px;">
          <div style="margin-bottom: 6px;">${badgeHtml}</div>
          <div style="
            font-size: 14px;
            font-weight: 600;
            color: #111827;
            line-height: 1.3;
          ">${vehicle.year} ${vehicle.make} ${vehicle.model}</div>
          ${vehicle.variant ? `<div style="font-size: 12px; color: #6b7280;">${vehicle.variant}</div>` : ''}
          ${priceSection}
          ${specsHtml}
          <a href="${vehicle.vehicleUrl}" style="
            display: block;
            margin-top: 12px;
            padding: 10px 16px;
            background: #2f4574;
            color: white;
            text-decoration: none;
            text-align: center;
            font-size: 13px;
            font-weight: 600;
            border-radius: 6px;
          ">View Details</a>
        </td>
      </tr>
    </table>
  `
}

/**
 * Generate HTML for a vehicle grid
 */
function generateVehicleGridHtml(
  vehicles: PreviewVehicle[],
  columns: number = 2,
  title?: string,
  subtitle?: string
): string {
  if (vehicles.length === 0) {
    return ''
  }

  const columnWidth = Math.floor(100 / columns) - 2

  const headerHtml = title
    ? `
    <tr>
      <td colspan="${columns}" style="text-align: center; padding-bottom: 20px;">
        <div style="font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px;">${title}</div>
        ${subtitle ? `<div style="font-size: 14px; color: #6b7280;">${subtitle}</div>` : ''}
      </td>
    </tr>
  `
    : ''

  const vehicleCards = vehicles.map(
    v => `
    <td class="stack-column" style="
      width: ${columnWidth}%;
      vertical-align: top;
      padding: 8px;
    ">
      ${generateVehicleCardHtml(v)}
    </td>
  `
  )

  // Group cards into rows
  const rows: string[] = []
  for (let i = 0; i < vehicleCards.length; i += columns) {
    const rowCards = vehicleCards.slice(i, i + columns)
    while (rowCards.length < columns) {
      rowCards.push(`<td class="stack-column" style="width: ${columnWidth}%; padding: 8px;"></td>`)
    }
    rows.push(`<tr class="columns-row">${rowCards.join('')}</tr>`)
  }

  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="
      background: #f9fafb;
      border-radius: 8px;
      margin: 8px 0;
    ">
      <tr>
        <td style="padding: 20px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
            ${headerHtml}
            ${rows.join('')}
          </table>
        </td>
      </tr>
    </table>
  `
}

/**
 * Generate HTML for an offer card
 */
function generateOfferCardHtml(
  offer: PreviewOffer,
  showPrice: boolean,
  showSpecs: boolean,
  showBanner: boolean,
  showExpiry: boolean,
  ctaText: string,
  priceLabel: string
): string {
  const imageUrl = offer.vehicleImageUrl || offer.imageUrl

  return `
    <div style="
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    ">
      <div style="position: relative; background: #f3f4f6;">
        ${
          imageUrl
            ? `<img src="${imageUrl}" alt="${offer.vehicleName || offer.title}" style="width: 100%; height: 140px; object-fit: cover;" />`
            : `<div style="width: 100%; height: 140px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 32px;">🏷️</div>`
        }
        ${
          offer.bannerText && showBanner
            ? `
          <div style="
            position: absolute;
            top: 8px;
            left: 8px;
            padding: 4px 10px;
            background: #dc2626;
            color: white;
            font-size: 10px;
            font-weight: 700;
            border-radius: 4px;
            text-transform: uppercase;
          ">${offer.bannerText}</div>
        `
            : ''
        }
        ${
          offer.daysRemaining !== undefined && showExpiry
            ? `
          <div style="
            position: absolute;
            bottom: 8px;
            right: 8px;
            padding: 4px 10px;
            background: ${offer.daysRemaining <= 7 ? '#f59e0b' : '#6b7280'};
            color: white;
            font-size: 11px;
            font-weight: 600;
            border-radius: 4px;
          ">${offer.daysRemaining} days left</div>
        `
            : ''
        }
      </div>
      <div style="padding: 12px;">
        ${offer.vehicleName ? `<div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 4px;">${offer.vehicleName}</div>` : ''}
        <div style="font-size: 14px; font-weight: 700; color: #111827; line-height: 1.3;">${offer.title}</div>
        ${offer.description ? `<div style="font-size: 12px; color: #6b7280; margin-top: 6px; line-height: 1.4;">${offer.description}</div>` : ''}
        ${
          offer.specifications && offer.specifications.length > 0 && showSpecs
            ? `
          <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;">
            ${offer.specifications
              .map(
                spec => `
              <span style="
                display: inline-flex;
                align-items: center;
                gap: 4px;
                font-size: 11px;
                color: #6b7280;
                background: #f3f4f6;
                padding: 4px 8px;
                border-radius: 4px;
              ">
                ${spec.iconUrl ? `<img src="${spec.iconUrl}" alt="${spec.text}" style="width: 14px; height: 14px; object-fit: contain;" />` : ''}
                ${spec.text}
              </span>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }
        ${
          offer.formattedPriceRetail && showPrice
            ? `
          <div style="margin-top: 12px;">
            <span style="font-size: 11px; color: #6b7280;">${priceLabel}</span>
            <div style="font-size: 20px; font-weight: 700; color: #111827;">${offer.formattedPriceRetail}</div>
          </div>
        `
            : ''
        }
        <div style="margin-top: 12px;">
          <a href="${offer.ctaUrl}" style="
            display: inline-block;
            padding: 8px 16px;
            font-size: 12px;
            font-weight: 600;
            color: white;
            background: #2563eb;
            border-radius: 4px;
            text-decoration: none;
            text-transform: uppercase;
          ">${ctaText}</a>
        </div>
      </div>
    </div>
  `
}

/**
 * Generate HTML for OEM offers grid
 */
function generateOemOffersHtml(
  offers: PreviewOffer[],
  columns: number = 2,
  title?: string,
  subtitle?: string,
  showPrice: boolean = true,
  showSpecs: boolean = true,
  showBanner: boolean = true,
  showExpiry: boolean = true,
  ctaText: string = 'View Offer',
  priceLabel: string = 'Driveaway from',
  layout: 'cards' | 'featured' | 'list' | 'banner' = 'cards',
  showDescription: boolean = true,
  showVehicleImage: boolean = true
): string {
  if (offers.length === 0) {
    return `
      <div style="padding: 16px 24px;">
        <div style="
          padding: 24px;
          background: #f3f4f6;
          border: 2px dashed #9ca3af;
          border-radius: 8px;
          text-align: center;
        ">
          <div style="font-size: 32px; margin-bottom: 8px;">🏷️</div>
          <div style="font-size: 14px; font-weight: 600; color: #374151;">OEM Offers</div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">No offers available</div>
        </div>
      </div>
    `
  }

  const headerHtml = title
    ? `
    <tr>
      <td colspan="${columns}" style="text-align: center; padding-bottom: 20px;">
        <div style="font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 4px;">${title}</div>
        ${subtitle ? `<div style="font-size: 14px; color: #6b7280;">${subtitle}</div>` : ''}
      </td>
    </tr>
  `
    : ''

  // Default cards layout
  const columnWidth = Math.floor(100 / columns) - 2
  const offerCards = offers.map(
    offer => `
    <td class="stack-column" style="width: ${columnWidth}%; vertical-align: top; padding: 8px;">
      ${generateOfferCardHtml(offer, showPrice, showSpecs, showBanner, showExpiry, ctaText, priceLabel)}
    </td>
  `
  )

  const rows: string[] = []
  for (let i = 0; i < offerCards.length; i += columns) {
    const rowCards = offerCards.slice(i, i + columns)
    while (rowCards.length < columns) {
      rowCards.push(`<td class="stack-column" style="width: ${columnWidth}%; padding: 8px;"></td>`)
    }
    rows.push(`<tr class="columns-row">${rowCards.join('')}</tr>`)
  }

  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="
      background: #f9fafb;
      border-radius: 8px;
      margin: 8px 0;
    ">
      <tr>
        <td style="padding: 20px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse: collapse;">
            ${headerHtml}
            ${rows.join('')}
          </table>
        </td>
      </tr>
    </table>
  `
}

// ---------------------------------------------------------------------------
// Maizzle-specific rendering helpers (uses email-components + shared offer generator)
// ---------------------------------------------------------------------------

// Lazy imports for Maizzle-specific dependencies.
// NOTE: `email-components` (automotive Maizzle vehicle rendering) is not ported
// into the agency email module — the vehicle/Maizzle code path is dead here.
// Stubbed to an empty object so the dynamic import resolves at build time.
let _emailComponents: any = null
let _offerGenerator: typeof import('./offer-html-generator') | null = null

async function getEmailComponents() {
  if (!_emailComponents) {
    _emailComponents = {}
  }
  return _emailComponents
}

async function getOfferGenerator() {
  if (!_offerGenerator) {
    _offerGenerator = await import('./offer-html-generator')
  }
  return _offerGenerator
}

// ---------------------------------------------------------------------------
// Block registration
// ---------------------------------------------------------------------------

registerBlock({
  type: 'Html',

  renderMjml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const contents = (props.contents as string) || ''
    const dynamicBlockConfig = props.dynamicBlockConfig as DynamicBlockConfig | undefined

    // Check if this is a dynamic block with config
    if (dynamicBlockConfig) {
      const configData = dynamicBlockConfig.data || {}
      const columns = (configData.columns as number) || 2
      const title = configData.showHeader ? (configData.title as string) : undefined
      const subtitle = configData.showHeader ? (configData.subtitle as string) : undefined

      // Handle OEM Offers block
      if (dynamicBlockConfig.type === 'oem-offers' && context.dynamicData?.offers) {
        const offers = context.dynamicData.offers.get(dynamicBlockConfig.id) || []
        if (offers.length === 0) {
          return `
              <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
                <mj-column>
                  <mj-text padding="${padding}" align="center" color="#9ca3af">
                    No offers available
                  </mj-text>
                </mj-column>
              </mj-section>`
        }

        const showPrice = configData.showPrice !== false
        const showSpecs = configData.showSpecs !== false
        const showBanner = configData.showBanner !== false
        const showExpiry = configData.showExpiry === true
        const ctaText = (configData.ctaText as string) || 'View Offer'
        const priceLabel = (configData.priceLabel as string) || 'Driveaway from'
        const layout = (configData.layout as 'cards' | 'featured' | 'list' | 'banner') || 'cards'

        return generateOffersSectionMjml(offers, {
          columns,
          title,
          subtitle,
          showPrice,
          showSpecs,
          showBanner,
          showExpiry,
          ctaText,
          priceLabel,
          layout,
          primaryColor: context.primaryColor
        })
      }

      // Handle Vehicle Grid blocks
      if (context.dynamicData?.vehicles) {
        const vehicles = context.dynamicData.vehicles.get(dynamicBlockConfig.id) || []
        if (vehicles.length === 0) {
          return `
              <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
                <mj-column>
                  <mj-text padding="${padding}" align="center" color="#9ca3af">
                    No vehicles available
                  </mj-text>
                </mj-column>
              </mj-section>`
        }

        return generateVehiclesSectionMjml(vehicles, {
          columns,
          title,
          subtitle,
          primaryColor: context.primaryColor
        })
      }
    }

    // Regular HTML content (non-dynamic block)
    return `
        <mj-section padding="0"${bgColor ? ` background-color="${bgColor}"` : ''}>
          <mj-column>
            <mj-raw>
              <div style="padding: ${padding};">
                ${contents}
              </div>
            </mj-raw>
          </mj-column>
        </mj-section>`
  },

  renderHtml(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const contents = (props.contents as string) || ''
    const dynamicBlockConfig = props.dynamicBlockConfig as DynamicBlockConfig | undefined

    if (dynamicBlockConfig) {
      const configData = dynamicBlockConfig.data || {}
      const columns = (configData.columns as number) || 2
      const title = configData.showHeader ? (configData.title as string) : undefined
      const subtitle = configData.showHeader ? (configData.subtitle as string) : undefined

      // Handle OEM Offers block
      if (dynamicBlockConfig.type === 'oem-offers' && context.dynamicData?.offers) {
        const offers = context.dynamicData.offers.get(dynamicBlockConfig.id) || []
        const showPrice = configData.showPrice !== false
        const showSpecs = configData.showSpecs !== false
        const showBanner = configData.showBanner !== false
        const showExpiry = configData.showExpiry === true
        const ctaText = (configData.ctaText as string) || 'View Offer'
        const priceLabel = (configData.priceLabel as string) || 'Driveaway from'
        const layout = (configData.layout as 'cards' | 'featured' | 'list' | 'banner') || 'cards'
        const showDescription = configData.showDescription !== false
        const showVehicleImage = configData.showVehicleImage !== false

        return generateOemOffersHtml(
          offers,
          columns,
          title,
          subtitle,
          showPrice,
          showSpecs,
          showBanner,
          showExpiry,
          ctaText,
          priceLabel,
          layout,
          showDescription,
          showVehicleImage
        )
      }

      // Handle Vehicle Grid blocks
      if (context.dynamicData?.vehicles) {
        const vehicles = context.dynamicData.vehicles.get(dynamicBlockConfig.id) || []

        if (vehicles.length > 0) {
          return generateVehicleGridHtml(vehicles, columns, title, subtitle)
        }

        // If no vehicles found, show informative placeholder
        return `
            <div style="padding: ${padding};">
              <div style="
                padding: 24px;
                background: #F3F4F6;
                border: 2px dashed #9CA3AF;
                border-radius: 8px;
                text-align: center;
              ">
                <div style="font-size: 32px; margin-bottom: 8px;">🚗</div>
                <div style="font-size: 14px; font-weight: 600; color: #374151;">${dynamicBlockConfig.label || 'Vehicle Grid'}</div>
                <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">
                  No vehicles match current filters
                </div>
              </div>
            </div>
          `
      }
    }

    // Regular HTML content (non-dynamic block)
    return `
        <tr${anchorIdAttribute(props)}>
          <td style="padding: ${padding}; ${bgColor ? `background-color: ${bgColor};` : ''}">
            ${contents}
          </td>
        </tr>`
  },

  renderMaizzle(block: FlyhubBlock, context: BlockRenderContext): string {
    const { data } = block
    const props = (data.props || {}) as Record<string, unknown>
    const style = data.style || {}
    const padding = formatPadding(style.padding)
    const bgColor = (style.backgroundColor as string) || ''

    const contents = (props.contents as string) || ''
    const dynamicBlockConfig = props.dynamicBlockConfig as DynamicBlockConfig | undefined

    if (dynamicBlockConfig) {
      const configData = dynamicBlockConfig.data || {}
      const columns = (configData.columns as number) || 2
      const title = configData.showHeader ? (configData.title as string) : undefined
      const subtitle = configData.showHeader ? (configData.subtitle as string) : undefined

      // Handle OEM Offers block — uses shared offer-html-generator for WYSIWYG consistency
      if (dynamicBlockConfig.type === 'oem-offers' && context.dynamicData?.offers) {
        const offers = context.dynamicData.offers.get(dynamicBlockConfig.id) || []
        if (offers.length === 0) {
          return `
              <tr>
                <td style="padding: ${padding}; text-align: center; color: #9ca3af;">No offers available</td>
              </tr>`
        }

        const showPrice = configData.showPrice !== false
        const ctaText = (configData.ctaText as string) || 'View Offer'
        const priceLabel = (configData.priceLabel as string) || 'Driveaway from'
        const layout = (configData.layout as string) || 'cards'
        const showDescription = configData.showDescription !== false
        const showSpecs = configData.showSpecs !== false
        const showExpiry = configData.showExpiry !== false
        const showBanner = configData.showBanner !== false

        // Convert PreviewOffer to OfferData format for the shared generator
        // This matches the original maizzle-renderer behavior (WYSIWYG with preview)
        const offerData: OfferData[] = offers.map(offer => ({
          id: offer.id,
          title: offer.title,
          description: offer.description,
          type: offer.type,
          imageUrl: offer.imageUrl,
          vehicleImageUrl: offer.vehicleImageUrl,
          vehicleName: offer.vehicleName,
          ctaUrl: offer.ctaUrl,
          ctaText: offer.ctaText,
          daysRemaining: offer.daysRemaining,
          formattedPriceRetail: offer.formattedPriceRetail,
          bannerText: offer.bannerText,
          specifications: offer.specifications
        }))

        const html = generateOffersSectionHtml(offerData, {
          layout: layout as 'cards' | 'featured' | 'list' | 'banner',
          columns,
          title,
          subtitle,
          showPrice,
          showDescription,
          showSpecs,
          showExpiry,
          showBanner,
          ctaText,
          priceLabel,
          primaryColor: context.primaryColor
        })
        return html
      }

      // Handle Hero Template block — uses Tailwind classes processed by Maizzle
      if (dynamicBlockConfig.type === 'hero-template') {
        const html = generateHeroTemplateHtml(
          configData as Record<string, unknown> & { title: string },
          context.primaryColor
        )
        return html
      }

      // Handle Vehicle Grid blocks — uses email-components for Maizzle consistency
      if (context.dynamicData?.vehicles) {
        const vehicles = context.dynamicData.vehicles.get(dynamicBlockConfig.id) || []
        if (vehicles.length === 0) {
          return `
              <tr>
                <td style="padding: ${padding}; text-align: center; color: #9ca3af;">No vehicles available</td>
              </tr>`
        }

        return generateMaizzleVehiclesSectionHtml(vehicles, {
          columns,
          title,
          subtitle,
          primaryColor: context.primaryColor
        })
      }
    }

    return `
        <tr>
          <td style="padding: ${padding}; ${bgColor ? `background-color: ${bgColor};` : ''}">
            ${contents}
          </td>
        </tr>`
  },

  defaultProps: {
    contents: ''
  }
})
