# MusicScale Live — Execution Plan 2026-09-23

This document converts the **Avaliação e Roadmap** dated 2026-09-23 into an engineering execution contract for the current repository. It complements the Master Blueprint v0.1 and does not weaken any previously frozen architecture decision.

## Non-negotiable delivery rule

The roadmap is executed by **quality gates, in order**. A later phase may be researched or have a spike behind a feature flag, but it is not considered active/complete while an earlier gate is open.

The operational invariant remains:

```
MusicScale → ServicePlan / ProviderLinks → Live Node
           → routed provider(s) → TAKE → observed state
```

The critical path must work without cloud, AI, or Internet after the service is prepared.

## Technology decisions for the current cycle

### Keep

- **TypeScript end to end** for neutral contracts, adapters, Node and PWA.
- **React + Vite PWA** for Live/Studio, with route/surface code splitting during the UI performance phase.
- **Node.js 24 Live Node** for the current certification cycle. Do not change runtime major while Phase 0 is proving reliability.
- **Provider + Capability contracts** as the only way UI/domain discover provider behavior.
- **Local JSON state with atomic temp-file + rename** for small operational recovery state until a measured need for an embedded database appears.
- **Firestore** for shared cloud state, configuration, collaboration and history — never as the authority for what is currently on air.
- **GitHub Actions** as merge/release quality gate.
- **Local Recovery** as the browser path that survives cloud failure.
- **Structured event log + correlation IDs** as the source for incident review and later analytics.

### Introduce deliberately

- **Persistent idempotency ledger** for completed commands/scenes, with TTL and atomic persistence. This closes the restart/retry replay gap.
- **Single Sync Engine + durable Outbox** in Phase 1. UI components must not each invent their own Firestore retry/conflict rules.
- **Explicit sync state machine**: Local → Pending → Synced / Offline / Conflict / Failed.
- **OpenTelemetry metrics/traces on the Live Node** after the Phase 0 local metrics baseline is stable. Existing structured logs remain the audit source; do not depend on experimental browser telemetry for the critical path.
- **OS-backed SecretStore abstraction** before stable public distribution. Provider secrets must move out of plaintext local JSON after a platform spike proves Windows + macOS behavior with the packaged Node.
- **Signed installer/update chain** as a release gate, not as an optional polish item.

### Avoid

- New database/runtime/framework migrations during Phase 0 without a gate-level need.
- Cloud transactions as the offline execution mechanism.
- Browser-to-provider secrets.
- AI in TAKE, authorization, provider truth, or automatic live execution.
- UI automation/robotization as a production provider API.
- Media transport through the cloud when LAN/media infrastructure already carries the signal.

---

# Phase 0 — Proven reliability

**Status:** ACTIVE.

## Required deliverables

| Requirement | Repository status | Work |
| --- | --- | --- |
| Certify MusicScale → plan → Node → provider → TAKE → observed state | Code path exists | Physical certification open |
| Search/music/Bible/playlist/black/create/reconnect/restart | Implemented substantially | Run full matrix on real providers |
| Internet-cut continuity | Local Recovery + cached plan exist | Physical WAN-cut proof open |
| Windows+iPad / Windows+Android / two-PC matrix | Packaging exists | Physical execution open |
| Latency/error measurement | Command results/events carry latency/error; local certification JSON report implemented | Collect physical command→observed p95 and attach report |
| CI before merge | CI exists | Keep Phase 0 reliability gate mandatory |
| main/production protection | CI exists; repository policy is not enforced in code | Enable repository ruleset/branch protection |
| Signed installer/update | Alpha installer exists | Certificates/notarization/update signing open |
| Secrets in OS vault | Local-only 0600 file exists | SecretStore migration open |
| No duplicate command after reconnect/restart | **Persistent idempotency implemented in this branch** | CI + physical restart proof |

## Acceptance evidence

