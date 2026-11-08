# Dashboard select controls — 8 November 2026

Kimi `kimi-code/k3.1-pro` implemented a bounded repair of obsolete Nuxt UI props in five existing surfaces; Codex reviewed model shapes and integrated responsive control widths. These are source fixes, not a dashboard-wide browser acceptance claim.

| Surface | Repair | Boundary |
| --- | --- | --- |
| Client form | Payment terms use v4 items/scalar values; due-on-receipt zero survives editing | Existing client/finance authority unchanged |
| Monday migration preview | Department/project lists use v4 items; explicit no-mapping stays cleared and is normalized to undefined | No migration executed |
| Kanban detail | Status/priority/type selectors retain scalar IDs/enums; constrained fields stack | Existing update endpoints unchanged |
| Kanban filters | Assignee/priority/project all-values map back to undefined; labels remain multiple scalar IDs | No task mutation |
| Xero settings | Organization dropdown/radio list use v4 items and scalar tenant IDs | No organization selected or financial call made |

Kimi compiled all five Vue components; root validation and release receipts supply the final test/CI/deployment status. The legacy native date field in Kanban detail remains a separately identified UI debt; this slice does not claim it was redesigned. Full dashboard coverage remains in the separate UI/UX ledger.
