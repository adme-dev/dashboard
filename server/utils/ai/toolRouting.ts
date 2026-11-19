/**
 * Per-turn tool routing for the native chat.
 *
 * Providers cap tools per request (Groq: 128) and every tool definition is resent on each step,
 * so large staff catalogues (marketing management: 200+ tools) cannot be sent whole. Each turn
 * we send a relevant subset: an always-on core, tools already used in the conversation, and the
 * best lexical matches for the recent user text (with marketing synonyms). The model can widen
 * the set mid-turn with `find_more_tools`. Routing only narrows what is advertised; every tool's
 * own permission, confirmation and review checks still run when it is called.
 */

export const TOOL_ROUTING_THRESHOLD = 60
export const ROUTED_TOOL_LIMIT = 40
/** Hard provider ceiling (Groq). Leave one slot for find_more_tools. */
export const PROVIDER_TOOL_CAP = 128
export const FIND_MORE_TOOLS = 'find_more_tools'

/** Useful on almost every turn when present in the actor's catalogue. */
export const CORE_TOOLS: readonly string[] = [
  'get_agent_clients', 'get_client_overview', 'search_knowledge', 'remember', 'create_task',
  'get_department_client_inventory', 'get_department_daily_brief', 'read_official_documentation'
]

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'what', 'which', 'who', 'how', 'are', 'is', 'my', 'our', 'me', 'this',
  'that', 'there', 'their', 'from', 'into', 'show', 'give', 'tell', 'can', 'you', 'please', 'any', 'all', 'some', 'have', 'has',
  'was', 'were', 'will', 'would', 'should', 'could', 'about', 'last', 'next', 'week', 'month', 'today', 'need', 'needs', 'get',
  'list', 'use', 'using', 'one', 'not', 'but', 'its', 'it', 'a', 'an', 'of', 'to', 'in', 'on', 'or', 'be', 'do', 'does', 'did'])

