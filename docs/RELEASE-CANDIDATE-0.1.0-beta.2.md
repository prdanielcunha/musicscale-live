# MusicScale Live — Release Candidate 0.1.0-beta.2

## Purpose

This candidate freezes the software implementation frontier reached after the
2026-09-23 execution roadmap through Phase 11. It is a **certification build**,
not a claim that the physical reliability gate has passed.

## Included software foundation

- LAN-first Live Node and Local Recovery.
- Holyrics, Resolume Arena and ProPresenter provider adapters.
- Provider-observed NOW state and guarded NEXT → TAKE flow.
- Durable idempotency and restart/reconnect protection.
- Central realtime Sync Engine/Outbox with explicit sync states and conflict handling.
- Accessible/lazy Live + Studio UI baseline.
- Five-minute onboarding foundation with human computer names, discovery, QR/PIN and safe self-test.
- Exception-first preparation and deterministic song matching.
- Guarded Live cockpit and local-first universal search.
- Collaboration request lifecycle and expiring least-privilege temporary roles.
- Controlled server-side AI assist with deterministic fallback and no TAKE authority.
- Zero-write smart rehearsal and volunteer training.
- Factual post-service review and guarded next-service drafting.
- Production adapter SDK plus OBS, vMix, OSC and Art-Net/DMX; local bridge contracts for Companion, MIDI and ATEM.
- Audio Profiles, production templates, secret-free backup/restore, standby preparation, explicit manual failover and tenant-scoped fleet views.
- Windows DPAPI and macOS Keychain provider-secret storage.
- Public domain contract v1 and adapter SDK contract v1.

## Automated gate

The candidate is mergeable only after:

- brand contract;
- UI accessibility contract;
- release/install contract;
- TypeScript typecheck;
- Phase 0 reliability tests;
- all unit/contract tests;
- Firestore RBAC emulator tests;
- PWA + Live Node build;
- Windows x64 beta package smoke;
- macOS arm64 beta package smoke;
- Linux x64 beta package smoke.

## Physical gate still required

Do not promote this candidate to the `production` branch until evidence is attached for:

1. Windows + iPad.
2. Windows + Android.
3. Two-PC Holyrics + Resolume Arena topology.
4. ProPresenter-only topology.
5. Internet/WAN cut while LAN execution continues.
6. Live Node restart without automatic command replay.
7. Provider failure/reconnect isolation.
8. True command → observed-state p95 below the roadmap threshold.
9. Three complete simulated services without blocking failure.
10. One accompanied real service.
11. Volunteer usability without IP/port/token/technical setup.
12. Signed Windows installer trust and signed/notarized macOS package trust on target machines.

## Administrative release gate

Before stable/commercial promotion:

- enable branch/ruleset protection for `main` and `production`;
- require the canonical CI checks for merge;
- provision the real Windows Authenticode and Apple Developer ID/notarization credentials;
- decide the repository license before any redistribution/open-source claim.

## Promotion rule

`production` is advanced only after the physical and administrative evidence
is real. A green CI run proves software reproducibility; it does not fabricate
hardware, network, provider-version or code-signing evidence.
