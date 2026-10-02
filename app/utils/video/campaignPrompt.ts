/** Free prompt assembly. Never truncate reviewed instructions to fit a model. */
export function prepareCampaignVideoPrompt(input: { brief: string, brandName?: string, templatePrompt?: string, guideRules?: string }): { prompt: string | null, error: string | null } {
  if (!input.brief.trim()) return { prompt: null, error: 'Add a campaign brief first.' }
  const prompt = [
    input.brandName?.trim() ? `Brand: ${input.brandName.trim()}` : '',
    input.templatePrompt?.trim(),
    `Campaign direction: ${input.brief.trim()}`,
    input.guideRules?.trim() ? `Reviewed brand rules: ${input.guideRules.trim()}` : '',
    'Preserve approved artwork, logos and lettering. Do not invent claims, prices or offers.'
  ].filter(Boolean).join('\n\n')
  if (prompt.length > 2000) return { prompt: null, error: `This prompt has ${prompt.length.toLocaleString('en-US')} characters. Shorten the brief, preset or selected rules to fit the 2,000-character limit.` }
  return { prompt, error: null }
}
