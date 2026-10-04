# MusicScale Live — Release Candidate 0.1.0-beta.3

## Purpose

This candidate promotes the current owner-tested beta to the production channel while keeping the physical/signing certification facts explicit. It is **owner-authorized beta production**, not stable/commercial certification.

## User-facing improvements

- Human Live Node display name is preserved from computer setup to paired mobile/tablet control.
- Provider-targeted commands are capability-checked before dispatch.
- Human-readable provider failures replace raw capability error codes.
- MusicScale service order can explicitly synchronize to a compatible Holyrics/provider playlist with guarded confirmation.
- Universal search opens and focuses the correct live tool on touch devices.
- Bible operation includes fast Book → Chapter → Verse navigation inspired by presentation-software workflows while keeping provider-returned Bible content authoritative.
- A touch-first Smart Operator Dock keeps Search, Bible, Run of Show and the context-aware primary action one thumb away.
- The primary action adapts to the live state: show prepared content, advance the next slide, or prepare the next service item.

## Automated gate

The candidate must pass:

- brand contract;
- UI accessibility contract;
- release/install contract;
- TypeScript typecheck;
- reliability tests;
- unit and contract tests;
- Firestore RBAC emulator tests;
- PWA + Live Node build;
- Windows/macOS/Linux beta package smoke.

## Production authorization mode

The project owner explicitly requested production deployment on 2026-10-04. The certification manifest therefore records `owner-beta-authorized`.

This mode:

- permits production deployment of the beta after automated gates pass;
- does **not** fabricate physical, signing or administrative evidence;
- does **not** mark the build stable/commercial approved;
- preserves all certification evidence slots for later completion.

Stable/commercial approval still requires the full physical/signing/admin evidence gate.
