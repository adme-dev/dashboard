/** Conservative screening for creative mode, supplemented by explicit approved-block locks.
 * This is not a semantic fact checker: unfamiliar claims still require human review.
 */
export function isProtectedBannerCopy(text: string): boolean {
  return /\d|\[[^\]]+\]|\{\{[^}]+\}\}|\$\{[^}]+\}|[%$£€]|\b(?:terms|conditions|eligible|eligibility|excludes?|fleet|voucher|LMCT|private buyers|government|rental|redeemable|free|discount|guarantee|warranty|dollars?|hundred|thousand|million|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Highway|Street|Road|Avenue)\b/i.test(text)
}
export function isBannerCopyLayerProtected(layer: { text?: string, copyLocked?: boolean, feedBindings?: Array<{ property: string }> }): boolean {
  return !!layer.copyLocked || !!layer.feedBindings?.some(binding => binding.property === 'text') || isProtectedBannerCopy(layer.text || '')
}
export function isSafeBannerRewrite(source: string, proposed: string, locked = false): boolean {
  if (!proposed.trim() || proposed.length > 4000) return false
  if (locked || isProtectedBannerCopy(source)) return source === proposed
  // Do not introduce detected claims or change named offer brands into a creative heading.
  if (isProtectedBannerCopy(proposed)) return false
  const brands = (text: string) => [...text.matchAll(/\b(?:Subaru|XPENG|Geely|DEEPAL|Foton)\b/gi)].map(m => m[0].toLowerCase()).sort().join('|')
  return brands(source) === brands(proposed)
}
