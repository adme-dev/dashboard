# Admin Access QA

**Date:** 2026-06-29
**Scope:** Bookkeeper finance/Xero sidebar access for ADME.

## Result

- Matched the requested bookkeeper-style account to `Kellie White <accounts@adme.net.au>`.
- `/admin/users` returned the full roster in the live app session: 52 users.
- Changed `accounts@adme.net.au` from `admin` to `accounts`.
- Verified the running app now returns:
  - user role: `accounts`
  - permission groups: `FINANCE`
  - status: `active`
  - team: `ADME Everyone`
- Verified `/api/xero/status` returns connected for `ADME Advertising Pty Ltd`.

## Access Meaning

The `accounts` role is the least-privilege bookkeeper role:

- Grants finance/Xero surfaces through the `FINANCE` permission group.
- Does not grant the `ADMIN` permission group.
- Keeps admin-only navigation and role management hidden.

## Caveat

Existing browser sessions may need a refresh or re-login to pick up the new role immediately. In local dev, role-permission KV is not present, so the running app read the updated role directly after the change.
