# Page Studio dashboard route boundary

Routes in this directory are management and governance surfaces only.

- Do not mount or recreate a local visual website builder.
- Editing must launch the separately deployed `adme-dev/xeroflow-page-studio` runtime through the signed editor-session endpoint.
- The legacy `:siteId/edit` route is compatibility-only and must redirect to the governed site workspace.
- Preserve site, page, review, build, release, domain, subscription, and audit management routes.
