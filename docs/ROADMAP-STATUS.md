# Blueprint v0.1 — Implementation Status

This document tracks engineering progress against the **MusicScale Live Blueprint Mestre v0.1**. It is a status map, not a replacement for the blueprint.

Status labels:
- **foundation-ready**: core implementation exists; production gates may still require hardware/external validation.
- **partial**: meaningful implementation exists, but the blueprint phase is not complete.
- **not-started**: no production-significant implementation yet.

## Phase 0 — Foundation & Product Contract
**Status: foundation-ready**

Implemented: dedicated repository/deploy boundary; neutral Provider/Capability domain; Event Bus, command/idempotency/error contracts; PT/EN/ES Live/Studio foundation; threat model, telemetry, secret guard and CI; dedicated Firebase Hosting and production release pipeline.

Open: final cloud RBAC + Firestore Rules before broader Live writes; public contract versioning; real-device responsive QA.

## Phase 1 — Live Core + Node
**Status: foundation-ready / physical certification open**

Implemented: Live Node runtime; scoped pairing/revocation/rate limiting; LAN + same-origin Local Recovery; cache/crash recovery/reconnect; provider routing; diagnostics; SEA packaging/alpha installers; offline ServicePlan/ProviderLinks; QR handoff; human-first zero-config onboarding; best-effort LAN peer discovery with PIN trust; manual IP/port moved to Advanced fallback; completed command/scene idempotency is now persisted locally with TTL and atomic writes, and concurrent retries with the same key are coalesced so a Node restart or retry does not replay an already-finished provider action.

Implemented additionally in the active reliability branch: Windows provider-token protection uses CurrentUser DPAPI before the token is persisted, including migration of legacy plaintext Holyrics tokens; Windows CI exercises a real protect/unprotect round trip. This avoids adding a fragile native addon to the current SEA package.

Open: native packaging certification; Windows/macOS/iPad/Android physical matrix; physical verification of multicast discovery across common church routers/APs; guest-network/client-isolation diagnostics; internet-cut test; signing/notarization; signed auto-update; macOS Keychain backend / final cross-platform OS credential-vault certification; branch protection enforcement at repository policy level.

## Phase 2 — Holyrics Deep Provider
**Status: partial; deep adapter implemented, hardware gate open**

Implemented: probe/capabilities; presentation navigation/state/clear/screen modes; song search/present/matching; playlist operations; automatic MusicScale playlist reconciliation for add/remove/reorder; structured operator change notices; official loopback create-song handoff with MusicScale lyrics/title/artist/key/BPM and post-save detection; Bible search/present; media search/open; stage messages; observed-state polling/reconnect.

Open: real supported Holyrics versions; same/cross-PC latency; physical validation of automatic playlist reconciliation and create-song flow; real display/playlist/media/Bible behavior; physical internet-cut test. Fully headless song save remains unavailable through the documented public popup-create API and must not be simulated with fragile UI automation.

## Phase 3 — Live UX Production
**Status: partial, advanced**

Implemented: provider-neutral NOW/NEXT; Program/Preview/TAKE; prepared song/Bible/media cues; linked presentation + visual TAKE via Scene; ServicePlan horizon; routing ambiguity warning; guarded clear/safety; keyboard shortcuts; provider health/observed state; request/scene surfaces; responsive Local Recovery; adaptive touch/operator workspace for iPad/iPhone orientations; focused Studio sections for overview, preparation, computers, routes, inputs/outputs, scenes and diagnostics; guided Studio home that turns Node/provider/service readiness into one explicit next-best action; the same next-best action now persists in the Studio header so the operator does not need to return to Overview; Studio navigation uses progressive disclosure with preparation/library as the default path and technical system areas collapsed until needed; health is condensed into a persistent status capsule outside Overview; automatic read-only preflight on Prepare, contextual readiness guidance, progress feedback, and a direct handoff into Live once the ServicePlan is cached locally, while playlist replacement remains an explicit guarded action; accessibility foundation with semantic primary navigation, skip-to-content, visible keyboard focus, reduced-motion support and localized labels; operator Command Bar can be focused instantly with Ctrl/⌘ K or / without hunting through the interface.

Open: volunteer usability without Studio; iPad/Android touch QA; layout/latency measurement; Pastor/Conductor acceptance against live providers; formal accessibility certification and assistive-technology QA.

## Phase 4 — Media, Live Drop & Collaboration
**Status: partial, Live Drop + Universal Library foundation implemented**

