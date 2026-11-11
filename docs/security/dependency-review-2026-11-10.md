# Dependency review — 10 November 2026

This review accompanies the Creative Suite upgrade. Dashboard dependency findings are independent of the six Rust editor version checks. Base: `25a384d4f3054aa208cf8378abcc755b6fcd642b`.

## Bounded correction

Direct DOMPurify and its type-stub dependency resolve from 3.4.12 to 3.4.17. The manifest floor is now `^3.4.17`. Production dependency changes are limited to DOMPurify importer, package integrity and snapshot references; unrelated resolver changes were excluded. jsdom 31.0.0 and its required graph are added as a development-only dependency for sanitizer tests, with expected Vitest peer snapshot changes. Node 24.18.0 / pnpm 10.17.1 frozen install with lifecycle scripts disabled passed.

Official release: https://github.com/cure53/DOMPurify/releases/tag/3.4.17
Advisory: https://github.com/advisories/GHSA-cg2g-xh64-v4q7

The actual callers are `app/components/chat/ChatMarkdown.vue` and `app/components/task/CommentItem.vue`. They sanitize strings with explicit tag/attribute allowlists; they do not enable the shadow-root/DOM-returning template configuration described by the critical advisory. This source finding limits the identified attack path; it is not a guarantee that the package is universally safe.

## Audit evidence

`pnpm audit --prod --json` registry metadata counts dependency paths, not confirmed exploitable application endpoints:

| Check | Critical | High | Moderate | Low | DOMPurify advisory entries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original lockfile | 6 | 105 | 96 | 25 | 5 |
| DOMPurify-only correction | 5 | 104 | 95 | 23 | 0 |

Raw evidence retained locally: `/private/tmp/creative-dashboard-dependency-audit-20261110.json` and `/private/tmp/creative-dashboard-dependency-audit-after-20261110.json`. Exit 1 denotes findings, not audit transport failure. No clean production audit is claimed.

## Remaining critical paths and compatible follow-up

- MapLibre 2.4.0 enters through Unovis. Kimi source review found chart use rather than Unovis maps; QR uses Leaflet. Unovis 1.8.0 provides a newer MapLibre parent path, but updating paired Unovis packages requires chart and QR regression coverage. Do not force MapLibre across major versions beneath the existing parent.
- `simple-git`, `@simple-git/argv-parser` and `shell-quote` enter through Nuxt devtools. They are development-tool paths rather than evidence of Pages runtime exposure. Use a supported Nuxt/devtools update and build validation.
- `proxy-addr` enters through Think/codemode/MCP Express adapters. Existing Workers do not start these Node adapters. Reconcile through compatible parent updates and Worker regressions, not a claimed production exploit.

The historical Zero/OpenTelemetry exception in `dependency-audit-2026-07-12.md` had an August 12 review deadline. It is not renewed by this task. Supported Zero migration/reachability review remains open; keep zero-cache private and do not force incompatible telemetry majors.

## Acceptance

Focused tests passed: 2 files, 5 tests (chat formatting, unsafe HTML/URL removal, image handling and existing task-comment replies). The initial happy-dom sanitization tests failed identically with both old and new DOMPurify; upstream explicitly does not support happy-dom for security assertions. The new sanitization test therefore uses jsdom 31.0.0; the existing comment interaction test retains happy-dom. Nuxt prepare ran on this exact checkout before testing. See https://github.com/cure53/DOMPurify#running-dompurify-on-the-server. The full dashboard build and required CI passed, and guarded production deployment 42795537384 attempt2 published source 9ac to agency-dashboard deployment b375fe5a-aa12-41f7-89be-4ffedb49b4a7. Public-host entry bytes match the immutable deployment and the signed-out QR route reaches the expected login page. The initial post-deploy owner check was blocked by browser connectivity. On 12 November, the existing signed-in Brave owner session rendered QR Codes with existing cards and normal controls, then navigated to the agency dashboard with its owner greeting and normal sections. This verifies owner-only read-only navigation/rendering after deployment; QR mutations/scans and employee acceptance were not tested. See [the deployment receipt](../runbooks/creative-suite-dashboard-deployment-20261110.json). The dependency update must remain separate from claims that Creative Suite browser saving or provider imports work.
