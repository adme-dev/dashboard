/** Test-only deployment scope. Ownership and production plans still come from fixtures. */
export function destinationActivation(workspaceId: string, expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  return { PAGE_STUDIO_CUSTOMER_ACTIVATION: JSON.stringify({ previewEnabled: false, cmsSetupEnabled: false,
    browserEnabled: true, editorEnabled: true, productionEditorEnabled: true, productionEditorOrigin: 'https://studio.example.test',
    previewApprovals: [{ workspaceId, starterVersion: 'limousine-v1', policy: {
      approvalId: '11111111-1111-4111-8111-111111111111', approvedBy: '22222222-2222-4222-8222-222222222222',
      expiresAt, pagesPerSiteLimit: 10, storageBytesLimit: 104857600, monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 104857600
    } }] }) }
}
