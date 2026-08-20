import { describe, expect, it } from 'vitest'
import {
  parseMondayBudgetRows,
  classifyPacingStatus,
  MARKETING_BOARD_COLUMNS
} from '~~/server/utils/mondayBudgetSync'

const C = MARKETING_BOARD_COLUMNS

function item(id: string, name: string, values: Record<string, string | null>) {
  return { id, name, column_values: Object.entries(values).map(([cid, text]) => ({ id: cid, text })) }
}

describe('parseMondayBudgetRows', () => {
  it('extracts campaign id and budget', () => {
    const [row] = parseMondayBudgetRows([
      item('1', 'Frankston Kia AIA', { [C.campaignId]: '120231981366870053', [C.clientBudget]: '500' })
    ])
    expect(row).toMatchObject({ campaignId: '120231981366870053', extraCampaignIds: [], clientBudget: 500 })
  })

  it('takes the first id of a multi-id cell and reports the extras (a join key with two values is not a key)', () => {
    const [row] = parseMondayBudgetRows([
      item('1', 'Double', { [C.campaignId]: '120249979026000134, 120234639288670134', [C.clientBudget]: '699' })
    ])
    expect(row.campaignId).toBe('120249979026000134')
    expect(row.extraCampaignIds).toEqual(['120234639288670134'])
  })

  it('treats missing/zero budget as null and missing id as null', () => {
    const rows = parseMondayBudgetRows([
      item('1', 'No id', { [C.campaignId]: '', [C.clientBudget]: '750' }),
      item('2', 'No budget', { [C.campaignId]: '123', [C.clientBudget]: null }),
      item('3', 'Zero budget', { [C.campaignId]: '456', [C.clientBudget]: '0' })
    ])
    expect(rows[0]!.campaignId).toBeNull()
    expect(rows[1]!).toMatchObject({ campaignId: '123', clientBudget: null })
    expect(rows[2]!.clientBudget).toBeNull()
  })

  it('strips currency formatting from budgets', () => {
    const [row] = parseMondayBudgetRows([item('1', 'X', { [C.campaignId]: '1', [C.clientBudget]: '$1,500' })])
    expect(row.clientBudget).toBe(1500)
  })
})

describe('classifyPacingStatus', () => {
  const midMonth = new Date('2026-08-15T12:00:00Z')

  it('flags No Budget Set when no budget', () => {
    expect(classifyPacingStatus({ budget: null, spendMtd: 100, spendLast24h: 10, now: midMonth }).status)
      .toBe('No Budget Set')
  })

  it('flags No Spend on a budgeted campaign silent for 24h — outranks pace bands', () => {
    const result = classifyPacingStatus({ budget: 1000, spendMtd: 480, spendLast24h: 0, now: midMonth })
    expect(result.status).toBe('No Spend')
    expect(result.pacePct).not.toBeNull()
  })

  it('classifies over / on / under pace', () => {
    expect(classifyPacingStatus({ budget: 1000, spendMtd: 900, spendLast24h: 30, now: midMonth }).status).toBe('Overpacing')
    expect(classifyPacingStatus({ budget: 1000, spendMtd: 480, spendLast24h: 30, now: midMonth }).status).toBe('On Pace')
    expect(classifyPacingStatus({ budget: 1000, spendMtd: 100, spendLast24h: 30, now: midMonth }).status).toBe('Underpacing')
  })
})
