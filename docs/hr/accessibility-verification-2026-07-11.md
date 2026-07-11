# HR launch governance accessibility verification

Date: 11 July 2026  
Environment: production (`https://app.xeroflow.io/agency/hr/governance`)  
Build: `1b15369c`

## Verified

- Production route rendered for an authenticated HR owner without an application error.
- Accessibility tree exposed one `h1` followed by two `h2` sections and an `h3` approval-history section.
- The clearance list and attestation editor were exposed as named regions.
- All nine gates were exposed as keyboard-focusable buttons with gate name, state and purpose.
- Decision and expiry controls were exposed as named comboboxes.
- Evidence reference and limitations were exposed as named textboxes with associated help text.
- The submit action was exposed as `Record attestation`.
- The page stated `Commissioning locked`; no gate was silently approved.
- At a 1432 × 772 viewport, the document had no horizontal overflow.
- The long clearance region had `overflow-y: auto`, client height 525 px and scroll height 880 px, proving independent vertical scrolling.

## Not yet sufficient for the accessibility launch gate

This check covers the owner governance page only. Do not approve the
`accessibility_review` launch gate until the participant questionnaire,
deadline/extension, reviewer scorecard, interview, finding and action-plan flows
have also passed keyboard, screen-reader, focus, contrast and responsive checks
at 320, 768, 1024 and 1440 px widths.
