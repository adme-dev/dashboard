# Email template import handoff

Implemented in `/Users/paulgiurin/orca/workspaces/dashboard/edm-modern-library-20261029` without commits, deployment, migrations, package changes, sends or live data writes.

## Integration

`EmailTemplateImportModal` accepts `v-model:open` and emits `imported(template)` only after a successful explicit save. Parent additions already made before coordinator took ownership: `showImport` and `onImported` beside `busyId`, header Import template button, modal before rename modal. Parent callback prepends the returned row reactively. Coordinator owns any subsequent parent integration and sidebar changes.

`POST /api/email/templates/import` defaults to preview (`save: false`) and invokes the private renderer only; explicit `save: true` uses the canonical `createTemplate` pipeline. Both modes require write access and resolve the authorized client. Content supports HTML and direct native document JSON (not wrapper/export formats or ZIP). Inputs cap content at 512 KiB with a 1 MiB raw request ceiling. Preview does not persist. Both requests independently sanitize and validate, so browser payloads cannot bypass checks.

HTML parser allowlists email formatting/table tags and attributes, preserving inline styles and public HTTPS images. Scripts, handlers, forms, iframes, unknown elements, unsafe schemes, CSS URL loads/imports/expressions and remote stylesheets are removed. No server remote asset requests occur. Browser preview uses an empty sandbox and no-referrer. Native JSON uses existing bounded snapshot/graph validation plus missing reference and disconnected-cycle checks; Html contents including mobile overrides are sanitized. Existing stored templates are untouched.

## Verification

Node 24.22.1: 19 tests passed across `test/unit/emailTemplateImport.test.ts`, `test/unit/emailTemplateImportApi.test.ts`, `test/components/emailTemplateImportModal.test.ts`, and existing gallery/delete suites. Focused ESLint passed for all six newly created code/test files. Coverage includes preservation, unsafe HTML, shape/references/cycles, input limits, auth/client rejection, preview without writes, explicit save, cancel and success feedback.

No authenticated browser or deployed acceptance performed by worker. Coordinator owns full build, live browser acceptance and release. The parser `parse5` is already installed and locked as a transitive dependency; no dependency files were changed per scope. Coordinator explicitly owns promoting parse5 to a direct dependency in package/lock before release; worker has not edited either file. Inline CSS uses a bounded property allowlist excluding positioning, z-index, visibility, display and opacity; overlay and escaped-CSS regression tests pass; style tags and CSS background images are intentionally removed.
