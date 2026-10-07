/** Session audience, independent of the Team/Customer email-template audience. */
export type FormApiAudience = 'portal' | 'customer'

/** Only code-selected authenticated endpoints; callers cannot supply an API origin. */
export function formSiteApi(siteId: string, audience: FormApiAudience = 'portal') {
  const root = audience === 'customer' ? '/api/portal/page-studio/customer' : '/api/portal/page-studio'
  return `${root}/sites/${encodeURIComponent(siteId)}`
}
