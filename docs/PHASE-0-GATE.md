# Phase 0 — Gate

## Implemented
- Dedicated canonical repository: `prdanielcunha/millionsnest-live`.
- Independent workspace and deploy boundary from MusicScale.
- Neutral domain contracts and ProviderAdapter boundary.
- Capability naming; LiveCommand / CommandResult; idempotency; Event Bus.
- Shared MillionsNest Firebase/Auth/Firestore read bridge.
- PT/EN/ES responsive Live + Studio shell.
- Feature flags, telemetry and threat model.
- Transport Broker with direct-lan / local-console / future cloud-relay.
- Public-repository credential guard and canonical CI baseline.

## External/repository gate still open
- Dedicated Firebase Hosting target/deploy validated from this repository.
- Final shared RBAC contract for Live cloud roles.
- Firestore rules + emulator tests before enabling any Live cloud writes.
- Real-device responsive/browser QA.
- Freeze/version public domain contracts.
- Decide explicit repository license before treating the public source as redistributable/open-source.

Phase 0 engineering foundation is complete enough to support continued Phase 1/2/3 work. Production readiness still depends on the external gates above.
