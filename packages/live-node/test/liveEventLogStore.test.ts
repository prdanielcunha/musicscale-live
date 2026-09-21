import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LiveSessionEvent } from '@millionsnest/live-domain';
import { LiveEventLogStore } from '../src/liveEventLogStore';

function event(
  id: string,
  occurredAt: string,
  overrides: Partial<LiveSessionEvent> = {}
): LiveSessionEvent {
  return {
    id,
    correlationId: id,
    type: 'command.completed',
    occurredAt,
    source: 'live-node',
    organizationId: 'org_1',
    venueId: 'venue_1',
    liveSystemId: 'system_1',
    liveSessionId: 'session_1',
    actorId: 'actor_1',
    level: 'info',
    payload: {},
    ...overrides
  };
}

describe('LiveEventLogStore', () => {
  it('persists scoped events and returns newest first', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ms-live-events-'));
    const path = join(dir, 'events.json');
    const store = new LiveEventLogStore(path);

    await store.append(event('e1', '2026-09-21T10:00:00.000Z'));
    await store.append(event('e2', '2026-09-21T10:00:02.000Z'));
    await store.append(event('e3', '2026-09-21T10:00:01.000Z', {
      liveSessionId: 'session_2'
    }));

    const restored = new LiveEventLogStore(path);
    const results = await restored.list({
      organizationId: 'org_1',
      venueId: 'venue_1',
      liveSystemId: 'system_1',
      liveSessionId: 'session_1',
      limit: 10
    });

    expect(results.map(item => item.id)).toEqual(['e2', 'e1']);
    expect(await restored.count({
      organizationId: 'org_1',
      venueId: 'venue_1',
      liveSystemId: 'system_1',
      liveSessionId: 'session_1'
    })).toBe(2);
  });

  it('deduplicates IDs and bounds local retention', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ms-live-events-'));
    const path = join(dir, 'events.json');
    const store = new LiveEventLogStore(path, 3);

    await store.append(event('e1', '2026-09-21T10:00:01.000Z'));
    await store.append(event('e1', '2026-09-21T10:00:01.000Z'));
    await store.append(event('e2', '2026-09-21T10:00:02.000Z'));
    await store.append(event('e3', '2026-09-21T10:00:03.000Z'));
    await store.append(event('e4', '2026-09-21T10:00:04.000Z'));

    const results = await store.list({
      organizationId: 'org_1',
      venueId: 'venue_1',
      liveSystemId: 'system_1',
      limit: 10
    });

    expect(results.map(item => item.id)).toEqual(['e4', 'e3', 'e2']);
  });
});
