# ADR-006: Bind Office Realtime media operations to DO-issued grants

## Status

Proposed

## Date

2026-07-31

## Context

XeroFlow Office has two adjacent but different meeting experiences:

- Staff members enter an Office zone, receive a Cloudflare Realtime session from
  the `OfficeRoom` Durable Object, and publish microphone/camera/screen tracks
  through `useOfficeRealtime`. The composable contains remote-track handling and
  staff-to-staff media is operator-reported live, but the source review did not
  locate an explicit cross-session remote-track pull path.
- External guests enter through an approved lobby request and receive a
  room-scoped guest badge, a short-lived Office WebSocket JWT, live room presence,
  local camera/microphone capture, and local screen capture.

The external guest experience is not yet a live dealer-facing media call. The
guest room page does not connect its captured streams to `useOfficeRealtime`, and
the existing Realtime negotiation routes require an authenticated staff user with
an `office_members.user_id` membership.

There is also a broader authorization issue to address before exposing those
routes to guests. The current proxy checks staff membership and that the supplied
zone belongs to the office, but it does not bind the caller to the supplied
Cloudflare `sessionId`. Cloudflare's Realtime SFU documentation warns that session
and track identifiers must be protected so one caller cannot close or manipulate
another caller's tracks.

The Durable Object is already the authoritative admission point. It validates the
signed Office JWT, enforces guest badge status and approved-zone access, checks
capacity, and creates a participant-specific Cloudflare Realtime session after a
successful `zone:enter`.

## Decision

Keep the existing Cloudflare Realtime SFU Connection API and make the
`OfficeRoom` Durable Object issue a short-lived, signed **Office media grant**
whenever it reserves a participant's Realtime session.

The grant will be bound to:

- `officeId`
- `zoneId`
- `handle`
- `sessionId`
- `isGuest`
- `guestBadgeId` when the actor is a guest
- allowed media operations
- expiry

The Realtime session object sent to the browser will carry the grant and its
expiry. The grant must never be logged, persisted in analytics, or exposed in a
URL.

All browser-side Realtime proxy operations will present the grant as an
`Authorization: Bearer` credential. A shared server-side media principal resolver
will:

1. verify the grant signature and expiry;
2. require the route `officeId` and `sessionId` to match the signed claims;
3. require the request `zone_id` to match the signed `zoneId`;
4. re-check current staff membership for staff grants;
5. re-check guest badge status, expiry, and approved-zone match for guest grants;
6. fail closed before calling Cloudflare when any binding is invalid.

The Durable Object will also own a same-zone published-track registry. After a
browser publishes local tracks, it announces the returned track names over its
already authenticated Office WebSocket. The Durable Object accepts the
announcement only for the participant's reserved session and broadcasts a
signed, room-scoped remote-track capability to other occupants in that zone.

Pulling a remote track will require both:

- the subscriber's media grant, bound to the subscriber session; and
- a remote-track capability, bound to the publisher session, track, and same
  Office zone.

This explicit catalog is required because Cloudflare `autoDiscover` discovers
local tracks in an offered SDP; it does not authorize or signal room-wide remote
track subscriptions.

The same `useOfficeRealtime` state machine and proxy contract will serve both
staff and guests. The external guest room will supply its local camera/microphone
and screen streams, the `connection.mediaSession`, and the media grant to that
composable. Guest media will remain behind a global kill switch and an Office
pilot allowlist until production evidence meets the rollout gates.

## Why this boundary

The Durable Object knows the actor admitted to the room and the exact Realtime
session it created. Signing that relationship once prevents the browser from
substituting a different office, zone, actor, or session identifier.

Using the same grant contract for staff and guests also removes the current
asymmetry where staff cookies authorize media while guest JWTs authorize only
presence. The media proxy remains the only holder of the Cloudflare app secret.

## Alternatives considered

### Use the lobby request ID as the guest media credential

- Smaller implementation change.
- Rejected because the public status flow already exposes the request identifier.
  A request ID is an object reference, not a session-bound capability.
- Would duplicate guest checks across public media endpoints and leave staff and
  guest media on different authorization models.

### Reuse the existing Office WebSocket JWT without a media grant

- Avoids a second signed token.
- Rejected because the WebSocket JWT is issued before the Durable Object creates
  the Realtime session, so it cannot bind the caller to a specific `sessionId`.
- Extending its lifetime would also widen the impact of token leakage.

### Let the browser call Cloudflare Realtime directly with the app secret

- Removes the Nitro proxy.
- Rejected because the Cloudflare app secret must remain server-side.

### Migrate the entire Office meeting stack to RealtimeKit

- RealtimeKit offers higher-level meeting SDKs and UI building blocks.
- Rejected for this rollout because staff media already uses the Realtime SFU
  Connection API. A migration would combine guest enablement with a provider and
  client-stack rewrite, increasing regression and rollback risk.
- RealtimeKit may be reconsidered separately if XeroFlow needs managed meeting
  primitives that outweigh preserving the current staff implementation.

### Create a shared Cloudflare session for each zone

- Could appear simpler conceptually.
- Rejected as a change to the current model. The implementation creates one
  Cloudflare session per participant. The guest rollout should first capture how
  the reported staff path connects those sessions at runtime, then prove and
  harden the participant-session model.

## Consequences

- `OfficeMediaSession` becomes a sensitive capability-bearing object.
- The Durable Object must retain enough per-participant session state to refresh a
  media grant without creating a new Realtime session.
- The Durable Object becomes the same-zone signaling registry for published track
  names and signed remote-track capabilities.
- `useOfficeRealtime` must support an injected authorization value and refresh
  grants before operations after expiry.
- `useOfficeRealtime` must explicitly pull remote tracks using the publisher
  `sessionId` and `trackName`, then renegotiate the subscriber session.
- Staff media proxy tests must gain wrong-session, wrong-office, wrong-zone, and
  expired-grant cases, not only membership checks.
- Guest revocation continues to take effect on every WebSocket message and will
  also take effect on every subsequent media proxy operation.
- Existing peer connections may carry media until the browser or provider closes
  them. Revocation and host-end flows must therefore actively close guest tracks
  and the local peer connection, not rely only on denying future API calls.
- Marketing must continue describing external video meetings as rollout work
  until the production gates in the rollout plan are complete.

## Security invariants

1. No Cloudflare app secret reaches a browser.
2. No media operation accepts a raw `sessionId` as sufficient authority.
3. A guest grant is valid for exactly one office, approved zone, actor, and
   Realtime session.
4. Revoked or expired guest badges cannot publish, subscribe, renegotiate, or
   close tracks.
5. A guest cannot move media to another Office zone.
6. A subscriber cannot pull a track without a signed publisher capability for
   the same Office zone.
7. SDP, bearer grants, device labels, and raw tokens are excluded from logs and
   audit metadata.
8. Recording and transcription remain separate, explicit consent gates.

## References

- [Dealer guest video meeting rollout](../superpowers/plans/2026-07-31-dealer-guest-video-meeting-rollout.md)
- [Cloudflare Realtime SFU Connection API](https://developers.cloudflare.com/realtime/sfu/https-api/)
- [Cloudflare Realtime SFU limits and timeouts](https://developers.cloudflare.com/realtime/sfu/limits/)
- `workers/office-room/src/OfficeRoom.ts`
- `app/composables/useOfficeConnection.ts`
- `app/composables/useOfficeRealtime.ts`
- `app/pages/lobby-room/[officeId]/[requestId].vue`
- `server/utils/officeRealtimeAccess.ts`