/** Question vocabulary → words that appear in tool names/descriptions. */
const SYNONYMS: Record<string, string[]> = {
  pacing: ['budget', 'pacing', 'spend', 'adspend', 'allocation'],
  pace: ['budget', 'pacing', 'spend'],
  overspend: ['budget', 'pacing', 'spend'],
  underspend: ['budget', 'pacing', 'spend'],
  spend: ['budget', 'pacing', 'spend', 'adspend'],
  budget: ['budget', 'budgets', 'pacing', 'allocation', 'allocations'],
  google: ['google', 'ads', 'campaign', 'campaigns'],
  adwords: ['google', 'ads'],
  ppc: ['google', 'ads', 'campaign', 'keyword'],
  search: ['search', 'terms', 'keyword', 'keywords'],
  keyword: ['keyword', 'keywords', 'negative', 'search'],
  keywords: ['keyword', 'keywords', 'negative', 'search'],
  negative: ['negative', 'keywords', 'shared'],
  negatives: ['negative', 'keywords', 'shared'],
  pmax: ['pmax', 'performance', 'asset', 'group'],
  recommendation: ['recommendation', 'recommendations'],
  recommendations: ['recommendation', 'recommendations'],
  meta: ['meta', 'facebook', 'instagram', 'catalog'],
  facebook: ['meta', 'facebook', 'social'],
  instagram: ['instagram', 'social'],
  linkedin: ['linkedin', 'social'],
  team: ['work', 'task', 'tasks', 'coverage', 'capacity', 'board', 'assign'],
  overloaded: ['work', 'tasks', 'coverage', 'capacity'],
  workload: ['work', 'tasks', 'coverage', 'capacity'],
  overdue: ['work', 'tasks', 'coverage', 'due'],
  capacity: ['capacity', 'work', 'coverage'],
  task: ['task', 'tasks', 'board', 'item'],
  tasks: ['task', 'tasks', 'board', 'item'],
  lead: ['lead', 'leads', 'routing', 'quality'],
  leads: ['lead', 'leads', 'routing', 'quality'],
  enquiry: ['lead', 'leads'],
  enquiries: ['lead', 'leads'],
  email: ['email', 'campaign', 'audience', 'edm'],
  edm: ['email', 'campaign', 'edm'],
  newsletter: ['email', 'campaign'],
  social: ['social', 'post', 'posts', 'publishing', 'draft'],
  post: ['social', 'post', 'draft', 'publishing'],
  posts: ['social', 'post', 'draft', 'publishing'],
  inbox: ['inbox', 'conversation', 'reply', 'comments'],
  comments: ['inbox', 'comments', 'reply'],
  creative: ['creative', 'banner', 'asset', 'assets'],
  banner: ['banner', 'banners', 'creative'],
  banners: ['banner', 'banners', 'creative'],
  design: ['creative', 'banner', 'design'],
  website: ['website', 'page', 'site', 'draft'],
  landing: ['website', 'page', 'site'],
  page: ['website', 'page', 'site'],
  tracking: ['gtm', 'tracking', 'conversion', 'measurement'],
  gtm: ['gtm', 'tracking', 'tag'],
  conversion: ['conversion', 'conversions', 'tracking', 'measurement'],
  conversions: ['conversion', 'conversions', 'tracking', 'measurement'],
  pixel: ['tracking', 'conversion', 'measurement'],
  feed: ['feed', 'inventory', 'catalog', 'vehicle'],
  feeds: ['feed', 'inventory', 'catalog', 'vehicle'],
  inventory: ['inventory', 'feed', 'vehicle', 'catalog'],
  stock: ['inventory', 'feed', 'vehicle'],
  catalogue: ['catalog', 'feed', 'product'],
  catalog: ['catalog', 'feed', 'product'],
  approve: ['review', 'reviews', 'approve', 'approval', 'execute'],
  approval: ['review', 'reviews', 'approve', 'approval'],
  approvals: ['review', 'reviews', 'approve', 'approval'],
  review: ['review', 'reviews'],
  waiting: ['review', 'reviews', 'pending', 'status'],
  pending: ['review', 'pending', 'status'],
  seo: ['seo', 'organic'],
  kpi: ['kpi', 'targets', 'target'],
  kpis: ['kpi', 'targets', 'target'],
  target: ['kpi', 'targets'],
  targets: ['kpi', 'targets'],
  summary: ['brief', 'daily', 'overview', 'summary'],
  monday: ['brief', 'daily', 'overview'],
  overview: ['brief', 'overview', 'summary'],
  attention: ['brief', 'daily', 'exceptions', 'health'],
  report: ['report', 'brief', 'overview', 'performance'],
  performance: ['performance', 'breakdown', 'campaign', 'campaigns'],
  campaign: ['campaign', 'campaigns', 'breakdown'],
  campaigns: ['campaign', 'campaigns', 'breakdown'],
  ads: ['ads', 'ad', 'breakdown', 'creative'],
  brief: ['brief', 'briefs'],
  briefs: ['brief', 'briefs'],
  video: ['video', 'videos', 'render'],
  qr: ['qr', 'code', 'codes'],
  client: ['client', 'clients'],
  clients: ['client', 'clients'],
  qa: ['review', 'portfolio', 'recommendations', 'conversion'],
  audit: ['review', 'portfolio', 'conversion'],
  portfolio: ['portfolio', 'review'],
  across: ['portfolio', 'review'],
  every: ['portfolio'],
  dealers: ['portfolio', 'client', 'clients'],
  accounts: ['portfolio', 'connections', 'account'],
  wasted: ['search', 'terms', 'wasted', 'spend'],
  wasting: ['search', 'terms', 'wasted', 'spend'],
  policy: ['policy', 'disapproved', 'limited', 'evidence'],
  disapproved: ['policy', 'disapproved', 'limited'],
  disapproval: ['policy', 'disapproved', 'limited'],
  disapprovals: ['policy', 'disapproved', 'limited'],
  limited: ['policy', 'limited', 'disapproved'],
  approval: ['policy', 'approval', 'disapproved'],
  rejected: ['policy', 'disapproved'],
  violation: ['policy', 'disapproved', 'evidence'],
  violations: ['policy', 'disapproved', 'evidence']
}

export interface RoutableTool { name: string, description: string }

const tokenize = (text: string): string[] =>
  text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 2 && !STOPWORDS.has(word))

