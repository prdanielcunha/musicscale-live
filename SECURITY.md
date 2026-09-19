# Security Policy

MillionsNest Live is under active development and currently shares parts of the MillionsNest/MusicScale identity and data boundary.

## Reporting a vulnerability

Please do **not** open a public issue containing exploit details, credentials, tokens, private URLs, user data or reproduction steps that expose an active system.

Use a private channel with the repository owner/team instead. Public issues may be used only after sensitive details have been removed and the issue is safe to disclose.

## Repository rules

This repository must never contain:

- private keys or service-account JSON;
- provider access tokens;
- passwords or OAuth client secrets;
- production session cookies/tokens;
- private user/member data;
- diagnostic exports containing credentials.

Firebase web configuration is public client configuration and is not used as an authorization boundary. Authorization must remain enforced by Firebase Auth, tenant-aware RBAC, Firestore Rules/server-side checks, Node pairing policy and provider-local credentials.

## Current hardening items before stable release

- OS-native credential vault for provider secrets;
- signed Node installers and signed/verified auto-update;
- final Live cloud RBAC and Firestore Rules;
- real LAN/offline hardware certification;
- audit of remote-control enablement and recovery paths.
