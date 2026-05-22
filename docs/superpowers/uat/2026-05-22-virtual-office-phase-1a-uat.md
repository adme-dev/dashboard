# Virtual Office Phase 1a — Manual UAT Checklist

Run through this checklist in dev or preview before promoting to production.
Phase 1a delivers presence-only office UI — no video/audio. That ships in Phase 1b.

## Setup

- [ ] Migrations 097 + 098 have run; `psql -c "SELECT COUNT(*) FROM offices"` returns >= 1.
- [ ] `office-room-worker` deployed to Cloudflare (`wrangler deployments list` in `workers/office-room/`).
- [ ] `OFFICE_SYNC_SECRET` set in three places:
      - Local `.env` (for `pnpm dev` to verify sync endpoint header)
      - Cloudflare Pages env var (production + preview) so the Nitro endpoint can verify the header
      - Worker secret (`cd workers/office-room && wrangler secret put OFFICE_SYNC_SECRET`) so the DO can present it
- [ ] `OFFICE_ROOMS` binding present in root `wrangler.toml`.
- [ ] `agency_clients.office_access`, `client_chat_status` table, and office tables all exist in the target DB (verify with `psql -c "\dt offices office_zones office_members zone_visits client_chat_status"`).

## Two-browser walkthrough

Open two browsers (or two profiles) with two different `@adme.net.au` staff accounts. Both navigate to `/office`.

- [ ] Both see the "XeroFlow HQ" office name in the header.
- [ ] Both see the floor plan with 7 zones (Lobby, 4 Meeting Rooms, 2 Focus Rooms) at the correct positions.
- [ ] Both see each other in the "Wandering" panel (top-right) on first connect — capped at 8 avatars.
- [ ] Browser A clicks "Meeting Room A" — A's avatar moves into that zone's avatar stack.
- [ ] Browser B sees A appear in Meeting Room A within ~1 second (no refresh required).
- [ ] Browser A changes status to "Do not disturb" via the status picker — B sees A's status dot turn red within ~1 second.
- [ ] Browser A closes the tab — within ~35 seconds, A disappears from B's view (30s grace + alarm tick).
- [ ] Browser A reopens within the 30-second grace — no flicker (A's presence preserved on B's view).
- [ ] Browser A clicks the lobby zone — A moves to it, then B leaves their zone — B's avatar disappears from any zone and reappears in "Wandering".

## Status sync to chat

- [ ] Browser A sets status to "Do not disturb" in `/office`.
- [ ] Wait ~6 seconds (5s debounce + transit).
- [ ] In another tab in the same profile, navigate to `/agency/chat` — A's status indicator shows DND there too.
- [ ] Browser A sets status to "Available" → `/agency/chat` reflects "online" within ~6 seconds.

## Office switcher

- [ ] In an admin shell:
      ```sql
      INSERT INTO offices (name, layout) VALUES ('Test Office 2', '{}'::jsonb);
      INSERT INTO office_members (office_id, user_id, role)
      SELECT id, '<your-user-id>', 'admin' FROM offices WHERE name = 'Test Office 2';
      ```
- [ ] Reload `/office` — switcher dropdown now appears in header (it was hidden with a single office).
- [ ] Switch to "Test Office 2" — floor plan re-renders empty.
- [ ] Switch back — XeroFlow HQ floor plan and presence return.

## Network resilience

- [ ] Open DevTools → Network → toggle "Offline" briefly (~5 seconds), then back online.
- [ ] Status badge in header transitions Connected → Connecting → Connected.
- [ ] After reconnect, presence list rehydrates correctly (your own avatar is back, others too).
- [ ] No duplicate avatars on either browser.

## Admin via API (1a — no UI editor yet)

- [ ] Create a zone via API:
      ```bash
      curl -s -b "auth_token=…" -X POST \
        https://<host>/api/office/<office-id>/zones \
        -H "Content-Type: application/json" \
        -d '{"slug":"test","name":"Test Zone","zone_type":"focus","position":{"x":900,"y":500,"w":150,"h":150}}'
      ```
      Returns `{ id }`.
- [ ] Reload `/office` — the new zone appears (live zone updates land in Phase 1c).
- [ ] DELETE the zone via the matching endpoint — gone on next reload.

## Acceptance

- [ ] All above pass.
- [ ] No console errors on the floor plan page in either browser.
- [ ] `pnpm test:run test/server/utils/officeRoom/ test/workers/office-room/` reports 18 passing.
- [ ] Admin can SQL-create / -update / -delete zones and they reflect on next page reload (live zone updates are Phase 1c).
