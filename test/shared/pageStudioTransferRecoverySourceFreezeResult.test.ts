import { readFileSync } from 'node:fs'
import { beforeEach, expect, it } from 'vitest'
import type { z } from 'zod'
import { TransferRecoverySourceFreezeRequestSchema } from '../../shared/pageStudio/transferRecoverySourceFreeze'
import { collectionDigest } from '../../shared/pageStudio/collectionApi'
import { TransferRecoverySourceFreezeEffectResultSchema, verifyRecoverySourceFreezeResult } from '../../shared/pageStudio/transferRecoverySourceFreezeResult'

// Independent Studio planner output; no live permission or physical effect is
// asserted by this pure cross-repository wire test.
let input: z.infer<typeof TransferRecoverySourceFreezeRequestSchema>
let output: z.infer<typeof TransferRecoverySourceFreezeEffectResultSchema>
beforeEach(() => {
  const fixture = JSON.parse(readFileSync('test/fixtures/transfer-recovery-source-freeze-planned.json', 'utf8'))
  input = TransferRecoverySourceFreezeRequestSchema.parse(fixture.request)
  output = TransferRecoverySourceFreezeEffectResultSchema.parse(fixture.result)
})
it('verifies a real local tenant D1 receipt with a separately synthetic settlement wrapper', async () => {
  const fixture = JSON.parse(readFileSync('test/fixtures/transfer-recovery-source-freeze-physical.json', 'utf8'))
  expect(await verifyRecoverySourceFreezeResult(fixture.request, fixture.result)).toEqual(fixture.result)
})
it('verifies the independently planned full freeze receipt and settled claim', async () => {
  expect(await verifyRecoverySourceFreezeResult(input, output)).toEqual(output)
})
it.each([
  'envelopeDigest', 'claim.effectKey', 'claim.proofDigest', 'claim.resultDigest', 'claim.settlementDigest',
  'claim.identity.invocationId', 'claim.identity.resourceDigest', 'claim.identity.requestDigest',
  'result.receipt.digest', 'result.receipt.associationDigest', 'result.receipt.claimDigest',
  'result.receipt.descriptorDigest', 'result.receipt.schemaDigest', 'result.receipt.sourceReceiptDigest',
  'result.receipt.fence.digest', 'result.receipt.fence.identityDigest',
  'result.receipt.association.sourceSelectionIdentity'
])('rejects changed %s', async (path) => {
  const keys = path.split('.')
  const key = keys.pop()!
  const parent = keys.reduce<Record<string, unknown>>((value, part) => value[part] as Record<string, unknown>, output as unknown as Record<string, unknown>)
  parent[key] = key === 'invocationId' ? '00000000-0000-4000-8000-000000000999' : '0'.repeat(64)
  await expect(verifyRecoverySourceFreezeResult(input, output)).rejects.toThrow()
})
it.each(['dispatch', 'inspect', 'settle'])('does not accept a %s callback as an execution request', async (verb) => {
  const changed = { ...input, command: { ...input.command, verb, claim: output.result.receipt.claim,
    ...(verb === 'settle' ? { state: 'completed', resultDigest: output.claim.resultDigest } : {}) } }
  output.envelopeDigest = await collectionDigest(changed)
  await expect(verifyRecoverySourceFreezeResult(changed, output)).rejects.toThrow()
})
it('rejects a self-consistently rehashed foreign fence', async () => {
  const receipt = output.result.receipt
  receipt.fence.request.transferId = '00000000-0000-4000-8000-000000000999'
  receipt.fence.identityDigest = await collectionDigest(receipt.fence.request)
  const { digest: _fenceDigest, ...fence } = receipt.fence
  receipt.fence.digest = await collectionDigest(fence)
  const { digest: _receiptDigest, ...body } = receipt
  receipt.digest = await collectionDigest(body)
  output.claim.resultDigest = await collectionDigest(output.result)
  output.claim.settlementDigest = await collectionDigest({ purpose: 'settle', claim: receipt.claim,
    resultDigest: output.claim.resultDigest, state: 'completed' })
  await expect(verifyRecoverySourceFreezeResult(input, output)).rejects.toThrow()
})
it.each(['purpose', 'extra', 'action', 'state', 'source'])('rejects wrong shape or linked input: %s', async (kind) => {
  const changed = kind === 'source' ? { ...input, sourceReceiptDigest: '0'.repeat(64) } : input
  const candidate: Record<string, unknown> = { ...output }
  if (kind === 'purpose') candidate.purpose = 'recovery-source-freeze'
  if (kind === 'extra') candidate.acquired = true
  if (kind === 'action') candidate.result = { ...output.result, action: 'install' }
  if (kind === 'state') candidate.claim = { ...output.claim, state: 'dispatching' }
  await expect(verifyRecoverySourceFreezeResult(changed, candidate)).rejects.toThrow()
})
