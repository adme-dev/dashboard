export interface PageStudioLaunchState {
  candidateReview?: boolean
  siteId: string
  siteName: string
  siteStatus: string
  checkpointId: string | null
  digest: string | null
  approvedVersionId: string | null
  activeReleases: { id: string, hostname: string, activatedAt: string }[]
  content: { status: 'ready' | 'required' | 'unavailable', publicPages: number | null, publicForms: number | null, requiresSealedFeatures?: boolean | null }
  plan: { status: 'ready' | 'required', key: string | null }
  observedAt: string
}

export interface LaunchDomain {
  id: string
  hostname: string
  environment: string
  status: string
  dnsStatus?: string
  tlsStatus?: string
  hostnameStatus?: string
}
export const domainReady = (domain: LaunchDomain) => domain.environment === 'production'
  && domain.status === 'active' && domain.dnsStatus === 'active'
  && domain.tlsStatus === 'active' && domain.hostnameStatus === 'active'

export interface LaunchReadinessItem {
  id: string
  label: string
  status: 'ready' | 'required' | 'unavailable' | 'optional'
  detail: string
  action: string
  target: 'studio' | 'forms' | 'builds' | 'domains' | 'settings'
}

export function launchReadiness(input: {
  state?: PageStudioLaunchState | null
  stateFailed: boolean
  domains: LaunchDomain[]
  domainsFailed: boolean
  email?: { settings: unknown, readiness: { sendingEnabled: boolean } } | null
  emailFailed: boolean
}): LaunchReadinessItem[] {
  const state = input.stateFailed ? null : input.state
  const forms = state?.content.publicForms
  const readyDomain = !input.domainsFailed && input.domains.some(domainReady)
  return [
    { id: 'content', label: 'Saved website', status: state?.content.status ?? 'unavailable',
      detail: state?.content.status === 'ready' ? `${state.content.publicPages} visitor pages saved.` : 'Save your website in Studio. Unavailable content needs a refresh.', action: 'Open Studio', target: 'studio' },
    { id: 'review', label: 'Approval', status: !state ? 'unavailable' : state.approvedVersionId ? 'ready' : 'required',
      detail: state?.approvedVersionId ? 'The exact saved version is approved.' : 'The current saved version needs approval before publishing.', action: 'View publishing', target: 'builds' },
    { id: 'forms', label: 'Enquiry forms', status: forms == null ? 'unavailable' : forms ? 'required' : 'optional',
      detail: forms ? `${forms} form definitions saved. Verify a test receipt and notification delivery before launch.` : forms === 0 ? 'No enquiry forms on visitor pages. Forms are optional.' : 'Saved forms could not be checked.', action: 'View submissions', target: 'forms' },
    { id: 'domain', label: 'Domain and HTTPS', status: input.domainsFailed ? 'unavailable' : readyDomain ? 'ready' : 'required',
      detail: readyDomain ? 'An active production domain has active DNS and TLS records.' : 'Connect and verify the production domain, DNS and HTTPS certificate.', action: 'Manage domains', target: 'domains' },
    { id: 'email', label: 'Enquiry notifications', status: input.emailFailed ? 'unavailable' : forms === 0 ? 'optional' : input.email?.readiness.sendingEnabled ? 'ready' : 'required',
      detail: input.email?.readiness.sendingEnabled ? 'Sending is enabled. Confirm delivery with a controlled test.' : input.email?.settings ? 'Preferences are saved; sender verification and sending still need setup.' : 'Configure a verified sender and enquiry recipient if the site collects enquiries.', action: 'Email settings', target: 'settings' },
    { id: 'plan', label: 'Website access', status: state?.plan.status ?? 'unavailable',
      detail: state?.plan.status === 'ready' ? `Current ${state.plan.key ?? 'website'} access is active.` : 'Active website access is required. Review expired or suspended access.', action: 'View settings', target: 'settings' }
  ]
}
