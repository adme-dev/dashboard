/** Worker-owned release policy; flags never grant role or tenant authority. */
export function designerGate(env: Record<string, unknown>) {
  const campaign = env.FIGFLOW_EDM_DESIGNER_ENABLED === 'true'
  return { campaign, template: campaign || env.FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED === 'true' }
}