Implemented: provider media search/open; prepared media cue + thumbnail support; actionable Request Center with explicit accept → prepare → execute flow; Bible requests can resolve through `bible.search` and require an explicit operator TAKE through `bible.present`; media requests can now search executable providers plus approved Live Drop cache, present operator-selectable candidates with thumbnails/metadata and require explicit TAKE before `media.open`; message requests can be sent through `stage.message` only when that capability is genuinely available; section requests can read structured markers from the routed presentation provider, rank likely destinations and require explicit operator selection + guarded TAKE through `presentation.navigation`; structured system notices for playlist changes; ServicePlan domain supports non-song items; neutral signal-topology model for Sources / Inputs / Outputs; Live Drop LAN upload from desktop/mobile; extension + MIME validation; bounded streaming transfer; SHA-256 fingerprinting; Node-local quarantine; explicit operator approve/reject; approved local cache for offline use; guarded scope by paired organization/venue/live-system; direct open into local media providers; automatic paired-Node replication when the selected media provider runs on another production computer; peer-side size/hash verification, ready-copy dedupe and post-transfer open; editable Node-local Live Drop retention presets for service/day, week and keep-approved modes, persisted across Node restarts and reapplied to current assets; provider-neutral Universal Media Library that aggregates approved Live Drop cache with searchable media exposed by all connected `media.search` providers, preserves source/provider identity and uses an explicit double-confirm open path; PT/EN/ES responsive Studio/Live request surfaces.

Open: richer Live Drop preview/transcoding; permission/RBAC controls for storage-policy administration; cloud/shared media source adapters and richer metadata/indexing for the Universal Library; complete neutral Announcement/Message domain; physical validation of section-marker quality across Holyrics/ProPresenter song structures; collaboration physical E2E across pastor/conductor/operator devices; physical cross-node throughput/latency validation with real church media files.

## Phase 5 — Resolume Arena Tier A
**Status: partial; adapter implemented, hardware gate open**

Implemented: dedicated Visual adapter; REST configuration; composition/layer/clip state; trigger/open capabilities; thumbnail/monitor snapshot capabilities where exposed; visual routing; armed visual cue; linked TAKE; independent health/state.

Open: REST/WebSocket real-version validation; Holyrics PC → Arena PC → LED physical topology; final-output snapshot; effects/parameters safety; section-to-visual persistence; restart/offline degradation.

## Phase 6 — ProPresenter Tier A
**Status: partial; adapter implemented, hardware gate open**

Implemented: neutral adapter; Network API probe/state; current/next/cue navigation; clear; stage messages; macro trigger; explicit routing with multiple presentation providers.

Open: Windows/macOS hardware matrix; same/cross-PC LAN; playlist/library capability coverage by version; preview/layer behavior; restart/reconnect/internet-cut.

## Phase 7 — Automation & Production Ecosystem
**Status: partial**

Implemented: Scene domain/Studio/cache/execution; action offsets; parallel multi-provider actions; completed/partial/failed results; guarded/critical confirmation; linked presentation + visual orchestration; read-only scene rehearsal that validates live provider availability, explicit targets, configured routes, capability resolution, safety level and action offsets without sending commands.

Open: trigger/condition engine; sequential/retry/timeout/fallback/rollback policy; deeper rehearsal simulation of conditional branches; OBS; OSC/MIDI; later ATEM/vMix/Art-Net/DMX/Companion; automation audit UX.

## Phase 8 — Audio/Output Intelligence
**Status: not production-significant yet**

Foundation: capability/routing model already carries audio/output abstractions and Node can host device APIs.

Open: OS device enumeration; human aliases; Audio Profiles; safety lock; output diagnostics; media/control path latency.

## Phase 9 — Intelligence, Analytics & Platform
**Status: not started as a production feature**

Foundation: deterministic command/event/observed-state model can become the factual source for analytics and AI.

Open: planned-vs-actual analytics; Service Review; preparation copilot; policy-bound natural-language preparation; templates; Provider SDK; adapter marketplace/Live Packs; enterprise redundancy/fleet/multi-venue.

## Current engineering priority

Do not skip ahead to autonomous “wow” automation.

The next product proof remains:

`MusicScale → ServicePlan/ProviderLinks → Live Node → routed provider(s) → TAKE → observed state`

Validate it on real LAN hardware, prove zero-typing discovery/pairing across multiple computers, then cut internet and prove that the prepared service keeps operating locally. The current church topology — Holyrics on one PC, Resolume Arena on another, final LED/output downstream — is a certification profile, not a hard-coded architecture.
