import { describe, expect, it } from 'vitest'
import { CORE_TOOLS, PROVIDER_TOOL_CAP, findMoreTools, recentUserText, routeTools, scoreTools, toolNamesFromMessages } from '~~/server/utils/ai/toolRouting'

const t = (name: string, description = '') => ({ name, description })
const catalogue = [
  t('get_department_budget_health', 'Budget pacing and overspend across clients'),
  t('get_department_work_coverage', 'Open work per assignee, overdue tasks and capacity'),
  t('google_ads_plan_add_negative_keywords', 'Prepare a plan to add negative keywords to a Google Ads campaign'),
  t('get_search_terms', 'Search terms report for a client'),
  t('marketing_list_google_ads_reviews', 'Google Ads plans waiting for review'),
  t('create_social_post_draft', 'Create a draft social post'),
  t('get_department_lead_quality', 'Lead volume and quality'),
  t('get_client_overview', 'Look up a client by name'),
  t('search_knowledge', 'Search the knowledge base'),
  ...Array.from({ length: 200 }, (_, i) => t(`filler_tool_${i}`, 'Unrelated capability'))
]

describe('per-turn tool routing', () => {
  it('ranks the obvious tool first for typical marketing questions', () => {
    const top = (q: string) => [...scoreTools(catalogue, q).entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    expect(top('Which clients are over-pacing their budget?')).toBe('get_department_budget_health')
    expect(top('Who on my team is overloaded and what is overdue?')).toBe('get_department_work_coverage')
    expect(top('Add negative keywords for wasted search terms')).toBe('google_ads_plan_add_negative_keywords')
    expect(top('What Google Ads changes are waiting for my approval?')).toBe('marketing_list_google_ads_reviews')
  })

  it('always stays within the limit and the provider cap, with core tools and prior tools first', () => {
    const routed = routeTools({ tools: catalogue, text: 'budget pacing', usedToolNames: ['create_social_post_draft'], limit: 5 })
    const core = CORE_TOOLS.filter(name => catalogue.some(tool => tool.name === name))
    expect(routed).toEqual([...core, 'create_social_post_draft', 'get_department_budget_health'])
    expect(routeTools({ tools: catalogue, text: 'budget pacing work overdue negative keywords leads', limit: 5 })).toHaveLength(5)
    expect(routeTools({ tools: catalogue, text: 'x', limit: 999 }).length).toBeLessThan(PROVIDER_TOOL_CAP)
    expect(routeTools({ tools: catalogue, text: 'anything', usedToolNames: ['not_in_catalogue'] })).not.toContain('not_in_catalogue')
  })

  it('find_more_tools returns matches that are not already active', () => {
    const found = findMoreTools(catalogue, 'social post draft', new Set(['get_client_overview']))
    expect(found[0]?.name).toBe('create_social_post_draft')
    expect(findMoreTools(catalogue, 'social post draft', new Set(['create_social_post_draft'])).map(f => f.name)).not.toContain('create_social_post_draft')
  })

  it('reads recent user text and previously used tools from AI SDK messages', () => {
    const messages = [
      { role: 'user', content: 'How is Northern MG pacing?' },
      { role: 'assistant', content: [{ type: 'tool-call', toolName: 'get_department_budget_health' }] },
      { role: 'user', content: [{ type: 'text', text: 'Fix it' }] }
    ]
    expect(recentUserText(messages)).toContain('Fix it')
    expect(recentUserText(messages)).toContain('Northern MG')
    expect(toolNamesFromMessages(messages)).toEqual(['get_department_budget_health'])
  })
})

describe('portfolio routing vocabulary', () => {
  it('routes cross-account QA questions to the portfolio review tool', () => {
    const tools = [
      { name: 'google_ads_review_portfolio', description: 'Read-only QA across every Google Ads account: recommendations, conversion-action problems and wasted search terms.' },
      { name: 'google_ads_list_search_terms', description: 'Read live Google search terms for one account, wastedOnly returns spend with no conversions.' },
      { name: 'get_department_daily_brief', description: 'Daily exceptions across clients' },
      ...Array.from({ length: 80 }, (_, i) => ({ name: `filler_${i}`, description: 'Unrelated capability' }))
    ]
    const top = (q: string) => [...scoreTools(tools, q).entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    expect(top('QA all our dealer Google Ads accounts')).toBe('google_ads_review_portfolio')
    expect(top('Check recommendations and conversion actions across every account')).toBe('google_ads_review_portfolio')
    expect(top('Which search terms are wasting money?')).toBe('google_ads_list_search_terms')
  })
})
