/** Private Worker rollout switch, independent of designer/library activation.
 * Admission never replaces fresh publisher and persisted-owner authorization. */
export function templatePublishEnabled(env: Record<string, unknown>) {
  return env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED === 'true'
    && env.FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED === 'true'
    && env.EMAIL_DESIGN_SESSION_AUTHORITY === 'pages-auth-me-v1'
    && ['staging', 'production'].includes(String(env.EMAIL_DESIGN_ENVIRONMENT))
}
