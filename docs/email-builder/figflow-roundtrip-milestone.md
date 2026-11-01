# First structured FigFlow round trip

Updated 2 November 2026. **Implemented, merged and deployed with access disabled;
hosted acceptance is incomplete.** [PR #807](https://github.com/adme-dev/dashboard/pull/807)
contains the implementation. Exact deployment identities, hashes and proof limits
are in [the release receipt](figflow-release-20261101.json).

## Acceptance and scope

A supported saved composer draft opens as actual native FigFlow content. Supported
text, image and button edits return as a durable proposal, require a rendered
preview and explicit Apply, and save through canonical revision CAS. Apply is one
composer undo step. A second handoff retains intervening staff edits. Conflicting
newer revisions remain intact. This milestone does not include sending, arbitrary
canvas conversion, module publication or real email-client compatibility.

- [x] Canonical composer conversion, stable lineage and restricted content edits.
- [x] Actual native import/snapshot bridge; unsupported structure/style rejected.
- [x] Durable actor/document/revision-bound handoff and proposal lifecycle.
- [x] Composer open/resume/reconcile/preview/apply, revision saves and one undo step.
- [x] Final source review and focused application/database/native/browser checks.
- [x] Merge, production migrations, private services and disabled Pages deployment.
- [ ] Provision the private service's matching session-signing key.
- [ ] Reviewed activation and authenticated hosted round-trip acceptance.
- [x] Signed-in composer save/reload and QR Codes/navigation verification (2 November).

## Production release

All runtime releases below used clean current main
`b63cd1e59bebcbc6f88d698f7eac62ee52953924`.

| Surface | Verified release |
|---|---|
| Pages `agency-dashboard` | `41fd8581-10e0-4d4a-ac7b-dc1bacf8fdcd`; app.xeroflow.io alias; raw 25,468,500 bytes, 428 below unchanged budget |
| Private email design | Version `29ab0af9-7309-4ee2-82d7-ee473b4fc5de`; no public endpoint; flag false; JWT_SECRET absent |
| Database | Migrations 491–493 committed together against the verified production Hyperdrive target at 10:26 UTC |
| Private native assets | Version `86f446f6-f9de-4ce1-b6af-10a0bf722cb1`; ASSETS only; no public endpoint |
| Creative gateway | Version `595f31ce-abd5-4e3d-ba7c-b9e1f3f59fce`, deployment `89c76119-d31d-4dfe-b438-b778a9235399`, 100% active |

Pages mounts only the bounded design transport and has the production
EMAIL_DESIGN binding. Heavy design handlers remain in the private Worker;
existing template PATCH/DELETE stay local. Both capability flags remain false.
The gateway adds only `/figflow/0.11.2-edm1/` after existing authentication,
preserving old editor assets, runtime settings, secrets and MotorStack RPC.
The old creative version is `e5de27cd-41cd-456f-a7f7-9a91e0276777`; prior Pages
artifact is `77a1835c-c48d-4f72-aaa6-f589307fe225`.

## Verification

- 73 PostgreSQL/private-Worker checks and 259 existing design/security/deploy
  regressions passed. Focused composer/recovery/panel/inventory checks passed.
- All 18 design-transport cases and targeted lint passed. The Pages build and
  target/source guards passed without changing budgets or minifier guards.
- [Native CI run 41296329622](https://github.com/adme-dev/dashboard/actions/runs/41296329622)
  passed 43 native tests, including the original seven bridge tests and all four
  EDM tests, plus 15 relay checks and browser packaging. Native source is
  `018c306c366e3e9cc1d6a02cb51dddbefec65a6b`; subsequent runtime changes did not
  alter those native inputs. The archive SHA is in the release receipt.
- The actual-WASM browser case passed against the real private Worker and
  disposable PostgreSQL: native edit, persisted proposal, rendered preview,
  explicit Apply, one undo/redo action, staff CTA edit/save and a second native
  return preserving that edit. No request reached production. Native edits used
  the real bridge; this is not mouse/keyboard, full-dashboard visual or hosted
  acceptance. The screenshot shows native content, not email-client rendering.
- The browser harness needed Buffer conversion when serving esbuild bytes;
  before that fix it timed out loading its fixture. The corrected run passed in
  5.57 seconds; six unrelated cases were intentionally filtered, not failed.
- Cloudflare readback verified Pages source/alias/binding/false flag and both
  private service identities. Creative source hashes and retained runtime/assets
  settings match the guarded promotion. Public launcher returns 200; old/new
  editor paths redirect to the existing sign-in flow. The Email Builder page
  returns 200 and states disabled status. Composer/QR app routes return 200, but
  the initial verification browser was signed out; the dated checkpoint below records subsequent signed-in checks.

## Remaining actions and ownership

1. **Operator:** securely provision the existing Pages JWT_SECRET to
   `xeroflow-email-design-production` (and the correct staging secret for staging).
   Its approved source has not been identified. Do not rotate Pages credentials,
   print secrets, extract browser tokens or add an alternate authentication path.
2. **Release developer:** make a reviewed activation change after secret/schema/
   service prerequisites are verified. Current deployment guards intentionally
   require false flags; do not bypass them with ad hoc configuration. Exercise
   staging authentication, client scope, revoked access, conflict and retry paths,
   then perform the exact hosted staff workflow before production enablement.
3. **Signed-in reviewer:** verify composer Save/modules, QR Codes/navigation and
   the actual creative-host round trip. Existing composer save/reload and QR
   navigation passed on 2 November; the canonical hosted round trip remains open.

Kimi owned native implementation; Grok supplied relay/persistence review; Codex
integrated and released, with independent source review. Shared modules,
publication and Apple Mail/Gmail/Outlook acceptance remain in the parent PRD.
The original dirty worktree and shared node_modules were preserved. The release
checkout and native evidence are retained for activation/handoff, not as a stale
future release base; fetch current main before continuing.

## Live acceptance checkpoint — 2 November

The owner completed sign-in in the verification browser. Production composer
modules and Save rendered; a uniquely named temporary shared draft was saved
from the FuturaX starter and reloaded by its persisted ID with content intact.
The owned draft was then deleted (200), and a fresh read returned 404. No email
was sent. QR Codes navigation and existing records rendered. The authenticated
`/figflow/0.11.2-edm1/` editor loaded a canvas and its actual native bridge returned
status including EDM import, required-image and snapshot operations.

This closes the established staff UI check and verifies hosted native startup.
It does not close the canonical hosted round trip: the private design Worker's
JWT_SECRET is absent and both backend flags remain false. Pages has the encrypted
JWT_SECRET entry but its management API returns no value. A fresh bounded search
of dashboard env/dev-vars files found no stored key, and no connected secret-manager
provider is available. The operator has been asked for the original secure source;
no replacement key, credential rotation or authentication bypass was introduced.