A secret-free local certification report can now be exported from the Live Node console to capture software-measurable evidence without pretending to certify hardware-only conditions.

Phase 0 is not closed until all are recorded:

1. Three complete simulated services without blocking failure.
2. One accompanied real service.
3. No duplicate command after retry/reconnect/Node restart.
4. Prepared service remains locally operable during Internet loss.
5. Local command-to-observed-state p95 below 300 ms in the certified topology.
6. Installer/update trust chain validated on target OS.
7. Provider credentials stored through the approved OS secret mechanism.
8. CI required before main/production merges.

---

# Phase 1 — Cloud and true realtime sync

**Status:** FOUNDATION IMPLEMENTED BEHIND THE PHASE 0 GATE; cloud writes remain feature-gated until production Rules/RBAC and physical reliability evidence are approved.

A single synchronization subsystem now replaces scattered Firestore writes for the first collaborative entities.

Core design:

```
local mutation
  → apply to local authoritative/cache state
  → append Outbox mutation {id, entity, version, actor, origin, createdAt}
  → background sync
  → Firestore acknowledgement of exact version
  → Synced

offline/error
  → retain Outbox
  → exponential backoff + jitter
  → retry with the same mutation id

remote update
  → listener
  → compare version/baseVersion
  → merge policy or Conflict
```

Policies must be defined per entity. Provider credentials never enter this system.

Implemented in code: durable IndexedDB Outbox; exponential retry/backoff; version/origin/actor/time metadata; Firestore transaction transport; local/pending/synced/offline/conflict/failed states; explicit conflict resolution and retry UI; realtime scene/request/presence/service-plan listeners; append-only change history and restore entry point; isolated Firestore RBAC emulator rules with secret-field rejection.

Gate remains open until cloud writes are enabled in an approved environment and the offline → reconnect → conflict matrix is physically certified: every visible mutation has a truthful sync state; offline edits synchronize without duplication; conflicts are reproducible and resolvable.

---

# Phase 2 — Premium accessible interface

**Status:** CODE FOUNDATION IMPLEMENTED BEHIND THE PHASE 1 GATE; visual/device certification remains open.

The legacy 5–10 px typography debt has been removed from the stylesheet and a permanent UI contract now prevents regressions below the accessibility floor. Major Live/Studio surfaces are split into lazy chunks so unopened workspaces do not inflate the initial bundle.

Targets:

- functional text ≥ 14 px;
- metadata ≥ 12 px;
- touch targets ≥ 44×44 px;
- WCAG AA baseline and 200% zoom;
- TAKE fixed and always reachable;
- no layout shift around critical controls;
- lazy chunks for Studio, Live, Bible, Media, Scenes and Diagnostics;
- virtualized long lists;
- shared design tokens instead of local one-off typography/spacing rules.

Implemented in code: 543 legacy font-size declarations below 12 px raised to the 12 px metadata floor; global 14 px functional-control floor; 44×44 px touch-target token enforced for buttons/inputs/selects/textareas; focus-visible and reduced-motion rules; a CI contract rejects future sub-12 px typography; Studio/Live/Media/Scenes/Diagnostics and supporting system panels now use React lazy chunks with a stable loading surface.

Gate remains open for real-device 200% zoom, screen-reader and touch QA: no functional copy below 12 px, critical controls survive 200% zoom, keyboard/screen-reader paths work, initial bundle excludes unopened surfaces.

---

# Phase 3 — Five-minute onboarding

**Status:** BLOCKED BY PHASE 2 GATE.

Use discovery + human naming + QR/PIN + safe connection test. IP/port/token stay in Advanced only. Add plain-language diagnosis for guest Wi-Fi/client isolation.

Gate: untrained user completes first pairing in ≤ 5 minutes without terminal, Git, IP or port.

---

# Phase 4 — Exception-based preparation

**Status:** BLOCKED BY PHASE 3 GATE.

