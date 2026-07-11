# HR scoring calibration and AI-safety verification

Date: 11 July 2026

## Scoring checks

- A role score is publishable at exactly 70% weighted evidence coverage and abstains at 69.99%.
- Unsupported ratings contribute neither evidence coverage nor score value.
- For fixed role weights and evidence, increasing a criterion rating cannot reduce the score.
- Operational enablement is displayed separately and cannot raise or lower the role score.
- Weights must total 100 and ratings remain within the approved 1–5 anchors.

Automated verification: `test/server/utils/hr/scoring.test.ts` (7 tests).

## AI-safety checks

- Score publication and finding-transition endpoints contain no LLM/model call.
- Only the assigned human reviewer can record a score.
- Potentially adverse individual findings require a separate HR approval state and approver record.
- Owner onboarding declares that automated employment decisions are disabled.
- Monday evidence preview explicitly states that it does not score employees or make performance determinations.

Automated verification: `test/config/hrAiSafetyGateContract.test.ts` (3 tests).

## Approval boundary

These technical checks are evidence for owner review; they do not self-approve the
`scoring_calibration`, `ai_safety_review`, or `human_decision_only` launch gates.
The authorised owner must review the evidence, record limitations and append the
decision in the launch clearance ledger.
