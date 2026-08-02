import { describe, expect, it } from 'vitest'

import {
  bankSummaryAccountNames,
  creditCardAccountIdsFrom,
  extractBankBalances,
  extractCurrentCash,
  partitionAccountsForTrends
} from '../../../server/utils/xeroDataFetcher'

/**
 * Fixture mirrors a real Xero BankSummary payload pulled from the live
 * ADME Advertising tenant on 2026-08-02, including the trailing SummaryRow
 * that used to get summed on top of the account rows (2x double-count).
 */
const NAB = '591278b9-5ba4-4a10-baf5-7b9f83618340'
const AMEX = 'efe62742-91cf-46cb-adec-636b9a69b230'
const VISA = '61dcbf59-26d3-4183-b1d6-c5df410d2beb'
const TAX = 'fe54835a-fa2b-4f4b-a8f0-a19da1bea2bf'

function accountRow(name: string, accountId: string, closing: string) {
  return {
    RowType: 'Row',
    Cells: [
      { Value: name, Attributes: [{ Value: accountId, Id: 'accountID' }] },
      { Value: closing },
      { Value: '0.00' },
      { Value: '0.00' },
      { Value: closing }
    ]
  }
}

const REPORT = {
  Reports: [
    {
      ReportName: 'Bank Summary',
      Rows: [
        {
          RowType: 'Header',
          Cells: [
            { Value: 'Bank Accounts' },
            { Value: 'Opening Balance' },
            { Value: 'Cash Received' },
            { Value: 'Cash Spent' },
            { Value: 'Closing Balance' }
          ]
        },
        {
          RowType: 'Section',
          Rows: [
            accountRow('ADME Advertising NAB', NAB, '5468.75'),
            accountRow('AMEX Credit Card-C Padalini', AMEX, '-141125.16'),
            accountRow('Latitude Gem Visa', VISA, '4.38'),
            accountRow('NAB Tax Acc 2349', TAX, '1327.06'),
            {
              RowType: 'SummaryRow',
              Cells: [
                { Value: 'Total' },
                { Value: '-134324.97' },
                { Value: '0.00' },
                { Value: '0.00' },
                { Value: '-134324.97' }
              ]
            }
          ]
        }
      ]
    }
  ]
}

/** xero-node lowercases keys; the parser must handle both shapes. */
const REPORT_LOWERCASE = {
  reports: [
    {
      rows: [
        {
          rowType: 'Section',
          rows: [
            {
              rowType: 'Row',
              cells: [
                { value: 'ADME Advertising NAB', attributes: [{ value: NAB, id: 'accountID' }] },
                { value: '5468.75' }
              ]
            },
            {
              rowType: 'SummaryRow',
              cells: [{ value: 'Total' }, { value: '5468.75' }]
            }
          ]
        }
      ]
    }
  ]
}

const CREDIT_CARDS = new Set([AMEX, VISA])

describe('extractBankBalances', () => {
  it('ignores the SummaryRow instead of summing it on top of the accounts', () => {
    // Regression: the old flattenRows-based sum returned -268649.94 (exactly 2x).
    expect(extractBankBalances(REPORT).net).toBeCloseTo(-134324.97, 2)
  })

  it('splits true cash from credit-card balances', () => {
    const b = extractBankBalances(REPORT, CREDIT_CARDS)
    expect(b.cash).toBeCloseTo(6795.81, 2) // NAB 5468.75 + Tax 1327.06
    expect(b.creditCard).toBeCloseTo(-141120.78, 2) // AMEX -141125.16 + Visa 4.38
    expect(b.net).toBeCloseTo(-134324.97, 2)
  })

  it('treats every account as cash when no credit-card ids are supplied', () => {
    const b = extractBankBalances(REPORT)
    expect(b.cash).toBeCloseTo(-134324.97, 2)
    expect(b.creditCard).toBe(0)
  })

  it('returns per-account detail flagged by type', () => {
    const b = extractBankBalances(REPORT, CREDIT_CARDS)
    expect(b.accounts).toHaveLength(4)
    expect(b.accounts.find(a => a.accountId === AMEX)).toMatchObject({
      name: 'AMEX Credit Card-C Padalini',
      balance: -141125.16,
      isCreditCard: true
    })
    expect(b.accounts.find(a => a.accountId === NAB)?.isCreditCard).toBe(false)
  })

  it('parses the lowercase xero-node shape', () => {
    const b = extractBankBalances(REPORT_LOWERCASE)
    expect(b.net).toBeCloseTo(5468.75, 2)
    expect(b.accounts).toHaveLength(1)
    expect(b.accounts[0]?.accountId).toBe(NAB)
  })

  it('is safe on empty or malformed payloads', () => {
    for (const bad of [null, undefined, {}, { Reports: [] }, { Reports: [{ Rows: [] }] }]) {
      const b = extractBankBalances(bad)
      expect(b.net).toBe(0)
      expect(b.cash).toBe(0)
      expect(b.accounts).toEqual([])
    }
  })
})

