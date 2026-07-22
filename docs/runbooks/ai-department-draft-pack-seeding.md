# AI Department Draft-Pack Seeding

The department-pack seeder creates immutable version-1 catalog material for one approved organizational department. It never promotes a release beyond `draft`, assigns a pilot, changes a permission, invokes a model, or sends a notification.

## Preconditions

- Migration 271 and the authenticated-ceiling migration 273 are applied.
- The caller has the `ADMIN` permission.
- The selected department is active and organizational.
- The selected owner is an active `team_members` record and an explicit member of that same department.
- The department name or slug matches the checked-in blueprint aliases.
- A human has confirmed the department-to-blueprint and owner mapping.

## API contract

`POST /api/admin/ai/governance/draft-packs`

```json
{
  "blueprintKey": "creative",
  "departmentId": "00000000-0000-4000-8000-000000000000",
  "ownerUserId": "00000000-0000-4000-8000-000000000000",
  "reason": "Department owner approved the read/draft evaluation cycle.",
  "confirmation": "SEED_DRAFT"
}
```

The actor identity comes from the authenticated session and is not accepted from the request body. A newly created graph returns HTTP 201. An exact retry returns HTTP 200 with `outcome: "already_exists"`. Different owner, material, version, or release state returns HTTP 409 and requires a governed version/owner-change workflow.

## Transaction and safety invariants

One database transaction and advisory lock cover:

1. owner and department revalidation;
2. evaluation suite, immutable suite version, and redacted fixture cases;
3. pack and capability identities plus immutable version digests;
4. read/draft tool bindings and pack composition;
5. capability and pack releases in `draft` only; and
6. append-only catalog audit events recording actor and reason.

The API has no bulk mode. Seed one reviewed mapping at a time. Do not promote the resulting release until its exact suite/model/prompt/toolset evaluation evidence passes and explicit pilot membership is assigned.

## Recovery

- A failed transaction writes nothing.
- Retrying an exact successful request is idempotent.
- Draft records are intentionally not hard-deleted. If a mapping is wrong, leave the draft dormant and create a corrected governed version or owner-change audit event.
- Use the catalog suspension control for any release that has already moved beyond draft.
