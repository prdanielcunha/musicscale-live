# MusicScale Live — Brand Contract

## Canonical product name

The product name is **MusicScale Live**.

This name is final for the product surface, installer, native Node, web app, documentation, support material, diagnostics and release artifacts.

**MillionsNest** remains the company/ecosystem and infrastructure namespace. It may appear where it identifies the publisher, Firebase project, corporate domain, package scope or service account, but it is not a second product name.

## Product architecture

**MusicScale** is the worship planning and preparation product.

**MusicScale Live** is its live-execution layer: it takes the prepared service into the room and coordinates presentation, visuals, stage, media, automation and future production providers through the local Live Node architecture.

Customer mental model:

`MusicScale → MusicScale Live → local providers / screens / production systems`

## Naming rules

Customer-facing surfaces use only:

- **MusicScale Live**
- **MusicScale Live Node**
- **MusicScale Live Studio**
- **MusicScale Live Setup**

Native distribution names use:

- `MusicScaleLiveNode.exe` on Windows
- `MusicScaleLiveNode` on macOS/Linux
- `MusicScaleLiveSetup.exe` for the Windows installer
- artifact prefix `musicscale-live-node-*`

The canonical local state/database/discovery identifiers use the `musicscale-live` name.

## Compatibility rule

Existing alpha installations must not be broken merely because branding was unified.

For a migration window the runtime may silently accept legacy environment variables, state paths, discovery routes, process names and local database identifiers. Those aliases are compatibility-only implementation details:

- they are never shown as a second product brand;
- new writes and new installations use the MusicScale Live canonical identifiers;
- cleanup/installers migrate or remove legacy entries safely.

Persisted Firestore collection names and existing permission identifiers are not cosmetically renamed without an explicit data migration. Schema stability takes priority over visual renaming.

## Infrastructure

The repository remains `prdanielcunha/musicscale-live`.

The Firebase project remains `millionsnest` because that is the shared corporate ecosystem project.

The official domain may remain under `millionsnest.com`; the page title, product UI, installer and support language identify the product as **MusicScale Live**.

## Decision principle

The customer should never need to wonder whether two different “Live” brands are separate products.

There is one product: **MusicScale Live**.
