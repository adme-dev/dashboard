/**
 * ADME Advertising — GST Classification Engine
 *
 * Automatically classifies GST treatment for every invoice line item.
 * This is the #1 source of BAS errors in agency accounting.
 *
 * CRITICAL RULES (ATO-compliant):
 *   Facebook/Meta/Instagram ads → GST Free Expenses (foreign entity, no AU GST)
 *   Google/YouTube/PMax ads     → GST on Expenses   (Google AU registered since 2016)
 *   Microsoft/LinkedIn/Spotify  → GST on Expenses   (AU-registered digital platforms)
 *   Campaign Monitor (eDM)      → GST on Expenses
 *   All ADME service fees       → GST on Income     (10% GST on all taxable supplies)
 *   Media bookings (radio/TV)   → GST on Income
 *
 * Xero TaxType values:
 *   'GST on Income'       → OUTPUT  (ADME charges GST to client)
 *   'GST Free Expenses'   → BASEXCLUDED (no GST component, excluded from BAS)
 *   'GST on Expenses'     → INPUT  (GST paid, ADME claims input tax credit)
 */

export type XeroTaxType = 'GST on Income' | 'GST Free Expenses' | 'GST on Expenses'

export interface GSTClassification {
  taxType: XeroTaxType
  xeroCode: 'OUTPUT' | 'BASEXCLUDED' | 'INPUT'
  gstRate: number          // 0.10 for GST on Income, 0 for GST Free
  claimable: boolean       // can ADME claim input tax credit?
  reason: string           // human-readable explanation for audit trail
  riskLevel: 'none' | 'low' | 'high'  // BAS audit risk if misclassified
}

// ── Platform detection patterns ─────────────────────────────────────────────

const META_PATTERNS = [
  'facebook', 'meta', 'instagram', 'fb ', 'fb ppc',
  'payable to meta', 'meta ads', 'ig ads',
]

const GOOGLE_PATTERNS = [
  'google', 'youtube', 'pmax', 'performance max',
  'payable to google', 'adwords', 'google ads',
  'sem', 'gdn',
]

const OTHER_GST_PLATFORMS = [
  'microsoft', 'bing', 'linkedin', 'spotify',
  'campaign monitor', 'dispatch fees',
]

// ── Classification function ─────────────────────────────────────────────────

export function classifyGST(
  description: string,
  accountCode: string,
): GSTClassification {
  const lower = (description || '').toLowerCase()

  // ── COA 330 (PPC passthrough) requires platform-specific GST ──
  if (accountCode === '330') {

    // Facebook / Meta / Instagram → GST FREE
    if (META_PATTERNS.some(p => lower.includes(p))) {
      return {
        taxType: 'GST Free Expenses',
        xeroCode: 'BASEXCLUDED',
        gstRate: 0,
        claimable: false,
        reason: 'Meta/Facebook is a foreign entity — ATO treats as GST-free imported digital service',
        riskLevel: 'high',  // misclassifying this creates BAS audit risk
      }
    }

    // Google / YouTube / PMax → GST ON EXPENSES (claimable)
    if (GOOGLE_PATTERNS.some(p => lower.includes(p))) {
      return {
        taxType: 'GST on Expenses',
        xeroCode: 'INPUT',
        gstRate: 0.10,
        claimable: true,
        reason: 'Google AU registered for GST since 2016 — ADME claims input tax credit',
        riskLevel: 'high',
      }
    }

    // Microsoft, LinkedIn, Spotify, Campaign Monitor → GST ON EXPENSES
    if (OTHER_GST_PLATFORMS.some(p => lower.includes(p))) {
      return {
        taxType: 'GST on Expenses',
        xeroCode: 'INPUT',
        gstRate: 0.10,
        claimable: true,
        reason: 'AU-registered digital platform — GST charged, ADME claims input tax credit',
        riskLevel: 'low',
      }
    }

    // COA 330 but can't determine platform → FLAG FOR MANUAL REVIEW
    return {
      taxType: 'GST on Expenses',  // safer default (claiming credit)
      xeroCode: 'INPUT',
      gstRate: 0.10,
      claimable: true,
      reason: '⚠️ NEEDS REVIEW: COA 330 but platform not detected — defaulting to GST on Expenses',
      riskLevel: 'high',
    }
  }

  // ── All other COA codes → GST on Income ──
  // ADME charges 10% GST on all service fees, media bookings, production, etc.
  return {
    taxType: 'GST on Income',
    xeroCode: 'OUTPUT',
    gstRate: 0.10,
    claimable: false,
    reason: `ADME service/media revenue (COA ${accountCode}) — 10% GST charged to client`,
    riskLevel: 'none',
  }
}

