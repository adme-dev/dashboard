import { z } from 'zod'
import { parseContentCondition } from './conditions'
import {
  canConditionBlock,
  conditionPolicyLockIds
} from './conditionProtection'
import { validateEmailDesign, type EmailDesignDocument } from './designContract'

export const ConditionActionSchema = z
  .object({
    documentId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    operationId: z.string().uuid(),
    blockId: z.string().min(1).max(128),
    condition: z.unknown().transform((input, ctx) => {
      if (input === null) return null
      try {
        return parseContentCondition(input)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid condition' })
        return z.NEVER
      }
    })
  })
  .strict()
export type ConditionAction = z.infer<typeof ConditionActionSchema>
/** The only derived difference is a copied typed condition at one eligible node.
 * Source policy, scope, lineage, brand data and immutable dependency pins survive. */
export function applyConditionAction(
  source: EmailDesignDocument,
  action: ConditionAction
): EmailDesignDocument {
  const design = validateEmailDesign(source)
  const linked = [
    ...design.moduleInstances.flatMap(instance => instance.rootBlockIds),
    ...conditionPolicyLockIds(design.policy)
  ]
  if (
    !design.scope.clientId
    || !canConditionBlock(design.blocks, action.blockId, linked)
  )
    throw new Error('PROTECTED_CONDITION_TARGET')
  const block = design.blocks[action.blockId]!
  if (action.condition === null) {
    if (block.data.props) delete block.data.props.visibilityCondition
  } else {
    block.data.props ??= {}
    block.data.props.visibilityCondition = parseContentCondition(action.condition)
  }
  return validateEmailDesign(design)
}
