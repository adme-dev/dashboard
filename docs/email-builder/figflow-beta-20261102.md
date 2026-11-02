# FigFlow real-template beta — 2 November 2026

**Verdict: partial pass; the complete template workflow is not ready.** Electric
Drive passed a real native heading edit, review, explicit Apply and reload.
FuturaX failed native editing: its HTML-backed design opens as a blank canvas
with zero editable fields. The saved FuturaX source and rendered HTML were
preserved, and its proposal was cancelled. No email was sent.

This extends the earlier synthetic acceptance in the
[content-round-trip milestone](figflow-roundtrip-milestone.md). That narrow proof
remains valid; it does not establish that existing catalog templates are editable.
Machine-readable results, hashes and retained test identities are in the
[beta receipt](figflow-beta-20261102.json).

## Live browser checks

| Scenario | Result | Evidence |
|---|---|---|
| Save a real FuturaX starter as an independent verification draft | Pass | Seven blocks; five Html, one footer, one EmailLayout; rendered HTML 69,017 bytes |
| Open FuturaX through the composer's Edit in FigFlow action | **Fail** | Actual hosted native editor opens blank; persisted policy has zero editable fields; Return for review is nevertheless enabled |
| Return unchanged FuturaX, render review, keep current draft | Pass for preservation | Rendered review contains the full original design; stable JSON source and HTML hashes match before/after; final handoff state cancelled; no Apply |
| Save and open real Electric Drive | Pass for supported content | Thirteen blocks, nine editable fields; vehicle image loads in actual native canvas |
| Edit Electric Drive heading with native mouse/keyboard | Pass | Changed “A new perspective on electric.” to “Electric Drive beta: native edit confirmed.” |
| Return Electric Drive for rendered review | Pass | One Heading block differs; canonical source and HTML remain unchanged before Apply; review shows the new heading and full email |
| Explicit Apply and readback | Pass | Applied revision equals canonical head; projected source matches canonical blocks; exactly one heading block changed; other blocks and document metadata preserved |
| Fresh saved-draft navigation/reload | Pass | New heading appears in the loaded composer |
| Desktop and 390px mobile browser email previews | Partial | Heading, images, CTA and responsive stacking render; mobile top navigation appears clipped in the retained screenshot and needs triage |
| Open the user's standalone `/figflow/0.11.2-flow1/` URL | Missing integration | Untitled editor, no email template library; `window.__xfFigBridge` is undefined |

Both saved test objects are **drafts**, named `[Beta] … real template 2026-11-02`,
in the Verification category with shared/default scope. Original library templates
and the earlier synthetic verification draft were not edited. The two beta drafts
are retained for reproduction with version history; no campaign was created.

The composer handoff uses `/figflow/0.11.2-edm1/`, a different build from the
standalone URL. The native content view also omits locked menu, feature-grid,
HTML and footer visuals and uses simplified typography. Its successful import is
not proof of visual design parity; the rendered review is the email preview.

## Catalog preflight — local source only

The actual catalog builders and `composerToDesignDraft` were evaluated at source
`e28e38951106f0f029eee3907672a85e39012d2c`. All eleven starters are admitted by
conversion, but six have zero editable fields. These are local source results,
not eleven hosted browser tests. Only FuturaX and Electric Drive were tested live
in this beta.

| Starter | Editable fields | Conversion result |
|---|---:|---|
| GlideX | 0 | Accepted |
| FuturaX | 0 | Accepted; hosted native editing fails |
| Aviro | 0 | Accepted |
| Electric Drive | 9 | Accepted; hosted heading round trip passes |
| The Open House | 9 | Accepted |
| The Weekend Edit | 9 | Accepted |
| A Little More Balance | 9 | Accepted |
| The Better Brief | 6 | Accepted |
| Register your interest | 0 | Accepted |
| Grand Automotive Sale Weekend | 0 | Accepted |
| Vehicle Launch RSVP | 0 | Accepted |

The mismatch follows the current mapping: composer conversion retains HTML
verbatim and allows an empty editable policy; the native importer maps supported
Text/Heading/Image/Button content but represents other leaf types as locked empty
frames. Imported Postcards/OEM designs consist mainly of Html-backed sections.
This explains the observed blank view without implying that the canonical HTML
was deleted. Compare JSON structurally with sorted object keys; raw stringify
order is not a content-preservation test.

## Follow-up work — open

| ID | Priority / parent | Work and acceptance |
|---|---|---|
| B01 | P1 / F02,F06,F08 | Reject or clearly block zero-editable-field handoffs before native launch. Explain the limit and retain composer editing. All six zero-field catalog fixtures must produce an honest capability result; no blank editor advertised as editable. |
| B02 | P1 / F05,F06 | Add deliberate supported mapping for HTML-backed templates or migrate approved starters into semantic blocks. Preserve links, media, Outlook markup, mobile rules and canonical identity. Re-run real FuturaX native editing and rendered review before closing. A screenshot-only background does not satisfy editable-template acceptance. |
| B03 | P1 / F06,F07 | Deliver the scoped template/module library in the intended FigFlow entry point. Opening the standalone URL must expose authorized templates/modules and the supported open/save workflow; current content handoff does not implement this. |
| B04 | P2 / F05,F09 | Investigate the clipped Electric Drive navigation in the 390px preview. Confirm actual frame geometry and baseline rendering, then add a focused reproduction if it is a renderer defect. Do not attribute it to the heading edit without evidence. |
| B05 | Acceptance / F10 | Run the exact Apple Mail, Gmail and Outlook client matrix against approved final output; exercise controlled test-send gates separately. Browser previews cannot close this task. |

B01 is the next small implementation package. B02 and B03 remain larger product
milestones. No runtime fix, rebuild, deployment, database migration, secret change
or broad automated suite was performed during this beta-only task.

## Reproduction and evidence limits

1. Open `/agency/email/compose?starter=postcards-futurax` on app.xeroflow.io.
   Save an independent named verification draft; choose Edit in FigFlow. Observe
   the blank native content area, then Return for review. Keep current draft.
2. Repeat with `starter=modern-electric-drive`. Edit the main native heading,
   Return for review, verify the one-field change and explicit Apply. Load the
   saved draft afresh and inspect Desktop/Mobile previews.
3. Open the original standalone FigFlow URL separately; do not confuse its build
   with the embedded EDM build.

Browser checks used the existing signed-in owner session through Orca, actual
native GUI input, and authenticated readback from the supported APIs. Readbacks
kept credentials inside the browser and recorded no tokens or customer content.
Orca paused finite UI animations; existing animations were advanced to completion
where needed. Screenshots are local evidence with hashes in the receipt, not
repository-hosted attachments. The mobile clipping is a visual observation with
root cause still unverified. Real email applications, delivery, image replacement,
shared-module publication and all remaining catalog starters were not tested live.
