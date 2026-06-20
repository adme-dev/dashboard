import { describe, it, expect, vi } from 'vitest'
import { buildClassifyPrompt, parseClassification, classifyRequest } from '~~/server/utils/ai/controller/classify'
import { planSpecialists, MAX_FANOUT } from '~~/server/utils/ai/controller/route'
import { buildSynthesisPrompt, concatFallback, synthesizeAnswer } from '~~/server/utils/ai/controller/synthesize'
import { delegateToSpecialists } from '~~/server/utils/ai/controller/delegate'

// ---- classify -------------------------------------------------------------
describe('classify', () => {
  it('parses an L2 classification with ≥2 domains', () => {
    expect(parseClassification('{"tier":"L2","domains":["finance","media"],"reason":"both"}'))
      .toEqual({ tier: 'L2', domains: ['finance', 'media'], reason: 'both' })
  })

  it('downgrades a claimed L2 that names <2 valid domains to L1 (supervisor earns its cost)', () => {
    expect(parseClassification('{"tier":"L2","domains":["finance"]}').tier).toBe('L1')
    expect(parseClassification('{"tier":"L2","domains":["finance","bogus"]}').tier).toBe('L1')
  })

  it('drops unknown domains and dedupes', () => {
    const c = parseClassification('{"tier":"L2","domains":["finance","finance","nope","media"]}')
    expect(c.domains).toEqual(['finance', 'media'])
  })

  it('falls back to L1 on malformed / empty output (conservative)', () => {
    expect(parseClassification('not json').tier).toBe('L1')
    expect(parseClassification('').tier).toBe('L1')
  })

  it('classifyRequest fails safe to L1 when the model throws', async () => {
    const out = await classifyRequest('x', { complete: vi.fn().mockRejectedValue(new Error('down')) })
    expect(out.tier).toBe('L1')
  })

  it('prompt names the request and the domain vocabulary', () => {
    const p = buildClassifyPrompt('which clients are over-servicing AND under-pacing')
    expect(p).toContain('over-servicing')
    expect(p).toContain('finance')
    expect(p).toContain('media')
  })
})

// ---- planSpecialists (RBAC ceiling) --------------------------------------
describe('planSpecialists', () => {
  const all = () => true
  it('maps domains to entitled specialist packs', () => {
    expect(planSpecialists(['finance', 'media'], 'owner', { hasPermission: all }).personas)
      .toEqual(['finance', 'media_buyer'])
  })

  it('maps the work domain to the Account pack', () => {
    expect(planSpecialists(['work'], 'owner', { hasPermission: all }).personas).toEqual(['account'])
  })

  it('RBAC CEILING: drops a domain the user is not entitled to (no privilege escalation)', () => {
    // entitled to media only, not finance → a finance+media request yields only media_buyer.
    const onlyMedia = { hasPermission: (_r: string, g: any) => g === 'MEDIA_BUYING' }
    expect(planSpecialists(['finance', 'media'], 'media_buyer', onlyMedia).personas).toEqual(['media_buyer'])
  })

  it('dedupes and caps fan-out at MAX_FANOUT', () => {
    const many = planSpecialists(['finance', 'finance', 'media', 'accounts', 'sales', 'marketing'], 'owner', { hasPermission: all })
    expect(many.personas.length).toBeLessThanOrEqual(MAX_FANOUT)
    expect(new Set(many.personas).size).toBe(many.personas.length)
  })
})

// ---- delegate (fault isolation) ------------------------------------------
describe('delegateToSpecialists', () => {
  it('runs each specialist and collects {persona, text}', async () => {
    const runLoop = vi.fn(async (p: string) => ({ text: `${p} says hi` }))
    const out = await delegateToSpecialists(['finance', 'media_buyer'], { runLoop })
    expect(out).toEqual([{ persona: 'finance', text: 'finance says hi' }, { persona: 'media_buyer', text: 'media_buyer says hi' }])
  })

  it('isolates a failing specialist (empty text, others unaffected)', async () => {
    const runLoop = vi.fn(async (p: string) => { if (p === 'finance') throw new Error('boom'); return { text: 'ok' } })
    const out = await delegateToSpecialists(['finance', 'account'], { runLoop })
    expect(out).toEqual([{ persona: 'finance', text: '' }, { persona: 'account', text: 'ok' }])
  })
})

// ---- synthesize -----------------------------------------------------------
describe('synthesize', () => {
  const results = [{ persona: 'finance', text: 'Acme is over-servicing.' }, { persona: 'media_buyer', text: 'Acme is under-pacing.' }]

  it('merges multiple specialist results via the model', async () => {
    const complete = vi.fn().mockResolvedValue('Acme is both over-servicing and under-pacing.')
    const out = await synthesizeAnswer('q', results, { complete })
    expect(out).toContain('over-servicing')
    expect(complete).toHaveBeenCalledOnce()
  })

  it('returns a single specialist answer verbatim without calling the model', async () => {
    const complete = vi.fn()
    const out = await synthesizeAnswer('q', [{ persona: 'finance', text: 'Just finance.' }], { complete })
    expect(out).toBe('Just finance.')
    expect(complete).not.toHaveBeenCalled()
  })

  it('falls back to a grounded concatenation when the model throws', async () => {
    const out = await synthesizeAnswer('q', results, { complete: vi.fn().mockRejectedValue(new Error('down')) })
    expect(out).toContain('finance')
    expect(out).toContain('media_buyer')
  })

  it('handles no usable findings', async () => {
    expect(concatFallback([{ persona: 'finance', text: '' }])).toMatch(/didn’t find/)
  })

  it('synthesis prompt forbids inventing data', () => {
    expect(buildSynthesisPrompt('q', results)).toContain('do not invent')
  })
})
