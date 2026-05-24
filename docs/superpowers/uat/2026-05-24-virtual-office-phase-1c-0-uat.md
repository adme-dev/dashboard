# Virtual Office — Phase 1c.0 UAT

**Date:** 2026-05-24
**Tester:** paul@adme.net.au
**Build under test:** preview deploy of branch `feat/virtual-office-1b-media` (or whichever branch carries Phase 1c.0)

Walk every section. Mark each as ✅ / ❌ / ⚠️ (with a note).

## 1. Cold-load camera prompt — must NOT fire

- [ ] Open `/office` in a fresh browser profile (or after clearing site permissions in dev tools).
- [ ] Observe: NO mic / camera permission prompt appears on initial page load.
- [ ] Console: no `NotAllowedError` or `getUserMedia` lines emitted before user interaction.

## 2. Mic prompt only on zone-enter; camera prompt only on click

- [ ] Click into the Lobby.
- [ ] Observe: mic permission prompt appears (because `initialAudio: true`). Grant it.
- [ ] Camera is OFF by default in the room controls.
- [ ] Click the camera toggle button.
- [ ] Observe: camera permission prompt appears now. Grant it. Camera turns on.

## 3. All team members visible on the floor plan

- [ ] Look at the floor plan — every member of the office is visible at a desk, even offline ones.
- [ ] Offline members render with dimmed avatars (low opacity, no green ring).
- [ ] Online members render bright.
- [ ] If a member is in a meeting room, their avatar is inside that room — their desk is empty until they leave.

## 4. Click an offline avatar → friendly toast

- [ ] Click any offline (dimmed) avatar.
- [ ] Toast: "Offline — they're not in the office right now — try Slack."
- [ ] No knock modal opens.

## 5. Knock-on-person → ad-hoc bubble forms

Two-browser scenario. A = host (you), B = a second authenticated session.
- [ ] B opens `/office` from a second browser, leaves their avatar at their desk.
- [ ] A clicks B's avatar.
- [ ] Toast: "Knocking on [B]… Waiting for response (30s)". A's screen shows the waiting toast with a Cancel button.
- [ ] B's screen: incoming knock modal — "[A] wants to talk to you" + sound.
- [ ] B clicks Accept.
- [ ] Both A and B now in an ad-hoc bubble visible at B's desk on the floor plan. The room panel opens for both with audio (no auto-video).

## 6. Third user knocks the ad-hoc

- [ ] A third browser session C opens `/office`.
- [ ] C sees the ad-hoc bubble at B's desk with A's and B's avatars in it.
- [ ] C clicks the bubble. Confirm modal appears ("Knock on [A, B]?").
- [ ] C confirms. A and B see an incoming knock from C; one of them accepts.
- [ ] C joins the bubble. Now 3 avatars in the bubble.

## 7. Last person leaves → bubble disappears

- [ ] All occupants leave the ad-hoc (close the room panel).
- [ ] Within ~1s (or up to 30s in the alarm-fallback path), the bubble disappears from the floor plan for all observers.

## 8. New member added → desk appears on next page load

- [ ] Via the admin API or the upcoming admin UI, add a new staff member to the office.
- [ ] Reload `/office`.
- [ ] The new member's desk appears in the desks grid with their name. They render offline (dimmed) until they connect.

## Notes

(Capture anything weird, screenshots welcome.)
