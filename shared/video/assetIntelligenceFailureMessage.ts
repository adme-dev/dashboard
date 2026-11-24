// What the editor reads when an asset intelligence job fails.
//
// Model providers report some failures as codes that mean nothing to an editor.
// Workers AI answers "3030: Your output has been flagged..." when its safety filter
// blocks a result; it is not a fault and running the same edit again will not help.
//
// Used by the queue worker (when it stores the failure) and by the Pages app (when it
// lists jobs), so jobs stored before the worker was redeployed read the same way.

export const SAFETY_FILTER_BLOCKED_MESSAGE = 'The AI safety filter blocked this edit. Try a different area or instruction.'

/** True when a provider error says its safety filter blocked the input or the result. */
export function isSafetyFilterBlock(message: string | null | undefined): boolean {
  if (!message) return false
  return /(^|\D)3030(\D|$)/.test(message) || /\b(has|have) been flagged\b/i.test(message)
}

/** The failure message to show for a job. Anything not recognised is returned unchanged. */
export function assetIntelligenceFailureMessage(message: string): string
export function assetIntelligenceFailureMessage(message: string | null | undefined): string | null
export function assetIntelligenceFailureMessage(message: string | null | undefined): string | null {
  if (message === null || message === undefined) return null
  return isSafetyFilterBlock(message) ? SAFETY_FILTER_BLOCKED_MESSAGE : message
}
