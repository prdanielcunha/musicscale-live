# Zero-config onboarding and multi-computer discovery

This document records the product/engineering decision for the commercial onboarding path of MusicScale Live. It inherits the Blueprint v0.1 rules: LAN-first, provider-agnostic, multi-node, Human Layer, progressive disclosure and no single point of failure.

## Commercial setup contract

The normal customer path must not require:

- Git or repository access;
- PowerShell/Terminal commands;
- manually discovering an IPv4 address;
- typing ports;
- router/NAT configuration;
- exposing Holyrics, Resolume, ProPresenter or other providers directly to the internet.

Technical addresses remain available only under **Advanced** as a recovery/fallback path.

## First computer

1. The customer installs one signed Live Node on each computer that needs to communicate with local software or hardware.
2. The installer registers auto-start and the required Private-network firewall rules.
3. The local Node console opens automatically.
4. A tablet/phone connects by scanning the QR shown by the production computer.
5. Pairing is confirmed with an expiring PIN displayed physically on the target computer.
6. Provider credentials stay on that computer.

A user opening Live on the same production computer can ask Live to find the local Node automatically through loopback.

## Same-network requirement

For direct local operation, operator devices and production computers must be on the same local network. This may be Wi-Fi, Ethernet, or both on the same LAN.

Internet is **not** required for the prepared local operating path. Guest/client-isolated Wi-Fi can prevent local devices from reaching one another and should be diagnosed in human language.

Recommended customer copy:

> To control the service locally, keep this device and the production computers on the same local network — the same Wi-Fi or wired church network. Internet is not required during the service.

## Multi-computer discovery

Live Nodes advertise non-secret presence metadata on the local LAN using a short-lived multicast beacon.

- multicast group: `239.255.43.17`
- UDP port: `4318`
- HTTP Node port: `4317`
- multicast TTL: `1`
- discovery is best-effort; it never creates trust by itself.

A discovery beacon contains only product/protocol identity, Node ID, display name, HTTP port and version. The receiving Node derives the peer IP from the UDP packet source; it does not trust an advertised host.

Discovered Nodes expire quickly when beacons stop. Actual trust still requires the existing PIN pairing flow and environment/scope checks.

If multicast is blocked, the product stays functional and exposes manual local-address pairing under **Advanced**.

## Security boundary

Discovery is not authorization.

The sequence is:

`discover → identify candidate → request pairing → physically verify PIN → bind scope → authenticate future requests`

No provider token, user token, pairing token, cloud secret or organization secret is broadcast.

## UX rule

The customer-facing Studio should use human concepts:

- "Computer da Projeção"
- "Computador Visual"
- "Telão principal"
- "Transmissão"
- "Apps conectados"
- "Rede local pronta"

IP addresses, ports, Node IDs and transport internals belong in **Technical details / Advanced**.

## Provider onboarding

Providers remain capability-driven. The Node should auto-detect or prefill standard local endpoints where technically reliable, but it must not fake support or automate a provider through fragile UI scripting.

When a provider requires the user to enable an API/server or create a token, Live presents a short guided step and verifies the result immediately.

## Definition of Done for commercial onboarding

A release candidate is not commercially ready until all of these are true:

- Windows customer can install with a normal signed installer.
- No Git/PowerShell/Terminal is used in the happy path.
- Tablet/phone connects without typing an IP.
- A second production computer is discovered without typing an IP on a normal LAN.
- Guest/client-isolated network failure is explained in human language.
- Manual IP/port entry exists only as Advanced fallback.
- Internet-cut test keeps prepared local operation alive.
- Windows + iPad, Windows + Android and multi-PC physical tests pass.
- Installer/update binaries are signed and verified.
- Provider credentials use OS credential storage before public release.
- PT/EN/ES copy is complete.
