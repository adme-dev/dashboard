/** Fixed synthetic bindings for local routing tests; no hosted acceptance claim. */
export function nativePreviewBindings(provisioner: unknown = { createProvisioning() {}, readProvisioning() {} }) {
  return { PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
    PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER: provisioner,
    PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER: { readManagedCmsTarget() {} },
    PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS: { get() {} },
    PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio-customer-preview.xeroflow.io' }
}
