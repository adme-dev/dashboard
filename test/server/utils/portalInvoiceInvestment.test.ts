import { describe, expect, it } from 'vitest'

import {
  buildInvestmentBreakdown,
  classifyInvestmentLine,
  investmentPeriodBounds,
  parseInvestmentPeriod
} from '../../../server/utils/portalInvoiceInvestment'

describe('portal invoice investment periods', () => {
  it('accepts supported periods and falls back to the financial year', () => {
    expect(parseInvestmentPeriod('last-90-days')).toBe('last-90-days')
    expect(parseInvestmentPeriod('all-time')).toBe('all-time')
    expect(parseInvestmentPeriod('unexpected')).toBe('financial-year')
  })

  it('uses Australian financial-year boundaries', () => {
    expect(investmentPeriodBounds('financial-year', new Date('2026-08-12T00:00:00Z')))
      .toEqual({ start: '2026-07-01', endExclusive: '2027-07-01' })
    expect(investmentPeriodBounds('financial-year', new Date('2026-02-12T00:00:00Z')))
      .toEqual({ start: '2025-07-01', endExclusive: '2026-07-01' })
  })

  it('uses the Melbourne calendar date around the UTC financial-year boundary', () => {
    expect(investmentPeriodBounds('financial-year', new Date('2026-06-30T14:30:00Z')))
      .toEqual({ start: '2026-07-01', endExclusive: '2027-07-01' })
  })

  it('calculates a 90-day inclusive window and leaves all-time unbounded', () => {
    expect(investmentPeriodBounds('last-90-days', new Date('2026-08-12T00:00:00Z')))
      .toEqual({ start: '2026-05-15', endExclusive: '2026-08-13' })
    expect(investmentPeriodBounds('all-time', new Date('2026-08-12T00:00:00Z')))
      .toEqual({ start: null, endExclusive: null })
  })
})

describe('portal invoice investment classification', () => {
  it('classifies direct costs and explicit pass-through sales accounts as media and suppliers', () => {
    expect(classifyInvestmentLine({
      accountType: 'DIRECTCOSTS',
      accountName: 'Direct Costs: Media Other (Reimb Exp)'
    })).toBe('media-and-suppliers')
    expect(classifyInvestmentLine({
      accountType: 'SALES',
      accountName: 'Sales - Media'
    })).toBe('media-and-suppliers')
    expect(classifyInvestmentLine({
      accountType: 'SALES',
      accountName: 'Sales - Printing Income'
    })).toBe('media-and-suppliers')
  })

  it('classifies known sales accounts as agency services', () => {
    expect(classifyInvestmentLine({
      accountType: 'SALES',
      accountName: 'Sales - Digital Advertising'
    })).toBe('agency-services')
  })

  it('keeps missing and ambiguous account metadata unclassified', () => {
    expect(classifyInvestmentLine({ accountType: null, accountName: null }))
      .toBe('unclassified')
    expect(classifyInvestmentLine({ accountType: 'EXPENSE', accountName: 'General expense' }))
      .toBe('unclassified')
  })
})

describe('portal invoice investment reconciliation', () => {
  it('separates media, agency services, GST, and unresolved amounts', () => {
    const result = buildInvestmentBreakdown({
      period: 'financial-year',
      periodStart: '2026-07-01',
      periodEnd: '2027-06-30',
      totalInvoicedCents: 660_000,
      gstCents: 60_000,
      invoiceCount: 2,
      lines: [
        {
          accountType: 'DIRECTCOSTS',
          accountName: 'Direct Costs: Media Other (Reimb Exp)',
          trackingMedia: 'Facebook Ads',
          lineExGstCents: 200_000
        },
        {
          accountType: 'DIRECTCOSTS',
          accountName: 'Direct Costs: Media Other (Reimb Exp)',
          trackingMedia: 'Google Ads',
          lineExGstCents: 100_000
        },
        {
          accountType: 'SALES',
          accountName: 'Sales - Digital Advertising',
          trackingMedia: 'Facebook Ads',
          lineExGstCents: 200_000
        },
        {
          accountType: null,
          accountName: null,
          trackingMedia: null,
          lineExGstCents: 100_000
        }
      ]
    })

    expect(result).toMatchObject({
      totalInvoiced: 6600,
      mediaAndSuppliers: 3000,
      agencyServices: 2000,
      gst: 600,
      unclassifiedAndAdjustments: 1000,
      allocationAvailable: true
    })
    expect(result.channels).toEqual([
      { name: 'Meta', amount: 2000 },
      { name: 'Google', amount: 1000 }
    ])
  })

  it('never assigns header-to-line differences to agency services', () => {
    const result = buildInvestmentBreakdown({
      period: 'all-time',
      periodStart: null,
      periodEnd: null,
      totalInvoicedCents: 110_000,
      gstCents: 10_000,
      invoiceCount: 1,
      lines: [{
        accountType: 'SALES',
        accountName: 'Sales - Production',
        trackingMedia: null,
        lineExGstCents: 80_000
      }]
    })

    expect(result.agencyServices).toBe(800)
    expect(result.unclassifiedAndAdjustments).toBe(200)
  })

  it('reports missing line allocation without hiding the invoice total', () => {
    const result = buildInvestmentBreakdown({
      period: 'financial-year',
      periodStart: '2026-07-01',
      periodEnd: '2027-06-30',
      totalInvoicedCents: 330_000,
      gstCents: 30_000,
      invoiceCount: 1,
      lines: []
    })

    expect(result).toMatchObject({
      totalInvoiced: 3300,
      mediaAndSuppliers: 0,
      agencyServices: 0,
      gst: 300,
      unclassifiedAndAdjustments: 3000,
      allocationAvailable: false
    })
  })
})
