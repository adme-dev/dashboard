export type InvestmentPeriod = 'financial-year' | 'last-90-days' | 'all-time'
export type InvestmentCategory = 'media-and-suppliers' | 'agency-services' | 'unclassified'

export interface InvestmentPeriodBounds {
  start: string | null
  endExclusive: string | null
}

export interface InvestmentLine {
  accountType: string | null
  accountName: string | null
  trackingMedia: string | null
  lineExGstCents: unknown
}

export interface PortalInvestmentBreakdown {
  period: InvestmentPeriod
  periodStart: string | null
  periodEnd: string | null
  totalInvoiced: number
  mediaAndSuppliers: number
  agencyServices: number
  gst: number
  unclassifiedAndAdjustments: number
  allocationAvailable: boolean
  channels: Array<{ name: string, amount: number }>
}

const SUPPORTED_PERIODS: InvestmentPeriod[] = [
  'financial-year',
  'last-90-days',
  'all-time'
]

const AGENCY_ACCOUNT_TYPES = new Set(['SALES', 'REVENUE', 'OTHERINCOME'])
const PASS_THROUGH_SALES_ACCOUNTS = /^Sales - (?:Media|Printing Income)$/i

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function melbourneIsoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function numericCents(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function dollars(cents: number): number {
  return Math.round(cents) / 100
}

function normaliseMediaChannel(value: string | null): string {
  const channel = value?.trim().toLowerCase() ?? ''

  if (/facebook|meta/.test(channel)) return 'Meta'
  if (/youtube/.test(channel)) return 'YouTube'
  if (/google/.test(channel)) return 'Google'
  if (/carsales/.test(channel)) return 'Carsales'
  if (/shopping|display/.test(channel)) return 'Displays'
  if (/print/.test(channel)) return 'Printing'
  if (/sms/.test(channel)) return 'SMS'
  return 'Other suppliers'
}

export function parseInvestmentPeriod(value: unknown): InvestmentPeriod {
  return SUPPORTED_PERIODS.includes(value as InvestmentPeriod)
    ? value as InvestmentPeriod
    : 'financial-year'
}

export function investmentPeriodBounds(
  period: InvestmentPeriod,
  today = new Date()
): InvestmentPeriodBounds {
  if (period === 'all-time') {
    return { start: null, endExclusive: null }
  }

  const current = new Date(`${melbourneIsoDate(today)}T00:00:00Z`)

  if (period === 'last-90-days') {
    const start = new Date(current)
    start.setUTCDate(start.getUTCDate() - 89)
    const endExclusive = new Date(current)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    return { start: isoDate(start), endExclusive: isoDate(endExclusive) }
  }

  const year = current.getUTCFullYear()
  const financialYearStart = current.getUTCMonth() >= 6 ? year : year - 1
  return {
    start: `${financialYearStart}-07-01`,
    endExclusive: `${financialYearStart + 1}-07-01`
  }
}

export function classifyInvestmentLine(line: {
  accountType?: unknown
  accountName?: unknown
}): InvestmentCategory {
  const accountType = String(line.accountType ?? '').trim().toUpperCase()
  const accountName = String(line.accountName ?? '').trim()

  if (accountType === 'DIRECTCOSTS') return 'media-and-suppliers'
  if (PASS_THROUGH_SALES_ACCOUNTS.test(accountName)) return 'media-and-suppliers'
  if (AGENCY_ACCOUNT_TYPES.has(accountType)) return 'agency-services'
  return 'unclassified'
}

export function buildInvestmentBreakdown(input: {
  period: InvestmentPeriod
  periodStart: string | null
  periodEnd: string | null
  totalInvoicedCents: unknown
  gstCents: unknown
  invoiceCount: unknown
  lines: InvestmentLine[]
}): PortalInvestmentBreakdown {
  const totalInvoicedCents = numericCents(input.totalInvoicedCents)
  const gstCents = numericCents(input.gstCents)
  let mediaCents = 0
  let agencyCents = 0
  const channels = new Map<string, number>()

  for (const line of input.lines) {
    const lineCents = numericCents(line.lineExGstCents)
    const category = classifyInvestmentLine(line)

    if (category === 'media-and-suppliers') {
      mediaCents += lineCents
      const channel = normaliseMediaChannel(line.trackingMedia)
      channels.set(channel, (channels.get(channel) ?? 0) + lineCents)
    } else if (category === 'agency-services') {
      agencyCents += lineCents
    }
  }

  const unclassifiedCents = totalInvoicedCents - gstCents - mediaCents - agencyCents

  return {
    period: input.period,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totalInvoiced: dollars(totalInvoicedCents),
    mediaAndSuppliers: dollars(mediaCents),
    agencyServices: dollars(agencyCents),
    gst: dollars(gstCents),
    unclassifiedAndAdjustments: dollars(unclassifiedCents),
    allocationAvailable: Number(input.invoiceCount ?? 0) > 0 && input.lines.length > 0,
    channels: [...channels.entries()]
      .map(([name, amount]) => ({ name, amount: dollars(amount) }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
  }
}