/** Query tokens expanded with synonyms; the user's own words weigh more than expansions. */
function queryWeights(text: string): Map<string, number> {
  const weights = new Map<string, number>()
  const add = (word: string, weight: number) => weights.set(word, Math.max(weights.get(word) ?? 0, weight))
  for (const word of tokenize(text)) {
    add(word, 1)
    if (word.endsWith('s')) add(word.slice(0, -1), 0.9)
    for (const synonym of SYNONYMS[word] ?? []) add(synonym, 0.7)
  }
  return weights
}

/** Score tools by weighted overlap with name tokens (strong) and description tokens, IDF-weighted. */
export function scoreTools(tools: readonly RoutableTool[], text: string): Map<string, number> {
  const query = queryWeights(text)
  const scores = new Map<string, number>()
  if (!query.size || !tools.length) return scores
  const docs = tools.map(tool => ({ name: tool.name, nameTokens: new Set(tokenize(tool.name.replace(/_/g, ' '))), descTokens: new Set(tokenize(tool.description ?? '')) }))
  const df = new Map<string, number>()
  for (const doc of docs) for (const token of new Set([...doc.nameTokens, ...doc.descTokens])) df.set(token, (df.get(token) ?? 0) + 1)
  for (const doc of docs) {
    let score = 0
    for (const [word, weight] of query) {
      const idf = Math.log(1 + docs.length / (1 + (df.get(word) ?? 0)))
      if (doc.nameTokens.has(word)) score += 3 * weight * idf
      else if (doc.descTokens.has(word)) score += weight * idf
    }
    if (score > 0) scores.set(doc.name, score)
  }
  return scores
}

/** Tool names the conversation already used (AI SDK messages: tool-call/tool-result parts). */
export function toolNamesFromMessages(messages: readonly unknown[]): string[] {
  const names = new Set<string>()
  for (const message of messages) {
    const content = (message as { content?: unknown })?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      const name = (part as { toolName?: unknown })?.toolName
      if (typeof name === 'string') names.add(name)
    }
  }
  return [...names]
}

/** Recent user text (latest first) used for routing; older turns help follow-ups like "do it". */
export function recentUserText(messages: readonly unknown[], turns = 3): string {
  const texts: string[] = []
  for (let i = messages.length - 1; i >= 0 && texts.length < turns; i--) {
    const message = messages[i] as { role?: string, content?: unknown }
    if (message?.role !== 'user') continue
    if (typeof message.content === 'string') texts.push(message.content)
    else if (Array.isArray(message.content)) {
      texts.push(message.content.map(part => (part as { text?: unknown })?.text).filter(t => typeof t === 'string').join(' '))
    }
  }
  return texts.join(' \n ')
}

export interface RouteToolsInput {
  tools: readonly RoutableTool[]
  text: string
  usedToolNames?: readonly string[]
  limit?: number
}

/**
 * Ordered, de-duplicated tool names to advertise this turn: core → already used → best matches.
 * Never exceeds `limit` (and never the provider cap minus the find_more_tools slot).
 */
export function routeTools(input: RouteToolsInput): string[] {
  const limit = Math.min(input.limit ?? ROUTED_TOOL_LIMIT, PROVIDER_TOOL_CAP - 1)
  const available = new Set(input.tools.map(tool => tool.name))
  const picked: string[] = []
  const take = (name: string) => {
    if (picked.length < limit && available.has(name) && !picked.includes(name)) picked.push(name)
  }
  CORE_TOOLS.forEach(take)
  for (const name of input.usedToolNames ?? []) take(name)
  const scores = scoreTools(input.tools, input.text)
  ;[...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).forEach(([name]) => take(name))
  return picked
}

/** Search the full catalogue for find_more_tools. Returns the best matches not already active. */
export function findMoreTools(tools: readonly RoutableTool[], query: string, active: ReadonlySet<string>, max = 15): RoutableTool[] {
  const scores = scoreTools(tools, query)
  return tools
    .filter(tool => !active.has(tool.name) && (scores.get(tool.name) ?? 0) > 0)
    .sort((a, b) => (scores.get(b.name)! - scores.get(a.name)!) || a.name.localeCompare(b.name))
    .slice(0, max)
}
