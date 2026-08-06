# AI governance scrolling repair

Date: 2026-08-06

Route: `https://app.xeroflow.io/admin/ai/governance`

Scope: governance page layout and focused regression coverage only; no deployment or publication

## Outcome

The AI governance page now owns one viewport-bound vertical scroll region. The existing centered page root is a semantic, keyboard-focusable `main` with `h-full min-h-0 overflow-y-auto`; the agency shell remains the fixed, clipped application frame.

No form fields, controls, data flow, governance behavior, sidebar layout, or marketing pages changed.

## Production reproduction and root cause

The defect was reproduced in an isolated authenticated Kimi WebBridge tab group named `Governance scroll audit`, using the existing Paul (Super Admin) browser profile.

At the 1488 × 947 desktop viewport before the fix:

- Governance root: 11,712px high, `overflow-y: visible`, no scroll capacity.
- Agency content parent: 947px high, 11,712px scroll height, `overflow-y: hidden`.
- Document: 947px client height and 947px scroll height, so the browser document could not scroll.
- The only usable vertical scroll owner was the sidebar.
- `window.scrollTo(0, 100000)` left window, document, clipped parent, and page-root scroll positions at zero.

This isolates the root cause to a missing page-level scroll owner inside the agency layout's deliberate `overflow-hidden` content frame. It is not a loading or API problem: the readiness, catalog, evaluations, rollout, and pilot-metrics governance requests all completed with HTTP 200.

Before screenshot: `/tmp/governance-scroll-before.png`

## TDD regression

The regression mounts the real Vue governance page, gives its readiness-list boundary representative overflowing content, then renders that markup in real Chromium inside a faithful fixed/flex/`overflow-hidden` agency-shell fixture. It checks browser layout and interaction at two viewports:

- Desktop: 1440 × 900
- Narrow/mobile: 390 × 640

For each size it requires:

- one semantic governance content region;
- computed `overflow-y: auto` with client height equal to the viewport;
- scroll height greater than client height;
- no second overflowing page-content scroll owner;
- successful keyboard `PageDown` and real mouse-wheel scrolling; and
- exact bottom reachability with the final governance controls visible.

The browser, mounted Vue app, and DOM host are closed/unmounted/removed in `finally` for both passing and failing cases.

RED, under the repository-required Node 24 runtime:

```text
Desktop: expected 900px / auto; received 1913px / visible
Mobile:  expected 640px / auto; received 2006px / visible
```

The first attempted test invocation used the system Node 20 runtime and stopped during Vue transformation because `crypto.hash` is unavailable there. It was rerun with `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin` first in `PATH`. After the test was upgraded to real Chromium, the production scroll utilities were deliberately removed for the mutation check shown above, then restored.

GREEN:

```text
2 passed: desktop and narrow/mobile scroll-owner cases
```

## Implementation

`app/pages/admin/ai/governance.vue`:

- changed the existing root `div` to `main`;
- added `h-full min-h-0 overflow-y-auto`;
- linked it to the page heading through `aria-labelledby`; and
- added `tabindex="0"` so keyboard users can focus and scroll the region.

The existing max width, spacing, responsive padding, hierarchy, Nuxt UI components, and dark-mode styling are unchanged.

## Real-browser post-fix verification

The exact source classes and accessibility attributes were temporarily applied to the isolated production tab DOM to validate runtime CSS without deploying.

At 1488 × 947:

- Governance scroll owner: 947px client height, 11,712px scroll height, `overflow-y: auto`.
- Agency parent: 947px client/scroll height, `overflow-y: hidden`, no overflow of its own.
- Content scroll owners: exactly one.
- Page-step scroll: `0 → 757px`.
- Bottom scroll: `10,765px`, equal to the computed maximum.
- Final visible pack section bottom: 923px inside the 947px scroll-region bottom, proving bottom reachability.
- The focused element was the governance scroll region.
- No sticky governance controls existed to regress.
- The desktop top layout was visually unchanged; the bottom view showed the final Operations and Engineering & IT pack controls and known-gaps rows.

After screenshots:

- Top: `/tmp/governance-scroll-after-top.png`
- Bottom: `/tmp/governance-scroll-after-bottom.png`

The final network capture contained 355 HTTP 200 responses and one HTTP 204. The two non-completed entries were expected long-lived `/api/notifications/stream` requests with HTTP 200; there were no failed governance requests. Kimi WebBridge does not expose a console-log reader, so a literal DevTools console export was not available; the page completed, rendered without an application error state, and the network/runtime layout probes returned normally.

## Verification commands

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  pnpm exec vitest run \
  test/app/aiGovernanceControlPlane.test.ts \
  test/app/aiGovernanceReadinessPage.test.ts
# 2 files passed; 18 tests passed

PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  pnpm exec eslint app/pages/admin/ai/governance.vue \
  --rule 'vue/max-attributes-per-line: off' \
  --rule 'vue/singleline-html-element-content-newline: off'
# exit 0

git diff --check
# exit 0
```

No deployment or publication was performed.