Reconcile plan/playlist in background. Collapse healthy items. Match songs by normalized title/artist/version/lyrics/fingerprint/history. Explain confidence and allow safe batch confirmation. Validate media, Bible, tone/BPM metadata, routes, outputs and offline cache.

Gate: normal service with no exceptions prepared in ≤ 2 minutes.

---

# Phase 5 — Definitive Live cockpit

**Status:** BLOCKED BY PHASE 4 GATE.

First fold: NOW, NEXT, TAKE, timeline, universal search entry and compact health. Selecting always prepares NEXT; only TAKE executes. Provider observed state is the only source of NOW truth.

Gate: ≥ 90% normal actions require one click/key after NEXT selection; TAKE stays in the same location across supported breakpoints.

---

# Phase 6 — Universal search and commands

**Status:** BLOCKED BY PHASE 5 GATE.

Local index first for prepared/offline content. Federate songs, Bible, media, scenes, text and deterministic commands. Search may understand aliases/typos; results never execute directly.

Gate: local-index response < 150 ms and search works with Internet unavailable.

---

# Phase 7 — Collaboration during service

**Status:** BLOCKED BY PHASE 6 GATE.

Temporary role QR sessions, structured requests, presence, contextual comments and a state machine:

`sent → seen → accepted → prepared → executed | rejected`.

Gate: requests never reach air without policy + preparation + TAKE; all participants observe the same request status.

---

# Phase 8 — Controlled AI

**Status:** BLOCKED BY PHASE 7 GATE.

Create a server-side AI Gateway with structured schema validation, timeout, cache, redaction, audit, per-organization budget, circuit breaker and deterministic fallback. Model choice is benchmark-driven and may change without affecting domain contracts.

Allowed first uses: diagnostic explanation, song matching assistance, request classification/deduplication, natural-language search preparation, metadata normalization and post-service summary.

Forbidden: AI executing TAKE, authorizing users, or asserting what is on air.

---

# Phase 9 — Smart rehearsal

**Status:** BLOCKED BY PHASE 8 GATE.

Simulate the full plan without provider writes, validate dependencies/cache/routes/output/permissions, then offer a separately armed safe-output rehearsal.

Gate: every detectable blocker appears before Live and simulation emits zero real commands.

---

# Phase 10 — Post-service review

**Status:** BLOCKED BY PHASE 9 GATE.

Use immutable operational events to compare planned vs actual, skipped/added items, requests, failures, reconnections and manual intervention. Convert relevant technical failures into actionable setup tasks.

Gate: review is immediately available after session close and respects retention/organization permissions.

---

# Phase 11 — Production ecosystem

**Status:** BLOCKED BY PHASE 10 GATE.

Add OBS, Companion, OSC, MIDI, ATEM, vMix and Art-Net/DMX through adapters/capabilities only; Audio Profiles and human aliases; adapter SDK; controlled templates/marketplace; backup/restore; Live Node redundancy; fleet/multi-venue operations.

Gate: new adapters require no vendor conditionals in core domain; failover keeps plan and does not duplicate commands; fleet remains tenant isolated.

---

# Engineering cadence

- Every PR maps to one active gate and includes evidence.
- Every merge requires typecheck, tests and build.
- Physical test at least weekly during reliability/onboarding/provider gates.
- Release candidate only with a runbook and recorded evidence.
- A merged feature is not equivalent to a passed phase.
- Later-phase spikes stay isolated and cannot weaken the active gate.

## Current next actions

1. Execute the physical E2E matrix using the existing certification runbook and attach the new local certification JSON.
2. Collect the true command → observed-state p95 on the certified topology.
3. Validate signed installers/notarization on target Windows/macOS machines with production certificates.
4. Enforce repository branch/ruleset protection at repository-admin level.
5. Run three complete simulated services and one accompanied real service with recorded evidence.
6. Keep cloud writes and later-phase flags off in general production until the active gates are certified.
