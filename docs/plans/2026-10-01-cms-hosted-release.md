# CMS hosted release — 1 October 2026

User authorized deployment and continued implementation. Release is staged:
Dashboard preview and private staging router first, then customer storage capability
installation and hosted acceptance before production activation.

## Source and rollback

- Dashboard candidate is based on `e2b2ff7ab`, includes freshly fetched main
  `a98b83a53c65fbb80da48e8a2348610d2c9d24bb` (zero behind).
- Studio `01010462722bfe9b90580412239af4135bfc4a8a` includes current main
  `50d372e1cb0bc92a661379866062dbe75a4539d0` (zero behind).
- Prior Pages preview: `6ae12ccc-139f-4cfa-ba7f-06da82a7b13e`, source `9f4c613`.
- Prior private router: `448bf25a-150c-478e-be72-ef750d257dfe`, source
  `a49c2ab85047a84f9e6ada74fc0e414c0053c62e`.
- Rollback to those exact artifacts if regression; keep additive customer data.

## Readiness

- [x] Deployment target and current-main guard pass.
- [x] 83 focused Dashboard deployment/media/forms/workspace tests pass.
- [x] Close temporary native signup/editor/browser/preview flags and clear the
  synthetic provisioning approvals before shipping the current preview.
- [ ] Deploy and read back private staging router.
- [ ] Deploy Dashboard through `pnpm deploy:preview`, verify exact artifact.
- [ ] Browser smoke for invited-customer workspace and agency QR navigation.
- [ ] Managed form-settings catalogue/runtime capability upgrade and scope tests.
- [ ] Hosted form/settings/template save, reload, isolation and conflict acceptance.
- [ ] Production release after hosted acceptance; do not call preview production.

The existing hosted schema upgrade accepts only collection, workflow and
collection-staging. Local form-settings migrations 0001–0004 cannot be applied
ad hoc to customer production databases. Until managed installation is complete,
new settings RPCs must remain unavailable; deployment alone is not activation.
The local Fantasy Limo fixture and saved template revision 14 remain intact.
