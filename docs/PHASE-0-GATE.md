# Phase 0 — Gate

## Implemented
- Dedicated canonical repository: `prdanielcunha/musicscale-live`.
- Independent workspace and deploy boundary from MusicScale.
- Neutral domain contracts and ProviderAdapter boundary.
- Capability naming; LiveCommand / CommandResult; idempotency; Event Bus.
- Public domain compatibility boundary frozen at **v1**; production adapter SDK manifest contract is **v1**.
- Shared MillionsNest Firebase/Auth/Firestore bridge.
- Canonical MusicScale Live Firestore RBAC rules exist in the MillionsNest repository with emulator coverage and an isolated production deploy workflow.
- Dedicated Firebase Hosting target `mn-live-555464791734`, official domain `live.millionsnest.com`, WIF deploy and HTTPS smoke are proven by the production pipeline.
- PT/EN/ES responsive Live + Studio shell.
- Feature flags, telemetry and threat model.
- Transport Broker with direct-lan / local-console / future cloud-relay.
- Public-repository credential guard and canonical CI baseline.
- Provider credentials use the platform SecretStore on the supported public desktop targets: Windows DPAPI and macOS Keychain. Linux remains a beta/testing target and is not part of the signed public trust gate.
- Signed-release workflow is fail-closed and prepared for Windows Authenticode plus macOS Developer ID/notarization.

## External / physical gates still open
- Enforce GitHub branch protection/rulesets for `main` and `production` at repository-admin level. As of 2026-09-27 both branches report `protected: false`.
- Provision the real Windows signing certificate and Apple Developer ID/notarization credentials, then validate trust on target machines.
- Complete the physical Windows+iPad, Windows+Android and two-PC provider matrix.
- Prove Internet/WAN loss while LAN operation remains uninterrupted.
- Prove Live Node/provider restart without duplicated commands.
- Record true command → observed-state p95 and meet the roadmap target.
- Run three complete simulated services and one accompanied real service with evidence.
- Complete real-device responsive, 200% zoom, touch and assistive-technology QA.
- Decide the explicit repository license before treating the public source as redistributable/open-source.

Phase 0 software foundation is complete. **The gate remains open only because the roadmap requires external administration, signing identity and physical/hardware evidence that CI cannot manufacture.**