// ── BAS reporting helpers ───────────────────────────────────────────────────

export interface BASLineItem {
  description: string
  amountExGST: number
  gst: GSTClassification
}

export interface BASSummary {
  g1_totalSales: number        // all taxable supplies incl GST
  g3_gstFreeSales: number      // Facebook passthrough (BASEXCLUDED)
  g11_nonCapitalPurchases: number // Google ads with INPUT tax
  label1A_gstOnSales: number   // GST collected from clients
  label1B_gstCredits: number   // input tax credits (Google etc.)
  netGST: number               // 1A - 1B
  lineCount: number
  flaggedItems: number         // items needing manual review
}

export function calculateBASSummary(items: BASLineItem[]): BASSummary {
  let g1 = 0, g3 = 0, g11 = 0, flagged = 0

  for (const item of items) {
    const { amountExGST, gst } = item

    switch (gst.xeroCode) {
      case 'OUTPUT':
        g1 += amountExGST * 1.10  // total incl GST
        break
      case 'BASEXCLUDED':
        g3 += amountExGST          // GST-free (Meta passthrough)
        break
      case 'INPUT':
        g11 += amountExGST * 1.10  // purchases incl GST
        break
    }

    if (gst.riskLevel === 'high' && gst.reason.includes('NEEDS REVIEW')) {
      flagged++
    }
  }

  const label1A = g1 / 11            // GST component of sales
  const label1B = g11 / 11           // GST component of claimable purchases

  return {
    g1_totalSales: g1,
    g3_gstFreeSales: g3,
    g11_nonCapitalPurchases: g11,
    label1A_gstOnSales: label1A,
    label1B_gstCredits: label1B,
    netGST: label1A - label1B,
    lineCount: items.length,
    flaggedItems: flagged,
  }
}

// ── Validation: catch common misclassification errors ───────────────────────

export interface ValidationError {
  description: string
  issue: string
  severity: 'error' | 'warning'
}

export function validateGSTClassification(
  description: string,
  assignedTaxType: XeroTaxType,
  accountCode: string,
): ValidationError | null {
  const lower = (description || '').toLowerCase()

  // Error: Facebook assigned GST on Expenses (should be GST Free)
  if (META_PATTERNS.some(p => lower.includes(p)) && assignedTaxType === 'GST on Expenses') {
    return {
      description,
      issue: 'Facebook/Meta should be GST Free Expenses, not GST on Expenses. Meta is a foreign entity.',
      severity: 'error',
    }
  }

  // Error: Google assigned GST Free (should be GST on Expenses)
  if (GOOGLE_PATTERNS.some(p => lower.includes(p)) && assignedTaxType === 'GST Free Expenses') {
    return {
      description,
      issue: 'Google should be GST on Expenses, not GST Free. Google AU charges GST.',
      severity: 'error',
    }
  }

  // Warning: COA 330 but assigned GST on Income
  if (accountCode === '330' && assignedTaxType === 'GST on Income') {
    return {
      description,
      issue: 'COA 330 (passthrough) should not be GST on Income — check platform.',
      severity: 'warning',
    }
  }

  // Warning: service code (205-225) assigned GST Free or GST on Expenses
  if (['205','210','215','216','217','219','220','225'].includes(accountCode) && assignedTaxType !== 'GST on Income') {
    return {
      description,
      issue: `Service revenue (COA ${accountCode}) should be GST on Income.`,
      severity: 'warning',
    }
  }

  return null
}
