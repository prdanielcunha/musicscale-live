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

**Status:** CODE FOUNDATION IMPLEMENTED; physical timing acceptance remains behind the Phase 3 gate.

Preparation now collapses healthy song rows by default and leaves exceptions visible. Song matching is deterministic and explainable: normalized title/artist, arrangement/version, optional lyrics fingerprint and locally confirmed history contribute to a bounded confidence score. Automatic linking is reserved for high-confidence, clearly separated candidates; uncertain candidates remain explicit operator choices with score visibility. Key/BPM continue into the prepared ServicePlan, while ProductionPreflight validates provider/routes/output/cache readiness.

Gate remains open until a normal no-exception service is physically prepared in ≤ 2 minutes on the certified provider matrix.

---

# Phase 5 — Definitive Live cockpit

**Status:** CODE FOUNDATION IMPLEMENTED; physical operator acceptance remains behind the Phase 4 gate.

The cockpit keeps NOW/NEXT/TAKE/timeline/search/health in the primary flow. Provider-observed state remains NOW truth. Selection prepares; TAKE executes. Critical TAKE paths now use a short duplicate-action fence and progressive haptic feedback where supported. Previous/Next/TAKE shortcuts are locally configurable, collision-safe and route through the same visible guarded actions.

Gate remains open: ≥ 90% normal actions require one click/key after NEXT selection; TAKE stays in the same location across supported breakpoints.

---

# Phase 6 — Universal search and commands

**Status:** LOCAL-FIRST FOUNDATION IMPLEMENTED; performance/device acceptance remains behind the Phase 5 gate.

A persistent browser-local index now seeds from the prepared ServicePlan, ProviderLinks, cached Scenes, approved Live Drop assets, deterministic commands and recent/frequent selections. Matching is accent-insensitive, typo-tolerant, alias-aware and boosts prepared/recent content. Local hits appear before provider/network search. Enter prepares a strong local hit; selection never executes directly. A separate TAKE executes the prepared hit, including cached scenes and deterministic commands.

Gate remains open for measured p95: local-index response < 150 ms and search works with Internet unavailable.

---

# Phase 7 — Collaboration during service

**Status:** CODE FOUNDATION IMPLEMENTED; realtime multi-device acceptance remains behind the Phase 6 gate.

The collaboration contract now uses the explicit request lifecycle:

`sent → seen → accepted → prepared → executed | rejected`.

Node, cloud sync and Firestore rules validate allowed transitions instead of trusting UI state. Song/Bible/media/message/section requests remain requests only: the operator must accept, prepare and use TAKE before output changes. Urgent priority is controlled, comments can stay attached to the related request/service item, and temporary pastor/conductor role sessions use expiring least-privilege grants with local QR join support.

Gate remains open for physical multi-device proof: temporary sessions expire at service end/TTL, participants converge on the same request state in realtime, and no request reaches air without policy + preparation + TAKE.

---

# Phase 8 — Controlled AI

**Status:** SERVER GATEWAY + EXPLAINABLE UI FOUNDATION IMPLEMENTED; provider-secret rollout and feature acceptance remain behind the Phase 7 gate.

The AI path is server-only and provider-neutral from the Live PWA perspective. The backend validates Firebase identity and MusicScale organization access, redacts obvious PII/secrets, validates structured JSON output, applies an 8-second default timeout, short-lived cache, per-organization monthly request budget, circuit breaker, deterministic fallback and an audit record with model/token/latency/estimated-cost metadata. The browser never receives the model API key.

The current default is Gemini 3.5 Flash-Lite, with Gemini 3.8 Flash reserved for larger/complex inputs. Both model names remain environment-configurable so the domain contract does not depend on a model generation.

The first visible assist surfaces explain deterministic diagnostics, pre-service rehearsal risks and post-service facts. The gateway contract also supports song-match assistance, request classification/deduplication, natural-language search interpretation and metadata normalization without giving AI authority to mutate Live state.

Forbidden by code/prompt contract: AI executing TAKE, authorizing users, manufacturing provider state, or asserting what is on air without supplied observed evidence.

Gate remains open until the production model credential is provisioned server-side, organization budgets are exercised, fallback is verified with the provider unavailable, and outputs are acceptance-tested in PT/EN/ES.

---

# Phase 9 — Smart rehearsal

**Status:** DETERMINISTIC ZERO-WRITE REHEARSAL + VOLUNTEER TRAINING FOUNDATION IMPLEMENTED BEHIND FEATURE FLAG; safe-output/physical acceptance remains gated.

The full prepared ServicePlan can be simulated in pure domain code without calling any provider. The simulator validates item identity, offline provider links, provider health/capabilities, route ambiguity/invalid targets, cached scenes, scene action targets, output declarations and known offline-media cache identity/readiness. Explicit media references that are absent from the local cache are blockers; remote-only references without a verified local identity remain warnings rather than invented facts.

Studio surfaces the report behind `VITE_LIVE_SMART_REHEARSAL`, records `simulatedCommands: 0`, and now includes a volunteer training mode that walks the prepared service item-by-item while preserving zero writes to providers.

A separately armed safe-output rehearsal may execute only after the preceding physical gates are certified and must remain distinct from zero-write simulation/training.

Gate remains open for real-device proof: every detectable blocker is surfaced before Live, simulation/training emit zero provider commands, and any later safe-output rehearsal is verified on the certified output matrix.

---

# Phase 10 — Post-service review

**Status:** FACTUAL REVIEW, CORRECTION ACTIONS AND NEXT-SERVICE DRAFT FOUNDATION IMPLEMENTED BEHIND FEATURE FLAG; physical/retention acceptance remains gated.

The pure domain review compares the prepared ServicePlan with immutable Live Node events. It distinguishes executed items, items explicitly marked skipped, and items that were simply **not observed**. It reports ad-hoc run-of-show actions, the Phase 7 request lifecycle, provider failures, event origins and provider latency facts.

Planned duration is compared only with factual event windows when enough timestamps exist; missing timing evidence remains unknown. Provider failures become deterministic correction actions, and elevated provider-response p95 is explicitly labeled as a provider-response signal rather than the full command-to-observed latency gate.

Studio can create an explicit next-service local draft from the reviewed plan only after the operator supplies the next date/time. The clone receives a fresh plan/item identity, revision 1, planned item states and provenance metadata, while preserving known provider links for later review. It is blocked while a Live session is active. The Studio surface remains behind `VITE_LIVE_SERVICE_REVIEW`.

The review deliberately does not infer motive, cause or responsibility. AI may summarize these facts behind its separate guardrail but cannot change the report or execute remediation.

Gate remains open: review availability after session close, retention/organization permission validation and physical confirmation of correction usefulness.

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
