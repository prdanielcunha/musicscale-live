# Phase 5 — Resolume Arena Tier A Gate

## Implemented in code

### Provider boundary
- Dedicated `@millionsnest/live-adapter-resolume`.
- Local/private-network REST endpoint policy.
- Resolume-specific response shapes remain inside the adapter.
- Domain/UI uses neutral Visual capabilities and provider routing.

### Runtime integration
- Resolume registers independently from Holyrics/ProPresenter.
- Visual routing is a distinct route group.
- Provider health and observed state are tracked independently.
- Local Node console exposes configuration/health outside normal Live operator complexity.
- WebSocket `/api/v1` transport listens for realtime Arena activity and uses it to invalidate/reconcile the authoritative REST composition state.
- Connected clip parameters discovered in composition state are subscribed once, so manual clip changes can wake Live without high-frequency full-state polling.
- REST remains the fallback if WebSocket is unavailable; realtime failure alone does not take the visual provider offline.
- Provider unregister/discovery cleanup disposes realtime sockets.

### Live UX integration
- Visual clips can be prepared/armed independently.
- Armed visual cue can execute together with presentation NEXT or a prepared Program cue through Scene execution.
- Partial execution is surfaced if one provider succeeds and another fails.
- Presentation operation does not collapse if Resolume is unavailable.

## Real-hardware verification still required
- Current supported Resolume Arena on Windows.
- Node + Arena same PC and separate-PC LAN.
- Holyrics PC → Arena PC → final LED/output.
- Composition/layer/column/clip state accuracy.
- Clip trigger/open-file behavior.
- Thumbnail and monitor snapshot behavior/performance.
- WebSocket/state reconciliation after manual Arena changes on real hardware/network. The code path and REST fallback are implemented; production behavior still needs physical Arena verification.
- Effects/parameters limited to officially exposed safe capabilities.
- Arena restart/reconnect and offline degradation.
- LAN latency under production network load.

## Exit gate
Phase 5 is production-ready when Live can coordinate a presentation provider and Resolume on separate computers, show independent health/state, execute linked visual actions, and keep the service operable when the visual provider is degraded or offline.
