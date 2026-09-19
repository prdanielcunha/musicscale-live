# Phase 3 — Live UX Production Gate

## Implemented in code

### Operator model
- Provider-neutral **NOW → NEXT → TAKE** deck.
- Program/current state comes from observed provider state rather than optimistic UI state.
- Prepared song, Bible and media cues share the same TAKE model.
- ServicePlan shows current and next service items.
- The UI warns when multiple presentation providers exist without an explicit route.

### Preview and TAKE
- Provider snapshot/preview is requested only when the routed provider exposes the capability.
- Prepared cues remain separate from Program until TAKE.
- An armed visual cue can be linked to the next presentation/program action.
- Linked TAKE executes presentation + visual actions through a Scene and reports partial failure rather than pretending atomic success.

### Safety
- Clear uses an armed/confirm interaction.
- Guarded and critical Scene/command paths require explicit confirmation at the Node.
- Critical actions remain policy-disabled unless explicitly enabled.
- Missing capabilities do not create fake controls.

### Input and responsiveness
- Keyboard previous/next shortcuts are available for operator workflows.
- The Live shell has mobile/tablet/desktop layouts and Local Recovery.
- PT/EN/ES strings are part of the Live application.

### Collaboration surfaces
- Request inbox/status flow exists locally.
- Scene bar and Scene Studio exist.
- Live provider health and routing state are visible to the operator.

## Validation still required
- First-time volunteer completes the normal flow without opening Studio.
- iPad/Android touch behavior and desktop keyboard workflow.
- No accidental TAKE/Clear under rapid operation.
- No layout shift over critical controls during reconnect/loading.
- Provider failure stays localized.
- Pastor/Conductor requests against a real active service.
- Real LAN latency for previous/next, prepared TAKE, linked presentation+Resolume TAKE and reconnect.
- WCAG AA baseline, text scaling and reduced-motion verification.

## Exit gate
Phase 3 is production-ready only when a new operator can run the principal service flow on a tablet without technical configuration, while failures and provider differences remain understandable and recoverable.
