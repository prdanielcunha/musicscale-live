import { describe, expect, it } from 'vitest';
import type { CommandResult, LiveCommand } from '@millionsnest/live-domain';
import { eventFromCommand, semanticEventType } from '../src/liveEventFactory';

function command(capability: LiveCommand['capability']): LiveCommand {
  return {
    id: 'cmd_1',
    correlationId: 'corr_1',
    organizationId: 'org_1',
    venueId: 'venue_1',
    liveSystemId: 'system_1',
    liveSessionId: 'session_1',
    serviceItemId: 'song:item_1',
    actorId: 'actor_1',
    origin: 'live-ui',
    capability,
    targetProviderIds: ['holyrics-primary'],
    outputTargets: ['main'],
    payload: { id: 'song_44', title: 'Promessas' },
    idempotencyKey: 'idem_1',
    createdAt: '2026-09-21T10:00:00.000Z',
    safetyLevel: 'normal'
  };
}

function result(accepted: boolean): CommandResult {
  return {
    commandId: 'cmd_1',
    providerInstanceId: 'holyrics-primary',
    accepted,
    latencyMs: 42,
    ...(accepted ? {} : { errorCode: 'provider_timeout', recoverable: true })
  };
}

describe('live event factory', () => {
  it('maps presentation capabilities into semantic session events', () => {
    expect(semanticEventType('songs.present')).toBe('song.presented');
    expect(semanticEventType('bible.present')).toBe('bible.presented');
    expect(semanticEventType('visual.clip.trigger')).toBe('visual.clip.triggered');
  });

  it('records planned successful actions without leaking arbitrary payload fields', () => {
    const value = eventFromCommand(
      { ...command('songs.present'), payload: { id: 'song_44', title: 'Promessas', secret: 'nope' } },
      [result(true)]
    );

    expect(value.type).toBe('song.presented');
    expect(value.level).toBe('info');
    expect(value.serviceItemId).toBe('song:item_1');
    expect(value.payload).toMatchObject({
      capability: 'songs.present',
      planned: true,
      adHoc: false,
      acceptedCount: 1,
      failedCount: 0,
      subject: {
        id: 'song_44',
        title: 'Promessas'
      }
    });
    expect((value.payload.subject as Record<string, unknown>).secret).toBeUndefined();
  });

  it('turns complete provider failure into an error event', () => {
    const value = eventFromCommand(command('bible.present'), [result(false)]);
    expect(value.type).toBe('command.failed');
    expect(value.level).toBe('error');
    expect(value.payload).toMatchObject({
      requestedEventType: 'bible.presented',
      failedCount: 1
    });
  });
});
