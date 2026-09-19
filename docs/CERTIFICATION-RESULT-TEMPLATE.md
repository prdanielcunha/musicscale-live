# MillionsNest Live — Certification Result

## Metadata

- Date:
- Tester:
- Commit / release:
- Live Node version:
- Scenario:
- Result: PASS / FAIL / BLOCKED

## Topology

- Computer A:
  - OS:
  - Network:
  - Provider/version:
- Computer B:
  - OS:
  - Network:
  - Provider/version:
- Tablet:
  - Model/OS:
  - Browser/PWA mode:
  - Network:
- Final output:
- Media-plane path:
- Provider routes:

## Preflight

- [ ] Node(s) online
- [ ] Provider(s) online
- [ ] ServicePlan cached
- [ ] ProviderLinks resolved
- [ ] No ambiguous critical route
- [ ] Manual provider fallback confirmed

## Functional results

| Test | Result | Observed state / notes |
| --- | --- | --- |
| Pairing QR/PIN |  |  |
| Music prepare + TAKE |  |  |
| Next |  |  |
| Previous |  |  |
| Bible |  |  |
| Clear / SAFE |  |  |
| Visual arm + linked TAKE |  |  |
| Provider manual change reconciliation |  |  |
| Provider offline isolation |  |  |
| Provider reconnect |  |  |
| Node restart |  |  |
| Internet-cut |  |  |
| Cloud recovery |  |  |
| Volunteer UX |  |  |

## Latency sample

| Metric | Samples | p50 | p95 | Target | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| UI feedback |  |  |  | <100 ms |  |
| Client → Node ACK |  |  |  | <150 ms |  |
| Node → provider command sent |  |  |  | <250 ms* |  |
| Linked TAKE |  |  |  | record baseline |  |
| Reconnect |  |  |  | record baseline |  |

\* Excluding provider-internal latency.

## Failures / divergences

For each failure:
- Timestamp:
- Action:
- Expected:
- Observed:
- Provider health:
- Route:
- Correlation ID:
- Recoverable:
- Manual fallback worked: yes/no
- Diagnostic export captured: yes/no

Do not paste credentials or provider tokens.

## Final decision

- [ ] PASS — gate criteria satisfied
- [ ] FAIL — regression/product defect
- [ ] BLOCKED — environment/hardware/provider prerequisite

### Follow-up
