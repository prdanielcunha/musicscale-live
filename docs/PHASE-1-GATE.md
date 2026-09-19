# Phase 1 — LAN / Offline Gate

## Implemented

- Live Node HTTP runtime with health and capability discovery.
- Pairing challenge with expiring PIN.
- Persistent token hashing; revocation; rate limiting; environment/venue/system binding.
- Recovery devices can inherit an already-bound Node scope without cloud auth.
- Heartbeat, reconnect/backoff and observed provider state.
- Transport Broker:
  - direct LAN;
  - same-origin Local Console fallback;
  - cloud relay remains disabled.
- Local Network Access request support where the browser exposes it.
- Same-origin PWA served by the Live Node.
- Local Recovery shell that bypasses Firebase auth when operating from the Node.
- Crash-recovery runtime state with monotonic revision.
- Cached ServicePlan and ProviderLinks.
- Active service item persisted as commands run.
- QR handoff from production PC to tablet/cellphone.
- Local-only provider setup surface.
- Redacted local diagnostic export.
- Single-executable SEA build pipeline.
- Windows alpha installer with user autostart + private-network firewall onboarding.
- macOS alpha installer with LaunchAgent autostart.
- Manual native-runner packaging matrix for Windows x64, macOS arm64 and Linux x64.
- SHA-256 manifest included with each alpha artifact.
- Automated tests for pairing scope, persistence, crash recovery, network policy, diagnostics and provider config.

## Offline operating path now implemented

`MusicScale scale → provider preflight → ProviderLinks → cached ServicePlan → Local Recovery → provider command`

The cloud is no longer a hard runtime dependency after the plan has been prepared locally.

## Gate still required before declaring Phase 1 production-ready

- Execute and validate the native packaging matrix from the canonical repository.
- Add Authenticode signing on Windows and Developer ID + notarization on macOS before public installer distribution.
- Add signed, verified auto-update only after signing identities and release policy are ready.
- Replace private-file provider token fallback with OS credential vault on supported platforms.
- Real LAN test on:
  - Windows production PC + iPad;
  - Windows production PC + Android tablet;
  - macOS production machine + iPad.
- Physical internet-cut test during an active session.
- Firewall onboarding and diagnostics.
- Decide/validate mDNS or equivalent zero-typing discovery; QR handoff is the current reliable path.
- Measure command latency and reconnect thresholds on real worship setups.

## Next engineering slice

Run the packaging matrix and physical LAN/offline certification, then continue provider validation against real Holyrics, Resolume Arena and ProPresenter installations. The provider-neutral domain must not change to accommodate one product.