describe('extractCurrentCash', () => {
  it('no longer double-counts the total row', () => {
    expect(extractCurrentCash(REPORT)).toBeCloseTo(-134324.97, 2)
  })

  it('returns liquid cash only when credit-card ids are supplied', () => {
    expect(extractCurrentCash(REPORT, CREDIT_CARDS)).toBeCloseTo(6795.81, 2)
  })
})

describe('bankSummaryAccountNames', () => {
  it('lists the account rows and never the Total summary row', () => {
    const names = bankSummaryAccountNames(REPORT)
    expect(names.size).toBe(4)
    expect(names.has('ADME Advertising NAB')).toBe(true)
    expect(names.has('Total')).toBe(false)
  })

  it('is empty for an unparseable payload', () => {
    expect(bankSummaryAccountNames(null).size).toBe(0)
  })
})

describe('partitionAccountsForTrends', () => {
  const accounts = [
    { name: 'ADME Advertising NAB' },
    { name: 'CLOSED WBC Term Deposit-Rent' },
    { name: 'NAB Tax Acc 2349' },
    { name: 'GE Creditline' }
  ]

  it('keeps only accounts the bank summary lists', () => {
    const { withActivity, skipped } = partitionAccountsForTrends(accounts, bankSummaryAccountNames(REPORT))
    expect(withActivity.map(a => a.name)).toEqual(['ADME Advertising NAB', 'NAB Tax Acc 2349'])
    expect(skipped.map(a => a.name)).toEqual(['CLOSED WBC Term Deposit-Rent', 'GE Creditline'])
  })

  it('tolerates surrounding whitespace on account names', () => {
    const { withActivity } = partitionAccountsForTrends(
      [{ name: '  ADME Advertising NAB  ' }],
      bankSummaryAccountNames(REPORT)
    )
    expect(withActivity).toHaveLength(1)
  })

  it('fails safe to every account when the summary yielded no names', () => {
    // Otherwise an unparseable summary would silently flatten every trend.
    const { withActivity, skipped } = partitionAccountsForTrends(accounts, new Set<string>())
    expect(withActivity).toHaveLength(4)
    expect(skipped).toHaveLength(0)
  })

  it('handles missing/null names without throwing', () => {
    const { skipped } = partitionAccountsForTrends(
      [{ name: null }, {}] as any,
      bankSummaryAccountNames(REPORT)
    )
    expect(skipped).toHaveLength(2)
  })
})

describe('creditCardAccountIdsFrom', () => {
  it('picks out CREDITCARD accounts from a Xero Accounts payload', () => {
    const ids = creditCardAccountIdsFrom({
      Accounts: [
        { AccountID: NAB, Name: 'ADME Advertising NAB', Type: 'BANK', BankAccountType: 'BANK' },
        { AccountID: AMEX, Name: 'AMEX', Type: 'BANK', BankAccountType: 'CREDITCARD' }
      ]
    })
    expect(ids.has(AMEX)).toBe(true)
    expect(ids.has(NAB)).toBe(false)
  })

  it('handles the lowercase shape and missing payloads', () => {
    const ids = creditCardAccountIdsFrom({
      accounts: [{ accountID: VISA, bankAccountType: 'CREDITCARD' }]
    })
    expect(ids.has(VISA)).toBe(true)
    expect(creditCardAccountIdsFrom(null).size).toBe(0)
  })
})
