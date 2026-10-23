import { describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import golden from '../fixtures/transfer-recovery-public-contracts.json'
import * as review from '~~/shared/pageStudio/transferRecoveryReviewPublic'
import * as admission from '~~/shared/pageStudio/transferRecoveryAdmissionPublic'
import * as coordinator from '~~/shared/pageStudio/transferRecoveryCoordinatorPublic'
import * as privateReview from '~~/shared/pageStudio/transferRecoveryReview'
import * as privateAdmission from '~~/shared/pageStudio/transferRecoveryAdmission'
import * as privateCoordinator from '~~/shared/pageStudio/transferRecoveryCoordinator'

// Public Pages contracts must not initialize private cross-store proof schemas.
// This exercises the emitted import graph rather than checking import spelling.
describe('recovery public contract dependency boundary', () => {
  it.each([
    'transferRecoveryAdmissionControlTransport',
    'transferRecoveryReviewControl',
    'transferRecoveryCoordinatorTransport'
  ])('%s does not retain private recovery evidence modules', async (entry) => {
    const result = await build({
      entryPoints: [resolve('shared/pageStudio', `${entry}.ts`)],
      bundle: true,
      write: false,
      metafile: true,
      packages: 'external',
      platform: 'neutral',
      format: 'esm'
    })
    const privateModules = Object.keys(result.metafile!.inputs).filter(path =>
      /\/transferRecovery(?:Admission|Review|Coordinator|Inspection|Inventory|Reconciliation)\.ts$/.test(path))
    expect(privateModules).toEqual([])
  })
})

const publicModules: Record<string, Record<string, unknown>> = { review, admission, coordinator }
const privateModules: Record<string, Record<string, unknown>> = {
  review: privateReview, admission: privateAdmission, coordinator: privateCoordinator
}

function variants(valid: unknown) {
  const cases: { label: string, input: unknown }[] = []
  const add = (label: string, input: unknown) => cases.push({ label, input })
  add('valid', valid)
  for (const value of [null, [], false, {}, '', 0]) add(`invalid type ${JSON.stringify(value)}`, value)
  if (valid && typeof valid === 'object') {
    add('unknown root field', { ...valid, untrusted: true })
    const walk = (value: Record<string, unknown>, path: string[] = []) => {
      for (const key of Object.keys(value)) {
        const at = [...path, key]
        const mutate = (replacement: unknown, remove = false) => {
          const copy = structuredClone(valid) as Record<string, unknown>
          let parent = copy
          for (const part of path) parent = parent[part] as Record<string, unknown>
          if (remove) Reflect.deleteProperty(parent, key)
          else parent[key] = replacement
          return copy
        }
        add(`missing ${at.join('.')}`, mutate(null, true))
        add(`null ${at.join('.')}`, mutate(null))
        if (typeof value[key] === 'number')
          for (const n of [-1, 0, 1.5, 2147483647]) add(`numeric ${at.join('.')} ${n}`, mutate(n))
        if (typeof value[key] === 'string') add(`invalid ${at.join('.')}`, mutate('invalid'))
        if (value[key] && typeof value[key] === 'object') {
          add(`extra ${at.join('.')}`, mutate({ ...value[key], untrusted: true }))
          walk(value[key] as Record<string, unknown>, at)
        }
      }
    }
    walk(valid as Record<string, unknown>)
  } else {
    for (const value of [
      '2026-10-23T12:00:00Z', '2026-10-23T12:00:00.000001Z',
      '2026-10-23T14:00:00.000+02:00', '2026-02-30T12:00:00.000Z'
    ]) add(`precision/instant ${value}`, value)
  }
  return cases
}
function outcome(schema: z.ZodType, value: unknown) {
  try {
    const result = schema.safeParse(value)
    return result.success ? { success: true, data: result.data } : { success: false, issues: result.error.issues }
  } catch (error) {
    // Preserve the existing invalid-date refinement behavior; this is a move only.
    if (!(error instanceof Error)) throw error
    return { throws: { name: error.name, message: error.message } }
  }
}

// Golden outcomes were captured from integration 3cda1aea before moving any schema.
// Hashes cover full parsed output or full error issues, not just acceptance booleans.
for (const fixture of golden.schemas) {
  describe(fixture.name, () => {
    const schema = publicModules[fixture.module]![fixture.name] as z.ZodType
    it('re-exports the same schema instance through the private compatibility module', () => {
      expect(privateModules[fixture.module]![fixture.name]).toBe(schema)
    })
    const cases = variants(fixture.valid)
    it('covers exactly the original golden case set', () => {
      expect(cases.map(c => c.label).sort()).toEqual(Object.keys(fixture.expected).sort())
    })
    it.each(cases)('retains original parsing: $label', ({ label, input }) => {
      const actual = outcome(schema, input)
      const digest = createHash('sha256').update(JSON.stringify(actual)).digest('hex')
      expect(digest, JSON.stringify(actual)).toBe((fixture.expected as Record<string, string | undefined>)[label])
    })
  })
}
