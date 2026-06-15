import { describe, it, expect } from 'vitest'
import { buildAnalysisPrompt, parseAnalysisResult, type AiAnalysisInput } from '~~/server/utils/spendAiAnalysis'

const input: AiAnalysisInput = {
  campaignName: 'Spring Leads',
  platform: 'meta',
  issueType: 'overpacing',
  monthlyBudget: 3000,
  mtdSpend: 2200,
  currentDailyBudget: 110,
  deterministicDailyBudget: 80,
  pacingRatio: 1.4,
  projectedMonthEnd: 4100,
  daysRemaining: 10,
  performance: { impressions: 50000, clicks: 900, conversions: 30, ctr: 1.8, cpc: 2.4, costPerConversion: 73 },
}

describe('buildAnalysisPrompt', () => {
  it('includes the campaign name, key metrics and the deterministic baseline', () => {
    const p = buildAnalysisPrompt(input)
    expect(p).toContain('Spring Leads')
    expect(p).toContain('3000')
    expect(p).toContain('2200')
    expect(p).toContain('80')
    expect(p).toMatch(/proposedDailyBudget/)
  })
})

describe('parseAnalysisResult', () => {
  const baseline = { currentDailyBudget: 110 }

  it('parses a well-formed JSON object', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 95, "rationale": "Trim to land on budget", "confidence": "high", "riskFlags": ["learning_phase"]}', baseline)
    expect(r.ok).toBe(true)
    expect(r.proposedDailyBudget).toBe(95)
    expect(r.rationale).toBe('Trim to land on budget')
    expect(r.confidence).toBe('high')
    expect(r.riskFlags).toEqual(['learning_phase'])
  })

  it('strips ```json fences', () => {
    const r = parseAnalysisResult('```json\n{"proposedDailyBudget": 90, "rationale": "x", "confidence": "medium"}\n```', baseline)
    expect(r.ok).toBe(true)
    expect(r.proposedDailyBudget).toBe(90)
  })

  it('extracts the JSON object from surrounding prose', () => {
    const r = parseAnalysisResult('Here is my analysis: {"proposedDailyBudget": 85, "rationale": "y", "confidence": "low"} hope that helps', baseline)
    expect(r.ok).toBe(true)
    expect(r.proposedDailyBudget).toBe(85)
  })

  it('fails safe on empty input', () => {
    expect(parseAnalysisResult('', baseline).ok).toBe(false)
  })

  it('fails safe on unparseable input', () => {
    expect(parseAnalysisResult('the budget should be lower', baseline).ok).toBe(false)
  })

  it('fails safe when proposedDailyBudget is missing', () => {
    expect(parseAnalysisResult('{"rationale": "no number"}', baseline).ok).toBe(false)
  })

  it('fails safe on a negative number', () => {
    expect(parseAnalysisResult('{"proposedDailyBudget": -5, "rationale": "x"}', baseline).ok).toBe(false)
  })

  it('clamps an absurd number to 10x current (defense-in-depth)', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 999999, "rationale": "x", "confidence": "high"}', baseline)
    expect(r.proposedDailyBudget).toBe(1100)
  })

  it('defaults an invalid confidence to medium', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 90, "rationale": "x", "confidence": "banana"}', baseline)
    expect(r.confidence).toBe('medium')
  })

  it('coerces non-array riskFlags to an empty array', () => {
    const r = parseAnalysisResult('{"proposedDailyBudget": 90, "rationale": "x", "riskFlags": "nope"}', baseline)
    expect(r.riskFlags).toEqual([])
  })
})
