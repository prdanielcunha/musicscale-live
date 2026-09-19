# MillionsNest Live — Brand Migration Contract

## Decision

The product brand is **MillionsNest Live**.

MusicScale remains the worship/repertoire/scheduling product and an important upstream source of service plans, while MillionsNest Live is the broader live-production control layer for churches.

Official web address:

- `https://live.millionsnest.com`

Dedicated Firebase Hosting site:

- `mn-live-555464791734`

## Compatibility contract

The rename must not break an existing church installation.

For at least the alpha/beta migration window:

- the Live Node accepts both `MILLIONSNEST_LIVE_*` and legacy `MUSICSCALE_LIVE_*` environment variables;
- the modern local state path is `~/.millionsnest-live`, but an existing `~/.musicscale-live` state directory is reused automatically;
- browser pairing credentials migrate from IndexedDB `musicscale-live` to `millionsnest-live`;
- Node discovery serves `/.well-known/millionsnest-live-node` and keeps the legacy discovery route;
- federation accepts both **MillionsNest Live Node** and legacy **MusicScale Live Node** during rolling upgrades;
- installers stop/remove legacy auto-start entries before enabling the new executable.

## Deliberately stable internal identifiers

Persisted Firestore collection names such as `musicScaleLive*` and existing permission identifiers are not renamed as part of the visual/product rebrand. Renaming persisted schema is a separate migration and must only happen with dual-read/dual-write or an explicit data migration.

This prevents a cosmetic rename from causing tenant data loss, permission regressions or split-brain state.

## Native distribution names

New packages use:

- `MillionsNestLiveNode.exe` on Windows
- `MillionsNestLiveNode` on macOS/Linux
- artifact prefix `millionsnest-live-node-*`

## Repository slug

The connected GitHub integration does not expose repository-administration/rename permission. The current canonical slug therefore remains `prdanielcunha/musicscale-live` until repository administration is available. Product branding, runtime naming, Hosting and packages do not depend on the repository slug.
